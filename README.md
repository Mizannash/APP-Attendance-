# KehadiranPro

Aplikasi kehadiran pekerja (worker attendance) — React Native 0.73 + **Hermes**,
Bahasa Malaysia UI, English code comments. Offline-first: AsyncStorage for data,
CSV export to the Downloads folder, WhatsApp share. Optional fourth tab sends the
day's records through a Cloudflare Worker to **DeepSeek** for a Malay summary.

```
Daftar (check-in / check-out) → Rekod (list + counters) → Eksport (CSV + share)
                                        └─→ Ringkasan AI (DeepSeek, optional, needs network)
```

---

## 1. Folder structure

```
KehadiranPro/
├── App.js                                  # root: Hermes check + bottom tabs
├── index.js                                # AppRegistry entry
├── app.json                                # app name / display name
├── package.json                            # exact, pinned dependency versions
├── babel.config.js                         # @react-native/babel-preset
├── metro.config.js                         # inlineRequires, no exotic flags
├── .eslintrc.js  .prettierrc.js  .gitignore
.github/
  └── workflows/
      ├── android-release.yml               signed AAB+APK on GitHub runners
      └── deploy-worker.yml                 Cloudflare Worker deploy
server/
  └── deepseek-proxy/
      ├── src/index.js                      Worker: DeepSeek proxy, auth, rate limit
      ├── dev-server.js                     run the Worker on localhost:8787
      ├── mock-deepseek.js                  fake DeepSeek (0 tokens) on :8899
      ├── .dev.vars.example                 local secrets template (git-ignored copy)
      ├── wrangler.toml                     non-secret config
      ├── package.json                      "type": "module"
      └── README.md                         deploy + localhost + API contract + cost
src/
  ├── theme.js                              colours, spacing, 16sp min type scale
  ├── config.js                             AI_PROXY_URL + APP key (no DeepSeek key!)
  ├── screens/
  │   ├── CheckIn.js                        Screen 1 — Daftar
  │   ├── Rekod.js                          Screen 2 — Rekod
  │   ├── Eksport.js                        Screen 3 — Eksport
  │   └── Ringkasan.js                      Screen 4 — Ringkasan AI (DeepSeek)
  ├── components/
  │   ├── AppButton.js                      # 56dp min-height action button
  │   ├── Card.js                           # white 12px-radius surface
  │   ├── JabatanPicker.js                  # in-house dropdown (no native dep)
  │   └── StatusBadge.js                    # Baik / Lewat pill
  └── utils/
      ├── storage.js                        # data layer (all rules live here)
      ├── ai.js                             # proxy client + payload builder
      └── date.js                           # zero-dep date/time formatting
├── scripts/
│   ├── verify-storage.js                   # 53 checks — data layer
│   ├── verify-ai.js                        # 45 checks — AI client
│   ├── verify-worker.js                    # 60 checks — Worker, in Node
│   └── release-check.sh                    # pre-flight gate
├── docs/
│   ├── DEPLOY.md                           runbook Play / Firebase / DeepSeek
│   ├── AISTUDIO.md                         prompt + acceptance tests for AI Studio
│   └── aistudio-prompt.txt                 the prompt as plain text to copy
├── android/
│   ├── build.gradle                        # SDK 34, minSdk 23, NDK
│   ├── gradle.properties                   # hermesEnabled=true  ← HERE
│   ├── settings.gradle
│   └── app/
│       ├── build.gradle                    # hermes-android, vector-icons fonts
│       └── src/main/
│           ├── AndroidManifest.xml         # storage perms, legacy ext storage
│           └── res/values/{strings,styles,colors}.xml
├── ios/
│   └── Podfile                             # :hermes_enabled => true
└── README.md
```

## 2. Install from scratch

The brief said `npx react-native init KehadiranPro`. **`react-native init` was
removed from the CLI in RN 0.75 and is deprecated from 0.73** — the supported
command today is:

```bash
npx @react-native-community/cli@latest init KehadiranPro --version 0.73.9
cd KehadiranPro
```

Then install exactly the pinned set (note the four extra packages the brief
omitted — without them the bottom tabs do not compile):

```bash
npm install \
  @react-native-async-storage/async-storage@1.23.1 \
  @react-navigation/native@6.1.17 \
  @react-navigation/bottom-tabs@6.5.20 \
  react-native-screens@3.30.1 \
  react-native-safe-area-context@4.9.0 \
  react-native-fs@2.20.0 \
  react-native-share@10.2.1 \
  react-native-vector-icons@10.0.3 \
  moment@2.30.1
```

```bash
# iOS
cd ios && pod install && cd ..
cd android && ./gradlew clean && cd ..   # optional but recommended after init
```

Now copy **this repo's files over the generated project** (the CLI generates the
native project; this repo supplies the app code plus the four native files that
carry the Hermes requirements: `android/gradle.properties`,
`android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`,
`ios/Podfile`).

### Android signing note

`android/app/build.gradle` reads `android/keystore.properties` if it exists and
otherwise falls back to the debug keystore, so `bundleRelease` never fails for a
missing keystore. Before publishing to Play, create a real upload key:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore android/app/kehadiranpro-release.keystore \
  -alias kehadiranpro -keyalg RSA -keysize 2048 -validity 10000
```

```properties
# android/keystore.properties   (git-ignored)
KEPASS_STORE_FILE=kehadiranpro-release.keystore
KEPASS_STORE_PASSWORD=********
KEPASS_KEY_ALIAS=kehadiranpro
KEPASS_KEY_PASSWORD=********
```

### Why `moment` is installed but never imported

`moment` is pinned in `package.json` because the brief listed it, but no file
imports it: Hermes + Android has incomplete `Intl`, and moment costs ~70 KB of
parsed JS on every cold start, which fights the <1.5 s target. `src/utils/date.js`
formats `HH:mm:ss` and `DD/MM/YYYY` directly from `Date` — identical output on
Hermes and JSC, no polyfill, no ICU. To drop ~70 KB from `node_modules` (it is
tree-shaken out of the bundle anyway):

```bash
npm uninstall moment
```

---

## 3. Hermes verification

### 3a. Static checks (the brief had one of these in the wrong file)

```bash
# TRUE: the flag lives in gradle.properties, not app/build.gradle
grep hermesEnabled android/gradle.properties        # -> hermesEnabled=true

# iOS
grep -n "hermes_enabled" ios/Podfile                # -> :hermes_enabled => true

# The engine dependency is actually wired into the app
grep -n "hermes-android" android/app/build.gradle   # -> implementation("com.facebook.react:hermes-android")
```

Putting `hermesEnabled=true` inside `android/app/build.gradle` does nothing —
the React Native Gradle plugin reads the Gradle **property**, so it must live in
`gradle.properties` (or be passed as `-PhermesEnabled=true`).

### 3b. Runtime check

`App.js` logs one of these on every start, before the first render:

```
Hermes ACTIVE
Hermes version: 0.12.0        (from global.HermesInternal.getRuntimeProperties())
```

Debug (Metro console or `adb logcat`):

```bash
npx react-native run-android
npx react-native log-android | grep -E "Hermes (ACTIVE|OFF)"
# or
adb logcat -s ReactNativeJS:V | grep Hermes
```

Release (no Metro attached — this is the check that matters):

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb logcat -c && adb shell am start -n com.kehadiranpro/.MainActivity
adb logcat -s ReactNativeJS:V | grep -E "Hermes (ACTIVE|OFF)"
```

If it prints `Hermes OFF`, in order of likelihood: `hermesEnabled` was edited in
the wrong file, `android/app/build.gradle` lost the `hermes-android`
dependency, or the Gradle cache still holds the JSC variant — `cd android &&
./gradlew clean` then rebuild.

### 3c. Prove the shipped bundle is real Hermes bytecode

A Hermes release bundle is **not** JavaScript; it starts with magic bytes
`c6 1f bc 03`. Unzip the APK and look:

```bash
unzip -p android/app/build/outputs/apk/release/app-release.apk \
  assets/index.android.bundle > /tmp/bundle.hbc
od -An -tx1 -N8 /tmp/bundle.hbc
# c6 1f bc 03 c1 03 19 1f      <- 0xC61FBC03 = HBC, 96 = bytecode version
node -e "console.log(require('fs').readFileSync('/tmp/bundle.hbc','utf8').slice(0,20))"
# garbage / binary, NOT "var __BUNDLE_START_TIME__"  => it is bytecode
```

If you see readable JS there, Hermes is not being used for that variant.

---

## 4. Release build

```bash
# Android App Bundle for Play Store
cd android && ./gradlew bundleRelease
# -> android/app/build/outputs/bundle/release/app-release.aab

# Universal APK for direct install / WhatsApp distribution
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk

# Smaller per-ABI APKs (arm64 for basically every phone sold since 2017)
cd android && ./gradlew assembleRelease -PenableSeparateApk=true
# -> app-arm64-v8a-release.apk  (~8-10 MB)
#    app-armeabi-v7a-release.apk
```

First build downloads Gradle + NDK and takes 10-20 minutes; later builds 2-4 min.

### APK size: Hermes vs JSC

Measured on the release JS in this repo (real numbers from `metro` + `hermesc`,
RN 0.73.9, hermesc 0.12.0):

| Artifact                                   | Size        |
| ------------------------------------------ | ----------- |
| `index.android.bundle` (minified JS)       | 1.13 MB     |
| `index.android.hbc` (Hermes bytecode, `-O`) | 1.73 MB     |

Bytecode is *larger on disk* than the minified JS (it carries the string table
and function headers) but it is parsed by mapping, not by a JS parser, so it is
much faster to start. The APK-level difference comes from the engine itself:

| Build                       | Universal APK (est.) | Per-ABI APK (est.) |
| --------------------------- | -------------------- | ------------------ |
| Hermes (`hermesEnabled=true`) | ~15-18 MB          | ~8-10 MB           |
| JSC (`hermesEnabled=false`)   | ~24-30 MB          | ~16-19 MB          |

JSC adds `libjavascriptcore.so` per ABI (~6-10 MB each) plus the JSC adapter;
Hermes adds `libhermes.so` (~1.5-2 MB per ABI) and a much smaller JIT-less VM.
Expect **≈8-12 MB smaller** for a universal APK, **≈7-9 MB** per ABI, and a cold
start improvement of roughly 30-50% on low-end hardware. Measure your own build
rather than trusting the table:

```bash
cd android && ./gradlew clean
./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk /tmp/hermes.apk
# flip the engine and repeat
sed -i 's/hermesEnabled=true/hermesEnabled=false/' gradle.properties
./gradlew clean assembleRelease
cp app/build/outputs/apk/release/app-release.apk /tmp/jsc.apk
ls -lh /tmp/hermes.apk /tmp/jsc.apk
sed -i 's/hermesEnabled=false/hermesEnabled=true/' gradle.properties   # restore
```

Cold-start measurement (release build, screen recording or `adb`):

```bash
adb shell am force-stop com.kehadiranpro
adb shell am start -W -n com.kehadiranpro/.MainActivity
# Look at "TotalTime" — target < 1500 ms on a mid-range device.
```

Also useful: `adb shell dumpsys meminfo com.kehadiranpro` (PSS target < 90 MB
after the tab screens have all been visited once).

---

## 5. Distribution

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the full runbook (Malay): upload
keystore, GitHub Actions secrets, Firebase App Distribution, Play internal
testing, and the Play "12 testers / 14 days" production gate.

Two things are automated in this repo:

- `.github/workflows/android-release.yml` — builds a signed AAB + APK on GitHub's
  runners (no Android SDK needed locally), fails the build if either artifact is
  not Hermes bytecode (`c61fbc03`), uploads artifacts, and optionally pushes to a
  Play track and/or Firebase App Distribution.
- `scripts/release-check.sh` (`npm run release:check`) — pre-flight gate: Hermes
  enabled, real keystore configured, tests + lint green, bundle compiles to
  bytecode.

### 5a. Direct APK

```bash
cd android && ./gradlew assembleRelease -PenableSeparateApk=true
adb install -r app/build/outputs/apk/release/app-arm64-v8a-release.apk
```

Send the `.apk` over WhatsApp / Drive / a USB cable. Recipients must allow
"Install unknown apps" for that source. Keep `versionCode` in
`android/app/build.gradle` increasing — Android refuses to downgrade, and two
APKs with the same versionCode but different signatures cannot overwrite each
other.

### 5b. Firebase App Distribution (testers, no Play review)

```bash
npm install -g firebase-tools
firebase login
firebase init appdistribution          # picks the Firebase Android app
cd android && ./gradlew assembleRelease
firebase appdistribution:distribute \
  app/build/outputs/apk/release/app-release.apk \
  --app 1:1234567890:android:abcdef123456 \
  --groups "penyelia" \
  --release-notes "KehadiranPro 1.0.0 — ujian lapangan"
```

Testers get an email, install the App Tester app, and updates arrive automatically.
Requires `google-services.json` only if you also use other Firebase products —
App Distribution itself only needs the App ID above.

### 5c. Google Play Store

```bash
cd android && ./gradlew bundleRelease     # .aab, not .apk
```

1. Play Console → Create app → name "KehadiranPro", default language **Malay**.
2. Play App Signing: upload the `.aab`; Google holds the app signing key, you
   keep the upload key (`keystore.properties` above). **Back that keystore up** —
   losing it means a support ticket to reset the upload key.
3. Store listing: at least 2 phone screenshots (1080×1920 is safe), a 512×512
   icon, a 1024×500 feature graphic, short description ≤ 80 chars.
4. Data safety form: this app stores data **only on the device**, collects
   nothing, and shares files only when the user taps Kongsi. Declare exactly that.
5. Content rating questionnaire → Everyone. Target API 34 (already set).
6. Internal testing → 20 testers → closed → production.

---

## 6. How the app behaves (the rules, and where they live)

| Rule | Implementation |
| --- | --- |
| Late after 08:30 | `date.js#isLate` compares seconds-since-midnight against 08:30:00. 08:30:00 = Baik, 08:30:01 = Lewat. |
| Block duplicate check-in | `storage.js#registerAttendance` walks the day's records for that worker (case- and whitespace-insensitive) and keeps the unmatched `masuk`; a second `masuk` returns `SUDAH_MASUK` → Alert. |
| Block orphan check-out | No unmatched `masuk` → `BELUM_MASUK` Alert. Check-out never creates a record on its own. |
| Empty input | Name under 2 characters → `NAMA_KOSONG`; the screen also refuses before calling storage. Nothing is written. |
| One key per day | `kehadiran_YYYY-MM-DD` → JSON array. `getRecordsByDate()` with no argument = today. |
| Corrupt data | `readRaw()` catches JSON errors, non-arrays, `null`, and filters records missing `name`/`type`/`timestamp`; every failure path returns `[]`. |
| CSV | `Nama,Jabatan,Jenis,Masa,Tarikh,Status`, CRLF, RFC 4180 quoting, UTF-8 BOM, oldest→newest. |
| Storage location | Tries `/storage/emulated/0/Download` first; on scoped-storage denial falls back to the app's documents dir and still shares fine. |

Screen 1 keeps the last three records visible so the operator gets immediate
visual confirmation; Screen 2 shows counters (Hadir / Lewat / Sudah Keluar) from
the same `summarise()` used by Screen 3, so the numbers can never disagree with
the CSV.

---

## 7. Tests

```bash
npm test              # all three suites -> 158 checks
npm run test:storage  # 53 checks — data layer
npm run test:ai       # 45 checks — AI client (stubbed fetch)
npm run test:worker   # 60 checks — Cloudflare Worker, run in Node
```

Local server (same Worker, no Cloudflare account):

```bash
npm run dev:ai:mock   # terminal 1 — fake DeepSeek on :8899, 0 tokens
npm run dev:ai        # terminal 2 — proxy on :8787
```

`scripts/verify-storage.js` loads the **real** `src/utils/storage.js` in Node
with in-memory stand-ins for AsyncStorage and react-native-fs and asserts the
business rules — no emulator, no Android SDK, no Jest config. It covers empty
input, late boundaries (08:30:00 / 08:30:01), duplicate check-in, orphan
check-out, re-check-in after check-out, corrupt JSON / wrong types / `null`,
counter maths, exact CSV bytes (BOM, CRLF, quoting), the Downloads→documents
fallback, and the date helpers.

`scripts/verify-ai.js` stubs `fetch` and exercises the real client: payload
grouping (case/whitespace-insensitive, earliest check-in, latest check-out),
refusing to call the network on an empty day, the `x-app-key` header, every
error branch mapped to a Malay message (401/429/5xx/unparseable), offline and
abort/timeout paths, and the share-sheet text.

`scripts/verify-worker.js` imports the Worker module (it only needs `fetch`,
`Request`, `Response`) and asserts auth, CORS/preflight, payload validation,
size and record caps, the JSON-mode retry when the model rejects
`response_format`, DeepSeek 401/429/timeout mapping, tolerance of fenced or
prose answers, and the per-IP rate limit. No Cloudflare account required.

### What was verified while building this repo

Run on the build machine (Node 26.7.0, Windows, no Android SDK/Java present —
so Gradle was **not** run here):

| Check | Command | Result |
| --- | --- | --- |
| Dependencies resolve at pinned versions | `node -p require('./node_modules/<pkg>/package.json').version` | all 11 exact |
| Release JS bundle builds (every import resolves, JSX compiles) | `node node_modules/react-native/cli.js bundle --platform android --dev false` | `index.android.bundle` 1,188,768 B |
| Bundle compiles to Hermes bytecode | `hermesc -emit-binary -O` | `index.android.hbc` 1,811,808 B, magic `c61fbc03`, HBC v96 |
| Business rules + AI client + Worker | `npm test` | 158/158 checks passed (53 + 45 + 60) |
| Lint (app + scripts + Worker) | `npm run lint` | clean |
| No `eval` / `new Function` / dynamic `require` in app code | grep + bundle scan | 0 / 0 / 0 |
| `moment` not in the shipped bundle | bundle string scan | only `onMomentumScroll*` matches — library absent |
| MaterialIcons glyph names used actually exist | checked against `glyphmaps/MaterialIcons.json` | all 11 present |

### Lint setup gotcha (npm 11)

`@react-native/eslint-config@0.73.2` pulls `@typescript-eslint/*@5`, which
crashes on TypeScript 7 modules (`Cannot read properties of undefined
(reading 'Any')`). npm 11 auto-installs peer dependencies at *latest*, so
`npm install` can silently land `typescript@7` and break `npm run lint`. That is
why `typescript: 5.3.3` is pinned in `devDependencies` — it is not used by the
app, only by the linter.


---

## 8. Future upgrades (in the order I would ship them)

1. **QR check-in** — `react-native-vision-camera` + `code-scanner`. Worker badge
   carries a static QR (`KP-<workerId>`); scanning skips the name field entirely
   and removes typo duplicates. Keep the manual form as a fallback (dirty or
   damaged badges are normal on a site).
2. **GPS capture** — `@react-native-community/geolocation` (or
   `react-native-geolocation-service` for better accuracy control) + a
   geofence check against the site's lat/lng with a 150-250 m radius. Store
   `lat`, `lng`, `accuracy` on the record; flag "Luar Kawasan" instead of
   blocking, so a worker inside a steel building is not locked out. Needs
   `ACCESS_FINE_LOCATION` + Play's location-permission declaration.
3. **Selfie verify** — `react-native-vision-camera` front camera, capture at
   640×480 (≈30-50 KB JPEG), store the path next to the record and include the
   filename in the CSV. Do **not** ship biometric face-matching: the Play
   policy and Malaysia's PDPA both make that a different conversation.
4. **Supabase sync** — `@supabase/supabase-js` with an `attendance` table
   (`id uuid pk, worker_name text, jabatan text, type text, recorded_at timestamptz,
   status text, device_id text`), unique index on `(worker_name, recorded_at)`
   for idempotent retries. Queue offline writes in AsyncStorage (a `pending`
   array), flush on app start and on connectivity change
   (`@react-native-community/netinfo`). Keep AsyncStorage as the source of truth
   for the current day so the app stays usable with no signal — which is the
   normal condition on a construction site.
5. **Monthly payroll report** — iterate `kehadiran_*` keys with
   `AsyncStorage.getAllKeys()`, group by worker and day, compute days present,
   late count, and hours between first `masuk` and last `keluar`; emit one CSV
   per month plus a per-worker summary sheet. Overtime needs a rule table
   (normal day / rest day / public holiday) — get that from HR before coding it.

Smaller things worth doing first: worker master list (so names are picked, not
typed), edit/void a record with an audit note, night-shift support (a shift that
crosses midnight must not bucket the check-out into the next day), and an
encrypted export if payroll leaves the device.
