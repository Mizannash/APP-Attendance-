# Deploy KehadiranPro — Play internal testing & Firebase App Distribution

Panduan ini untuk pilihan yang anda pilih: **kekalkan app React Native**, hantar
APK/AAB kepada tester melalui Firebase App Distribution (paling cepat) atau Play
internal testing (lebih rasmi).

Nota penting di awal: **Google AI Studio tidak boleh deploy app React Native.**
Ia hanya deploy web app (React + Node → Cloud Run) atau app Android Kotlin/Jetpack
Compose yang ia jana sendiri. Projek ini React Native, jadi host yang betul ialah
GitHub Actions (build) + Firebase/Play Console (edaran). Sebab itu semua langkah
di bawah tidak menyentuh AI Studio langsung.

---

## 0. Ringkasan pilihan

| Laluan | Masa | Sesuai untuk | Perlu akaun |
| --- | --- | --- | --- |
| Firebase App Distribution | ~15 min setup, build 12 min | tester lapangan, bos, penyelia — update automatik | Google + Firebase (percuma) |
| Play internal testing | ~1 jam (setup) | tester yang ada Google account, trek rasmi | Play Console (USD 25 sekali) |
| Play production | +14 hari | pekerja awam | Play Console + syarat closed test |

Kedua-duanya guna artifact yang sama dari workflow: `app-release.aab` dan
`app-release.apk`.

---

## 1. Setup sekali sahaja

### 1.1 Buat upload keystore

Play menolak build yang ditandatangani dengan debug key, dan jika anda tukar
keystore kemudian, tester tak boleh update app (signature mismatch). Buat sekali,
simpan selamat.

Android Studio membawa JDK sendiri — guna itu kalau `java` belum ada di PATH:

```bash
# Windows (git-bash). Android Studio: "C:\Program Files\Android\Android Studio\jbr\bin\keytool"
keytool -genkeypair -v -storetype PKCS12 \
  -keystore android/app/kehadiranpro-release.keystore \
  -alias kehadiranpro -keyalg RSA -keysize 2048 -validity 10000
```

```bash
cp android/keystore.properties.example android/keystore.properties
# isi KEPASS_STORE_PASSWORD / KEPASS_KEY_PASSWORD dengan password yang anda pilih
```

> Simpan `.keystore` + password dalam password manager DAN salinan offline.
> Hilang upload key bukan bencana (boleh reset melalui Play Console support),
> tetapi hilang app signing key selepas Play App Signing didayakan = app baharu.

### 1.2 Sediakan secrets untuk GitHub Actions

```bash
# base64 satu baris (jangan ada newline)
base64 -w0 android/app/kehadiranpro-release.keystore > /tmp/ks.b64    # Linux
base64 -i android/app/kehadiranpro-release.keystore | tr -d '\n' > /tmp/ks.b64   # macOS
base64 -w0 android/app/kehadiranpro-release.keystore > /tmp/ks.b64    # git-bash Windows
```

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Nilai |
| --- | --- |
| `KEYSTORE_BASE64` | isi `/tmp/ks.b64` |
| `KEYSTORE_PASSWORD` | password store |
| `KEY_ALIAS` | `kehadiranpro` |
| `KEY_PASSWORD` | password key |

Selepas itu padam `/tmp/ks.b64`.

### 1.3 Push repo

```bash
cd C:/Users/user/KehadiranPro
git init && git add -A && git commit -m "KehadiranPro 1.0.0"
git branch -M main
git remote add origin https://github.com/<akaun>/KehadiranPro.git
git push -u origin main
```

Nota: repo ini tiada `android/gradlew` (fail binary yang dijana oleh
`react-native init`). Workflow mengesan dan menjana wrapper 8.3 secara automatik,
jadi CI tetap berjalan. Untuk build tempatan, salin `gradlew`, `gradlew.bat` dan
folder `android/gradle/wrapper/` dari projek RN baharu.

---

## 2. Laluan A — Firebase App Distribution (disyorkan untuk mula)

Paling pantas: tester terima emel, pasang "App Tester", update masuk sendiri.

### 2.1 Sediakan Firebase

1. console.firebase.google.com → Add project (cth. `kehadiranpro`).
2. Add app → Android → package name **`com.kehadiranpro`** (mesti sama tepat
   dengan `applicationId` dalam `android/app/build.gradle`).
3. Salin **App ID** (`1:1234...:android:abcd...`) — itu `FIREBASE_APP_ID`.
4. App Distribution → tab **Testers & Groups** → buat group bernama `testers`,
   tambah emel tester.

### 2.2 Service account untuk CI

Google Cloud Console (projek Firebase yang sama) → IAM & Admin → Service Accounts
→ Create → nama `firebase-distributor` → Done. Kemudian:

- Klik service account → Keys → Add key → JSON → muat turun.
- IAM → grant peranan **Firebase App Distribution Admin** kepada emel service
  account itu.

```bash
# tampal seluruh kandungan JSON ke secret FIREBASE_SERVICE_ACCOUNT
# (Settings → Secrets → New repository secret)
```

### 2.3 Jalankan

GitHub → Actions → **Android Release** → Run workflow:

```
track: internal            (diabaikan jika tiada secret Play)
version_name: 1.0.0
distribute_firebase: true
release_notes: KehadiranPro 1.0.0 — ujian lapangan
```

Atau tag: `git tag v1.0.0 && git push origin v1.0.0` (tag push memerlukan
`FIREBASE_APP_ID` + `FIREBASE_SERVICE_ACCOUNT` untuk edaran automatik).

Tester menerima emel dalam ~1 minit selepas build siap.

---

## 3. Laluan B — Play internal testing

### 3.1 Sekali sahaja di Play Console

1. play.google.com/console → Create app: nama **KehadiranPro**, bahasa lalai
   **Bahasa Melayu**, jenis App, percuma.
2. Dashboard → **upload AAB pertama secara manual** (Setup → App bundle).
   Play Developer API **tidak boleh** mencipta release pertama — ini had Google,
   bukan had workflow. Selepas release pertama wujud, CI boleh upload release
   seterusnya.
3. Testing → Internal testing → Testers → tambah emel (max 100).

### 3.2 Benarkan CI upload

Google Cloud Console → IAM → Service Accounts → Create (`play-publisher`) →
Keys → JSON. Kemudian Play Console → **Users and permissions** → Invite users →
emel service account → akses: *Release to testing tracks* (+ *Release to
production* jika perlu) untuk app ini sahaja.

Secret `PLAY_SERVICE_ACCOUNT_JSON` = kandungan JSON itu. Selepas itu
`Run workflow` dengan `track: internal` akan upload sendiri.

### 3.3 Syarat naik ke production (akaun peribadi baharu)

Jika akaun Play anda didaftarkan selepas **13 Nov 2023** sebagai individu:

- Anda perlu **closed test** dengan **sekurang-kurangnya 12 tester yang opt-in
  tanpa putus selama 14 hari**, barulah boleh memohon akses production.
- **Internal testing tidak dikira** untuk syarat ini, dan tester mesti pasang
  dari pautan Play (bukan sideload APK).
- Selepas cukup syarat, Dashboard → **Apply for production**, semakan Google
  biasanya ≤ 7 hari.
- Akaun organisasi (bukan individu) tidak tertakluk pada syarat ini.

Jadi praktikalnya: guna Firebase App Distribution untuk kerja harian sekarang,
dan jalankan closed test serentak supaya jam 14 hari berjalan.

---

## 4. Versi & versionCode

Workflow menetapkan `versionCode = 1000 + nombor run` dan `versionName` dari
input. Play menolak versionCode yang sudah wujud pada mana-mana trek, jadi jangan
turunkan nilai itu; mula semula dari 1000 hanya jika app belum pernah dihantar.

Build tempatan:

```bash
cd android
./gradlew bundleRelease assembleRelease -PversionCode=1001 -PversionName=1.0.1
# AAB: app/build/outputs/bundle/release/app-release.aab
# APK: app/build/outputs/apk/release/app-release.apk
```

---

## 5. Sahkan Hermes pada peranti selepas install

```bash
adb logcat -c
adb shell am start -n com.kehadiranpro/.MainActivity
adb logcat -s ReactNativeJS:V | grep -E "Hermes (ACTIVE|OFF)"
# dijangka: Hermes ACTIVE
```

Workflow juga menyemak dua artifact: ia unzip `base/assets/index.android.bundle`
dari AAB dan `assets/index.android.bundle` dari APK, kemudian gagal build jika
magic bytes bukan `c61fbc03`. Jadi build yang lulus memang bytecode Hermes,
bukan tekaan.

---

## 6. Masalah lazim

| Gejala | Punca | Penyelesaian |
| --- | --- | --- |
| Play: "APK signed with debug key" | `keystore.properties` tiada / salah | Buat semula langkah 1.1, pastikan `KEPASS_STORE_FILE` wujud dalam `android/app/` |
| Play: "Version code N has already been used" | `versionCode` berulang | Naikkan `-PversionCode`; jangan ulang nombor run lama |
| CI: `Permission denied ./gradlew` | bit executable hilang | Workflow buat `chmod +x`; untuk tempatan: `chmod +x android/gradlew` |
| CI: `gradlew: not found` | wrapper tiada | Workflow jana sendiri; atau salin dari projek `react-native init` |
| CI: `KEYSTORE_BASE64 secret is not set` | secret belum ditambah | Tambah 4 secret signing (langkah 1.2) |
| Tester: "App not installed" | APK ditandatangani kunci lain daripada versi lama | Uninstall versi lama dahulu, atau sentiasa guna keystore yang sama |
| Teser tak terima emel Firebase | belum tambah dalam group `testers` | Firebase → App Distribution → Testers & Groups |
| Ikon tab kosong di release | `fonts.gradle` tidak di-apply | Semak `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")` |

---

## 7. Apa yang AI Studio boleh buat untuk projek ini (kemudian)

Bukan untuk deploy app ini, tetapi berguna nanti:

- **Gemini API key** (dari AI Studio) untuk ciri seperti ringkasan kehadiran
  bulanan dalam bahasa Melayu, atau pengesanan rekod luar biasa ("pekerja ini
  masuk 21 hari berturut-turut tanpa cuti"). Panggil dari server, bukan dari app,
  supaya kunci tidak boleh diekstrak dari APK.
- **Prototaip web** untuk pengurus: satu halaman React untuk lihat CSV yang
  dikongsi — itu boleh di-deploy ke Cloud Run melalui AI Studio kerana ia web app.

Untuk app pekerja itu sendiri, laluan tetap: GitHub Actions → Firebase/Play.

---

## 8. Ringkasan AI (DeepSeek) — pilihan, bukan wajib

Tab **Ringkasan** menghantar rekod hari ini ke Worker kita sendiri, yang
memanggil DeepSeek dan memulangkan ringkasan BM + amaran. App tetap berfungsi
tanpa ini: jika Worker belum disediakan, tab itu hanya menunjukkan nota setup.

### 8.1 Deploy Worker sekali

```bash
cd server/deepseek-proxy
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY     # sk-... dari platform.deepseek.com
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
npx wrangler secret put APP_SHARED_KEY       # tampal hasil arahan di atas
npx wrangler deploy
```

Atau biar CI buat: tambah secret `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID`, kemudian push apa-apa perubahan dalam
`server/deepseek-proxy/` — workflow **Deploy AI proxy** akan deploy sendiri.

### 8.2 Sambungkan ke app

```js
// src/config.js
const AI_PROXY_URL = 'https://kehadiranpro-ai.<subdomain>.workers.dev/ringkasan';
const AI_APP_KEY = '<APP_SHARED_KEY>';
```

Rebuild APK. Butang JANA RINGKASAN AI akan hidup hanya jika kedua-dua nilai itu
bukan placeholder.

### 8.3 Kos dan had

- `deepseek-flash` (model semasa; nama lama `deepseek-chat`/`deepseek-reasoner`
  sudah dimatikan 24 Julai 2026).
- Satu panggilan ≈ USD 0.0003 (peak 2×) ≈ RM0.001. Sebulan 22 hari kerja, satu
  panggilan sehari ≈ RM0.03. Tiga panggilan sehari pada waktu peak ≈ RM0.16.
- Cloudflare Workers free: 100k permintaan/hari, tanpa kad.
- Worker sendiri hadkan: 8 permintaan/minit/IP, 400 pekerja, 64 KB, dan bajet
  200k token/hari sebagai brek kecemasan.

### 8.4 Privasi (PDPA)

Nama, jabatan dan masa kehadiran dihantar ke DeepSeek untuk diproses. Skrin
menyatakan perkara ini sebelum butang ditekan, dan Worker tidak menyimpan data
(tiada KV/D1). Jika organisasi tidak membenarkan data pekerja keluar dari
Malaysia, buang `<Tab.Screen name="Ringkasan" .../>` dari `App.js` — tiada kod
lain perlu diubah.

### 8.5 Mod localhost (tanpa akaun Cloudflare)

Untuk uji sebelum deploy — Worker yang sama, dijalankan atas Node:

```bash
cd server/deepseek-proxy
node dev-server.js          # http://localhost:8787
```

Tanpa kunci DeepSeek pun ia berguna: semua pengesahan, had kadar dan pemetaan
ralat berjalan. Untuk laluan penuh tanpa makan kredit, jalankan mock:

```bash
node mock-deepseek.js       # terminal 1: http://localhost:8899
# .dev.vars
DEEPSEEK_BASE_URL=http://localhost:8899/chat/completions
node dev-server.js          # terminal 2
```

Sambungkan app:

| Peranti | AI_PROXY_URL dalam src/config.js |
| --- | --- |
| Emulator Android | `http://10.0.2.2:8787/ringkasan` |
| Telefon pada Wi-Fi sama | `http://<IP-komputer>:8787/ringkasan` |
| Ujian curl di komputer | `http://localhost:8787/ringkasan` |

Cleartext untuk `10.0.2.2`, `localhost` dan `127.0.0.1` sudah dibenarkan dalam
`android/app/src/main/res/xml/network_security_config.xml`. Untuk telefon
sebenar, tambah IP LAN komputer anda dalam fail itu (iOS pula perlu
`NSAllowsLocalNetworking` dalam Info.plist).

Semak ia hidup:

```bash
curl -s http://localhost:8787/
curl -s -X POST http://localhost:8787/ringkasan \
  -H 'content-type: application/json' \
  -H "x-app-key: $APP_SHARED_KEY" \
  -d '{"date":"20/10/2026","pekerja":[{"nama":"Ahmad","jabatan":"Operator","masuk":"08:12:00","keluar":"","status":"Baik"}],"ringkasan":{"hadir":1,"lewat":0,"sudah_keluar":0}}' | jq
```

### 8.6 Ujian tanpa akaun

```bash
npm run test:worker    # 57 semakan: auth, had saiz, retry JSON mode, ralat
npm run test:ai        # 45 semakan: payload, timeout, offline, semua kod ralat
```
