# KehadiranPro AI proxy (Cloudflare Worker → DeepSeek)

Worker kecil yang menerima rekod kehadiran harian dari app, menghantar satu
permintaan ke DeepSeek, dan memulangkan ringkasan Bahasa Malaysia + senarai
amaran. Kunci DeepSeek tinggal di sini (Cloudflare secret), **bukan** dalam APK.

```
app (Ringkasan.js)  --POST /ringkasan-->  Worker  --POST /chat/completions-->  api.deepseek.com
                     x-app-key header          Bearer DEEPSEEK_API_KEY
```

## Kos

Model `deepseek-flash`, harga off-peak USD 0.15 / 1M token input dan USD 0.60 /
1M output (peak = 2×). Satu panggilan ±700 token input + ±300 output:

| Penggunaan | Anggaran |
| --- | --- |
| 1 panggilan | USD 0.000285 (peak: 0.00057) ≈ RM0.0012 |
| 22 hari kerja × 1 panggilan (off-peak) | USD 0.0063 ≈ RM0.026 |
| 22 hari × 3 panggilan (peak) | USD 0.038 ≈ RM0.16 |

Cloudflare Workers free plan: 100,000 permintaan/hari, tanpa kad.

## Deploy (5 minit)

```bash
cd server/deepseek-proxy

# 1. log masuk (buka browser sekali)
npx wrangler login

# 2. kunci DeepSeek — dari platform.deepseek.com → API Keys
npx wrangler secret put DEEPSEEK_API_KEY

# 3. kunci kongsi untuk app (jana rentetan rawak panjang)
npx wrangler secret put APP_SHARED_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

# 4. deploy
npx wrangler deploy
# -> https://kehadiranpro-ai.<subdomain>.workers.dev
```

Selepas deploy, masukkan URL + kunci kongsi ke dalam app:

```js
// src/config.js
const AI_PROXY_URL = 'https://kehadiranpro-ai.<subdomain>.workers.dev/ringkasan';
const AI_APP_KEY = '<APP_SHARED_KEY yang sama>';
```

Kemudian rebuild app. Jika masih placeholder, skrin Ringkasan menunjukkan
"Pelayan AI belum disediakan" dan butang dimatikan.

## Uji dari terminal

```bash
curl -s https://kehadiranpro-ai.<subdomain>.workers.dev/ | jq

curl -s -X POST https://kehadiranpro-ai.<subdomain>.workers.dev/ringkasan \
  -H 'content-type: application/json' \
  -H "x-app-key: $APP_SHARED_KEY" \
  -d '{
    "date":"20/10/2026",
    "pekerja":[
      {"nama":"Ahmad bin Ali","jabatan":"Operator","masuk":"08:12:00","keluar":"17:05:30","status":"Baik"},
      {"nama":"Siti Nurhaliza","jabatan":"Pengawas","masuk":"08:41:00","keluar":"","status":"Lewat"}
    ],
    "ringkasan":{"hadir":2,"lewat":1,"sudah_keluar":1}
  }' | jq
```

Jawapan:

```json
{
  "ok": true,
  "ringkasan": "Seramai 2 pekerja hadir…",
  "amaran": ["Siti Nurhaliza belum mendaftar keluar."],
  "cadangan": "…",
  "model": "deepseek-flash",
  "json_mode": true,
  "usage": {"prompt_tokens": 320, "completion_tokens": 180, "total_tokens": 500}
}
```

## Kontrak API

| Laluan | Kaedah | Keterangan |
| --- | --- | --- |
| `/` | GET | health: nama servis + model + senarai laluan |
| `/ringkasan` | POST | ringkasan harian |

Header wajib: `x-app-key`. Badan: `{date, pekerja[], ringkasan{hadir,lewat,sudah_keluar}}`.

Kod ralat: `KUNCI_SALAH` (401), `TERLALU_KERAP` (429), `JSON_ROSAK` /
`DATA_TIDAK_SAH` / `TIADA_REKOD` (400), `TERLALU_BANYAK` / `TERLALU_BESAR` (413),
`DEEPSEEK_RALAT` (502), `MASA_TAMAT` / `PELAYAN_GAGAL` (504), `BAJET_HABIS` (429).

## Kawalan penyalahgunaan

- `APP_SHARED_KEY` boleh diekstrak dari APK — ia hanya penghalang kasar.
- 8 permintaan / minit / IP (per isolate, best effort).
- Maksimum 400 pekerja, 64 KB badan permintaan.
- `DAILY_TOKEN_BUDGET` (default 200,000 token/isolate/hari) menghentikan gelung
  tak terhingga yang boleh menghabiskan kredit DeepSeek.
- Pantau: `npx wrangler tail`, Cloudflare dashboard → Workers → Metrics.

## Nota privasi (PDPA)

Nama, jabatan dan masa kehadiran dihantar ke DeepSeek untuk diproses. Skrin
Ringkasan menyatakan perkara ini kepada pengguna sebelum butang ditekan. Worker
tidak menyimpan data (tiada KV/D1/R2) — ia hanya menyampaikan permintaan. Jika
organisasi mahu elak data pekerja keluar, matikan tab Ringkasan sepenuhnya:
keluarkan `<Tab.Screen name="Ringkasan" .../>` dari `App.js`.

## Ujian

Worker diuji tanpa akaun Cloudflare:

```bash
npm run test:worker     # 57 checks: auth, had saiz, retry JSON mode, semua ralat
```

## Mod localhost (tanpa deploy)

```bash
node dev-server.js      # http://localhost:8787  (Worker yang sama, atas Node)
node mock-deepseek.js   # http://localhost:8899  (DeepSeek palsu, 0 token)
```

Isi `.dev.vars` (salin dari `.dev.vars.example`, git-ignored). Untuk laluan penuh
tanpa kredit, tambah `DEEPSEEK_BASE_URL=http://localhost:8899/chat/completions`.

| Klien | URL |
| --- | --- |
| Emulator Android | `http://10.0.2.2:8787/ringkasan` |
| Telefon (Wi-Fi sama) | `http://<IP-komputer>:8787/ringkasan` |
| curl di komputer | `http://localhost:8787/ringkasan` |

Tanpa `DEEPSEEK_API_KEY` yang sah, permintaan tetap sampai ke DeepSeek dan
dipulangkan sebagai `DEEPSEEK_RALAT` / "Kunci DeepSeek tidak sah pada pelayan" —
itu membuktikan sambungan keluar berfungsi; hanya kunci yang tinggal.
