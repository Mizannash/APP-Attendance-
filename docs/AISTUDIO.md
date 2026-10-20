# KehadiranPro dalam Google AI Studio

Panduan ini untuk membina semula KehadiranPro menggunakan **Google AI Studio →
Build mode → Android**. Ia mengandungi prompt penuh yang boleh ditampal terus,
snippet rujukan untuk peraturan yang AI Studio selalu tersasar, senarai ujian
penerimaan, dan langkah publish.

---

## 0. Apa yang AI Studio boleh dan tidak boleh

| Perkara | AI Studio Build (Android) | Nota |
| --- | --- | --- |
| Terima repo/kod sedia ada | **Tidak** | Hanya prompt. Tiada "upload project". ZIP hanya untuk *eksport* keluar. |
| Jana app Android | Ya — Kotlin + Jetpack Compose | Klien sahaja (client-side only) |
| Preview | Emulator dalam browser | Berguna untuk ujian pantas |
| Deploy | Publish → Play **internal testing** (≤100 tester) atau install USB | Bukan listing awam |
| Production Play | Perlu akaun Play anda sendiri | AAB mesti ditandatangani dengan upload key anda |
| Simpan kunci API di pelayan | **Tidak** (app Android klien sahaja) | Guna Worker Cloudflare yang kita sudah bina |
| iOS | Tidak | AI Studio Android sahaja |

Maksudnya: projek React Native di `C:\Users\user\KehadiranPro` **tidak boleh**
dimasukkan ke AI Studio. Dua pilihan sebenar:

1. **Jana semula dalam AI Studio** (Kotlin/Compose) guna prompt di bawah — cepat,
   tetapi anda dapat kod baharu yang perlu diuji semula.
2. **Kekalkan app RN** yang sudah diuji (158 semakan) dan deploy melalui GitHub
   Actions → Firebase/Play.

Kedua-duanya sah. Prompt di bawah meniru kelakuan app RN itu supaya hasilnya
setara, bukan versi ringkas.

---

## 1. Prompt penuh (tampal dalam AI Studio Build → Android)

> Salin seluruh blok di bawah. Ia ditulis dalam bahasa Inggeris supaya model
> mematuhi struktur dengan lebih tepat; semua teks UI ditetapkan dalam Bahasa
> Malaysia dan mesti digunakan secara verbatim.

```
Build a native Android app called "KehadiranPro" (package com.kehadiranpro) with Kotlin and Jetpack Compose (Material 3). UI language: Bahasa Malaysia. Code comments: English. minSdk 24, targetSdk 34.

IMPORTANT: every quoted string below is user-visible UI copy. Reproduce it exactly, including punctuation and capitalisation. Never translate it, never reflow it, and never insert a line break inside a quoted string.

PURPOSE: worker attendance for a Malaysian construction site. One phone sits at the site entrance. Workers type their name, pick a department, and tap check-in or check-out. Everything is offline; the phone stores the day's records.

DEPENDENCIES: AndroidX core-ktx, activity-compose, compose BOM, material3, lifecycle-runtime-compose, kotlinx-coroutines-android. Do NOT add Retrofit, Room, Hilt or any networking/DI library. Use SharedPreferences + org.json for storage and HttpURLConnection for the one optional network call.

DATA MODEL

Record fields: id (String), name (String), jabatan (String), type ("masuk" or "keluar"), timestamp (ISO-8601 String), time ("HH:mm:ss"), date ("DD/MM/YYYY"), dateKey ("YYYY-MM-DD"), status ("Baik" or "Lewat").

Storage: SharedPreferences key "kehadiran_<dateKey>", value = JSON array of records. Sort by timestamp ascending when reading.

BUSINESS RULES (implement exactly)

1. Departments are exactly: Operator, Teknikal, Pengawas. Default Operator.
2. Trim the name and collapse inner whitespace. Identity is case-insensitive, so " ahmad  bin ali " and "Ahmad Bin Ali" are the same worker.
3. A check-in later than 08:30:00 gets status "Lewat". Exactly 08:30:00 is "Baik". 08:30:01 is "Lewat". Check-out records are always "Baik".
4. Duplicate check-in: if the worker already has a check-in today with no matching check-out, block it. AlertDialog title "Tidak Boleh Daftar Masuk", body "<nama> sudah mendaftar masuk pada <HH:mm:ss> dan belum mendaftar keluar. Sila tekan DAFTAR KELUAR dahulu." — replace <nama> and <HH:mm:ss> with the values of the open check-in.
5. Check-out without a check-in: AlertDialog title "Tidak Boleh Daftar Keluar", body "Tiada rekod masuk untuk <nama> hari ini. Sila tekan DAFTAR MASUK dahulu."
6. Name shorter than 2 characters: AlertDialog title "Nama Diperlukan", body "Sila masukkan nama pekerja sebelum mendaftar." Write nothing to storage.
7. After a successful save, show a confirmation dialog with the name, time and status, then clear the name field but keep the selected department.
8. Corrupt JSON, a non-array value, or a null in SharedPreferences must be treated as an empty list. Never crash. Skip entries missing name, type or timestamp.
9. Records are bucketed per calendar day, keyed by the device's local date.

SCREENS

Bottom navigation bar with 4 items. Minimum touch height 56dp, minimum text size 16sp, white cards with 12dp corner radius on a #f1f3f4 background, top app bar #1a73e8 with white text.

Tab 1 "Daftar" (icon: check_circle)
- Live clock "HH:mm:ss" and date "DD/MM/YYYY" in a blue card, plus the caption "Waktu masuk standard: 08:30 pagi. Selepas itu ditanda LEWAT."
- OutlinedTextField labelled "Nama Pekerja" with placeholder "Contoh: Ahmad bin Ali".
- Department dropdown labelled "Jabatan" with the three options, 56dp rows.
- Two full-width buttons, 56dp tall, 18sp bold: "DAFTAR MASUK" in green #1e8e3e, then "DAFTAR KELUAR" in red #d93025.
- If the typed name matches a worker who is still checked in, show an info box reading "<nama> sudah masuk pada <HH:mm:ss> dan belum keluar."
- Below the form, a section "Aktiviti Terkini" listing the last three records with a status badge.

Tab 2 "Rekod" (icon: list)
- One card with three counters: "Hadir", "Lewat", "Sudah Keluar". Hadir = distinct workers checked in today. Lewat = number of late check-ins. Sudah Keluar = distinct workers with a check-out.
- LazyColumn of today's records, newest first. Each row shows the name, the line "<jabatan> · Masuk · <HH:mm:ss>" for check-ins (use "· Keluar ·" for check-outs), a rounded badge "Baik" in green or "Lewat" in red, and the record date.
- Empty state: title "Tiada rekod hari ini", body "Tekan tab Daftar untuk merekod kehadiran pekerja."

Tab 3 "Eksport" (icon: download)
- Button "EKSPORT CSV".
- Write a file named kehadiran_<dateKey>.csv. On API 29+ use MediaStore.Downloads so it lands in the public Downloads folder; on older versions use the app-specific external files directory.
- CSV content: first line exactly "Nama,Jabatan,Jenis,Masa,Tarikh,Status". Then one row per record, oldest first, with Jenis = "Masuk" for check-ins and "Keluar" for check-outs. Line endings CRLF. RFC 4180 quoting: if a value contains a comma, a double quote or a newline, wrap the whole value in double quotes and double any inner double quote. Start the file with a UTF-8 BOM (bytes EF BB BF) so Excel renders Malay text correctly.
- If there are no records, show AlertDialog title "Eksport Gagal" and body "Tiada rekod untuk dieksport pada tarikh ini." and write no file.
- After a successful write, show the file name and a button "KONGSI (WhatsApp)" that shares the file as a FileProvider content Uri through Intent.ACTION_SEND with type text/csv. If WhatsApp is installed set the package to com.whatsapp, otherwise fall back to the system share sheet.
- Declare the FileProvider in AndroidManifest.xml with authority "${applicationId}.fileprovider" and a matching res/xml/file_paths.xml.

Tab 4 "Ringkasan AI" (icon: auto_awesome) — OPTIONAL network feature
- Show today's counters, then a button "JANA RINGKASAN AI".
- On tap, POST JSON with HttpURLConnection to AI_PROXY_URL, header "x-app-key" set to AI_APP_KEY. Body shape: {"date":"DD/MM/YYYY","pekerja":[{"nama":"...","jabatan":"...","masuk":"HH:mm:ss","keluar":"HH:mm:ss or empty","status":"Baik or Lewat"}],"ringkasan":{"hadir":0,"lewat":0,"sudah_keluar":0}}. Emit one pekerja entry per worker: earliest check-in time, latest check-out time (empty string when absent), and the status of that check-in.
- Parse the reply {"ok":true,"ringkasan":"...","amaran":["..."],"cadangan":"..."} and render the summary paragraph, a "Perlu perhatian" list of warnings, then "Cadangan". Add a button "KONGSI RINGKASAN" that shares the text.
- AI_PROXY_URL and AI_APP_KEY are compile-time constants at the top of the file, both placeholders. NEVER put a DeepSeek, OpenAI or Gemini API key inside the app.
- Failure copy, all in Bahasa Malaysia: no connectivity shows "Tiada sambungan internet. Ringkasan AI memerlukan data mudah alih atau Wi-Fi." A 30 second timeout shows "Pelayan mengambil masa terlalu lama. Cuba lagi." Any other failure shows the server's message field when present, otherwise "Pelayan AI memulangkan ralat."
- Always show the note "Nota privasi: nama, jabatan dan masa kehadiran hari ini dihantar ke pelayan DeepSeek untuk diproses. Tiada data disimpan di pelayan selepas jawapan dipulangkan."
- Disable the button when there are no records for today.

QUALITY REQUIREMENTS

- No crashes on empty input, rapid double taps, or corrupt stored JSON.
- Wrap every storage read and write in try/catch and degrade to an empty list or a Malay error message.
- Disable both action buttons while a save is in flight, so one tap produces exactly one record.
- Keep the app in a small number of files: MainActivity.kt, ui/CheckInScreen.kt, ui/RekodScreen.kt, ui/EksportScreen.kt, ui/RingkasanScreen.kt, data/AttendanceStore.kt, data/AttendanceRules.kt, util/Csv.kt, util/Dates.kt.
- Add a short README in the project explaining how to change AI_PROXY_URL and AI_APP_KEY.
```

---

## 1b. Prompt B — versi web (kalau anda pilih Cloud Run, bukan Android)

Build mode AI Studio menjadikan **web app** sebagai lalai, dan itu satu-satunya
jenis yang boleh di-deploy satu klik ke Cloud Run. Kalau pekerja ada telefon
dengan pelayar dan anda mahu satu URL dikongsi (bukan APK), guna prompt ini.
Ingat: web app bermaksud data tersimpan dalam pelayar pekerja itu sendiri —
sesuai untuk demo/pengurus, tidak sesuai untuk satu telefon di pintu tapak.

```
Build a responsive React + TypeScript web app called KehadiranPro (Vite), UI in
Bahasa Malaysia, mobile-first (assume a 360x640 phone screen, 16px minimum text,
56px minimum tap targets), brand blue #1a73e8 and white cards with 12px radius.

Features:
1. Tab "Daftar": name input, department select (Operator/Teknikal/Pengawas),
   buttons "DAFTAR MASUK" (green) and "DAFTAR KELUAR" (red), a live HH:mm:ss
   clock and DD/MM/YYYY date. Check-in after 08:30:00 is stored with status
   "Lewat" (08:30:00 exactly is "Baik"). Block a second check-in while the worker
   has no check-out, and block a check-out with no check-in, showing these exact
   Bahasa Malaysia messages: "<nama> sudah mendaftar masuk pada <masa> dan belum
   mendaftar keluar." / "Tiada rekod masuk untuk <nama> hari ini."
2. Tab "Rekod": today's records newest first with a green "Baik" / red "Lewat"
   badge, counters Hadir / Lewat / Sudah Keluar, and empty state
   "Tiada rekod hari ini".
3. Tab "Eksport": download a CSV named kehadiran_YYYY-MM-DD.csv with the exact
   header "Nama,Jabatan,Jenis,Masa,Tarikh,Status", UTF-8 BOM, CRLF, RFC 4180
   quoting, oldest first; plus a "KONGSI (WhatsApp)" button that uses the Web
   Share API with the file when supported and falls back to the CSV download.
4. Tab "Ringkasan AI": POST today's compact records to AI_PROXY_URL with header
   "x-app-key" and show the returned ringkasan/amaran/cadangan in Bahasa
   Malaysia; show "Tiada sambungan internet..." on failure. No API keys in the
   client.
Persistence: localStorage key "kehadiran_YYYY-MM-DD" holding a JSON array; a
corrupt value must be treated as empty, never throw. Wrap all storage access in
try/catch. Names are trimmed, inner spaces collapsed, and compared
case-insensitively. Use only React + TypeScript + plain CSS — no UI kit, no
state library. Split into src/App.tsx, src/screens/{CheckIn,Rekod,Eksport,
Ringkasan}.tsx, src/lib/{storage,date,csv,ai}.ts.
```

Selepas itu: **Publish → Deploy to Cloud Run** memberi anda URL awam. Itu laluan
yang betul untuk demo web; untuk app pekerja, kekalkan APK.

---

## 2. Snippet rujukan (kalau AI Studio tersasar)

Ini bahagian yang paling kerap salah dalam kod yang dijana. Tampal ke dalam
editor AI Studio jika perlu.

> Nota jujur: mesin ini tiada JDK, jadi snippet Kotlin ini **tidak dikompil**.
> Ia rujukan logik yang ditulis daripada kod JS yang sudah diuji (158 semakan);
> pengesahan sebenar ialah senarai ujian di bahagian 3.

```kotlin
// util/Dates.kt
private const val LATE_LIMIT_SECONDS = 8 * 60 * 60 + 30 * 60 // 08:30:00

fun formatTime(cal: Calendar): String = String.format(
    Locale.US, "%02d:%02d:%02d",
    cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), cal.get(Calendar.SECOND))

fun formatDate(cal: Calendar): String = String.format(
    Locale.US, "%02d/%02d/%04d",
    cal.get(Calendar.DAY_OF_MONTH), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.YEAR))

fun dateKey(cal: Calendar): String = String.format(
    Locale.US, "%04d-%02d-%02d",
    cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))

fun secondsSinceMidnight(cal: Calendar): Int =
    cal.get(Calendar.HOUR_OF_DAY) * 3600 + cal.get(Calendar.MINUTE) * 60 + cal.get(Calendar.SECOND)

// Strictly after 08:30:00 is late; 08:30:00 exactly is on time.
fun isLate(cal: Calendar): Boolean = secondsSinceMidnight(cal) > LATE_LIMIT_SECONDS

fun normalizeName(raw: String): String = raw.trim().replace(Regex("\\s+"), " ")
fun nameKey(raw: String): String = normalizeName(raw).lowercase(Locale.ROOT)
```

```kotlin
// data/AttendanceRules.kt — the duplicate check is the piece AI Studio gets wrong
data class WorkerState(val openCheckIn: Record?, val lastRecord: Record?)

fun workerState(records: List<Record>, name: String): WorkerState {
    val wanted = nameKey(name)
    if (wanted.isEmpty()) return WorkerState(null, null)
    var open: Record? = null
    var last: Record? = null
    records.sortedBy { it.timestamp }.forEach { r ->
        if (nameKey(r.name) != wanted) return@forEach
        last = r
        open = when (r.type) {
            "masuk" -> r          // unmatched check-in
            else -> null          // check-out closes it
        }
    }
    return WorkerState(open, last)
}

sealed class SaveResult {
    data class Ok(val record: Record) : SaveResult()
    data class Blocked(val code: String, val message: String) : SaveResult()
}

fun register(
    records: List<Record>, rawName: String, jabatan: String, type: String, now: Calendar
): SaveResult {
    val name = normalizeName(rawName)
    if (name.length < 2) return SaveResult.Blocked(
        "NAMA_KOSONG", "Sila masukkan nama pekerja (sekurang-kurangnya 2 huruf).")
    val state = workerState(records, name)
    if (type == "masuk" && state.openCheckIn != null) return SaveResult.Blocked(
        "SUDAH_MASUK",
        "\"$name\" sudah mendaftar masuk pada ${state.openCheckIn!!.time} dan belum " +
            "mendaftar keluar.\n\nSila tekan DAFTAR KELUAR dahulu.")
    if (type == "keluar" && state.openCheckIn == null) return SaveResult.Blocked(
        "BELUM_MASUK",
        "Tiada rekod masuk untuk \"$name\" hari ini.\n\nSila tekan DAFTAR MASUK dahulu.")
    val record = Record(
        id = System.currentTimeMillis().toString(36) + "-" + (1000..9999).random(),
        name = name, jabatan = jabatan, type = type,
        timestamp = now.time.toString(), time = formatTime(now), date = formatDate(now),
        dateKey = dateKey(now),
        status = if (type == "masuk" && isLate(now)) "Lewat" else "Baik")
    return SaveResult.Ok(record)
}
```

```kotlin
// util/Csv.kt — exact header, CRLF, RFC 4180, BOM
private const val HEADER = "Nama,Jabatan,Jenis,Masa,Tarikh,Status"

fun csvCell(value: String?): String {
    val text = value ?: ""
    return if (text.contains(',') || text.contains('"') ||
        text.contains('\n') || text.contains('\r'))
        "\"" + text.replace("\"", "\"\"") + "\""
    else text
}

fun buildCsv(records: List<Record>): String {
    val sb = StringBuilder()
    sb.append(HEADER).append("\r\n")
    records.sortedBy { it.timestamp }.forEach { r ->
        sb.append(csvCell(r.name)).append(',')
          .append(csvCell(r.jabatan)).append(',')
          .append(if (r.type == "masuk") "Masuk" else "Keluar").append(',')
          .append(csvCell(r.time)).append(',')
          .append(csvCell(r.date)).append(',')
          .append(csvCell(r.status)).append("\r\n")
    }
    return sb.toString()
}

fun csvBytes(records: List<Record>): ByteArray =
    byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + buildCsv(records).toByteArray()
```

```kotlin
// data/AttendanceStore.kt — defensive read
fun read(prefs: SharedPreferences, dayKey: String): List<Record> = try {
    val raw = prefs.getString("kehadiran_$dayKey", null) ?: return emptyList()
    val arr = JSONArray(raw)
    (0 until arr.length()).mapNotNull { i ->
        arr.optJSONObject(i)?.let { o ->
            val name = o.optString("name")
            val type = o.optString("type")
            if (name.isEmpty() || (type != "masuk" && type != "keluar")) return@let null
            Record(
                id = o.optString("id"), name = name, jabatan = o.optString("jabatan"),
                type = type, timestamp = o.optString("timestamp"),
                time = o.optString("time"), date = o.optString("date"),
                dateKey = o.optString("dateKey"), status = o.optString("status"))
        }
    }.sortedBy { it.timestamp }
} catch (e: Exception) {
    emptyList()   // corrupt JSON, wrong type, anything -> empty, never crash
}
```

---

## 3. Ujian penerimaan (jalankan pada emulator AI Studio)

App yang dijana belum boleh dipercayai sehingga semua ini lulus:

| # | Ujian | Jangkaan |
| --- | --- | --- |
| 1 | Tap DAFTAR MASUK dengan nama kosong | Dialog "Nama Diperlukan", tiada rekod |
| 2 | Nama "A", jabatan Operator, DAFTAR MASUK | Dialog "Nama Diperlukan" (kurang 2 huruf) |
| 3 | Daftar masuk 08:12 | Status Baik, tab Rekod hijau |
| 4 | Tukar jam peranti ke 08:31, daftar masuk pekerja lain | Status Lewat, badge merah |
| 5 | Jam peranti tepat 08:30:00, daftar masuk | Status Baik (BUKAN Lewat) |
| 6 | Daftar masuk "Ahmad", kemudian daftar masuk " ahmad  bin ali " | Ditahan, mesej sebut masa masuk pertama |
| 7 | DAFTAR KELUAR untuk pekerja yang belum masuk | Ditahan "belum mendaftar masuk hari ini" |
| 8 | Daftar masuk → keluar → masuk semula | Berjaya (rekod baharu dibenarkan) |
| 9 | Tap DAFTAR MASUK dua kali pantas | Hanya SATU rekod |
| 10 | Tab Rekod tanpa rekod | "Tiada rekod hari ini" |
| 11 | Tab Eksport tanpa rekod | Dialog "Tiada rekod untuk dieksport" |
| 12 | Eksport 2 rekod, buka fail dalam Excel/Sheets | Header tepat, huruf BM tidak rosak, nama dengan koma dalam tanda petik |
| 13 | Kongsi CSV | WhatsApp terbuka dengan lampiran (atau share sheet) |
| 14 | Matikan data/Wi-Fi, tap JANA RINGKASAN AI | "Tiada sambungan internet..." — app tidak crash |
| 15 | Worker AI belum dikonfigurasi | Butang AI dimatikan atau mesej setup, bukan crash |
| 16 | Tutup app, buka semula | Rekod hari ini masih ada |

Kalau ada yang gagal, jangan tampal semula seluruh prompt — beri AI Studio satu
pembetulan pada satu masa:

```
Fix only the CSV export: the file must start with a UTF-8 BOM (bytes EF BB BF),
end each line with CRLF, and wrap values containing commas in double quotes while
doubling inner quotes. Do not change any other behaviour.
```

---

## 4. Publish dari AI Studio

1. **Settings → Publish** dalam AI Studio.
2. AI Studio tandatangan build, cipta/naik taraf listing, dan muat naik ke trek
   **internal testing** (maksimum 100 tester). Akaun Play Developer diperlukan.
3. Tambah emel tester di Play Console → Testing → Internal testing.
4. Tester pasang melalui pautan Play (bukan sideload), kemudian sahkan Hermes…
   tidak berkenaan di sini: app Kotlin tidak guna Hermes. Yang perlu disahkan
   ialah versi yang dipasang sepadan dengan build terbaru.
5. Untuk **production**: buka Play Console di bawah akaun anda, tambah bundle
   itu ke release production, dan jalankan syarat yang sama seperti panduan RN
   (`docs/DEPLOY.md` §3.3): akaun peribadi baharu perlu closed test 12 tester
   selama 14 hari.

Had penting: publish satu klik AI Studio berhenti di internal testing. Listing
awam, harga, data safety form dan pengesahan production tetap kerja anda di Play
Console.

---

## 5. Sambung ke Worker DeepSeek yang sudah ada

App Kotlin ini klien sahaja, jadi ia tidak boleh menyimpan kunci DeepSeek. Guna
Worker yang kita bina:

```
AI_PROXY_URL = "https://kehadiranpro-ai.<subdomain>.workers.dev/ringkasan"
AI_APP_KEY   = "<APP_SHARED_KEY>"
```

Untuk ujian pada emulator sebelum deploy, jalankan `npm run dev:ai` di komputer
dan guna `http://10.0.2.2:8787/ringkasan` (Android membenarkan cleartext ke
10.0.2.2 hanya jika `usesCleartextTraffic="true"` atau network security config
dibenarkan — AI Studio mungkin tidak menambahnya, jadi deploy Worker dahulu jika
mahu elak ubah manifest).

Kontrak penuh ada dalam `server/deepseek-proxy/README.md`.

---

## 6. Mana satu patut anda pilih?

| | AI Studio (Kotlin/Compose) | App RN dalam repo ini |
| --- | --- | --- |
| Masa ke app berjalan | ~30 minit dari prompt | Sudah siap |
| Diuji | Anda perlu uji sendiri (16 ujian di atas) | 158 semakan automatik lulus |
| Kod anda kuasai | Dijana semula setiap kali prompt berubah | Fail penuh dalam repo |
| CSV ke Downloads + WhatsApp | Perlu MediaStore + FileProvider | Sudah berfungsi |
| Deploy | Publish AI Studio → internal testing | GitHub Actions → Firebase/Play |
| iOS | Tidak | Ya (Podfile Hermes sedia) |

Cadangan saya: guna AI Studio jika matlamatnya **prototaip cepat untuk tunjuk
kepada klien minggu ini**. Guna app RN ini jika matlamatnya **app yang dipasang
pekerja dan diuji** — kerana ia sudah melalui 158 semakan, CSV sebenar, dan
laluan deploy yang disediakan.
