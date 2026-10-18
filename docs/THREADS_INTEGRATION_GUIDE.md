# Panduan Integrasi Threads — Langkah demi Langkah

Panduan ini mengubah status "belum terhubung" menjadi akun Threads yang siap memublikasikan,
dengan verifikasi di setiap langkah. Total waktu ±20 menit.

> **Penting:** pendaftaran app Meta memerlukan akun Meta for Developers dan verifikasi.
> Jika Anda tidak memiliki akses ke Meta for Developers, integrasi Threads **tidak dapat**
> diselesaikan dan statusnya tetap `NOT_TESTED`. Jangan mengklaim terhubung sebelum
> langkah 6 dan 7 benar-benar lulus.

---

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Akun Instagram/Threads | Akun yang akan dipakai memublikasikan |
| Akun Meta for Developers | https://developers.facebook.com — gratis |
| URL HTTPS publik | Untuk OAuth redirect. `localhost` **ditolak** Meta |

### Membuat URL HTTPS untuk pengujian lokal

Meta mewajibkan redirect URI HTTPS yang dapat diakses publik. Untuk lokal, gunakan tunnel:

```bash
# Pilih salah satu
cloudflared tunnel --url http://localhost:3939      # tanpa akun, acak
ngrok http 3939                                     # butuh akun gratis
```

Catat URL yang muncul, misalnya `https://abc-def.trycloudflare.com`.

> Kredensial **tidak** diisi di `.env`. Semuanya ditempel di halaman **Threads Integration**
> dan disimpan terenkripsi di database. Hanya butuh satu kali restart, dan itu bukan karena
> konfigurasi kredensial. (Variable `.env` masih didukung untuk deployment headless, tapi
> bukan jalur yang direkomendasikan.)

---

## Langkah 1 — Buat app di Meta for Developers

1. Buka https://developers.facebook.com/apps → **Create App**
2. Pilih use case **Threads** (bukan "Consumer" atau "Business")
3. Isi nama app, misalnya `CeritaLab AI`, lalu **Create**

## Langkah 2 — Tambahkan produk Threads API

1. Di dashboard app, cari **Threads API** → **Set up**
2. Buka **Use cases → Customize** dan pastikan scope berikut tersedia:
   - `threads_basic` — baca profil sendiri
   - `threads_content_publish` — buat & publikasikan postingan
   - `threads_manage_insights` — baca metrik (untuk analitik)

Scope minimum agar bisa menerbitkan adalah `threads_basic` + `threads_content_publish`.
Aplikasi ini secara sengaja **tidak meminta** scope yang tidak dipakai.

## Langkah 3 — Daftarkan Redirect URI

1. Masuk ke **Threads API → Settings** (atau *Valid OAuth Redirect URIs*)
2. Tambahkan: `https://<domain-tunnel-anda>/api/threads/callback`
3. **Harus cocok karakter demi karakter** — protokol, host, path, tanpa trailing slash

> Kesalahan paling umum: `http` vs `https`, atau `localhost` alih-alih domain tunnel.
> Ketidakcocokan menghasilkan `redirect_uri_mismatch` saat callback.

## Langkah 4 — Ambil App ID dan App Secret

1. **App settings → Basic**
2. Salin **App ID** dan **App Secret**

## Langkah 5 — Isi `.env` dan restart

Buka `http://localhost:3939/threads` → bagian **Kredensial App Meta**, lalu tempel:

| Kolom | Nilai |
|---|---|
| App ID | dari Meta → App settings → Basic |
| App Secret | dari Meta → App settings → Basic |
| Redirect URI | `https://<domain-tunnel-anda>/api/threads/callback` |

Klik **Simpan kredensial**. Tidak perlu edit file apa pun, dan **tidak perlu restart**.

### Verifikasi langkah 5

```bash
curl -s http://localhost:3939/api/threads/app-config | jq '.data'
```

Harapan:

```json
{ "appIdMask": "1234…5678", "hasSecret": true,
  "redirectUri": "https://.../api/threads/callback", "source": "database" }
```

`source: "database"` berarti konfigurasi berasal dari halaman web. `appIdMask` menampilkan
ID dalam bentuk tersamarkan. **App Secret tidak pernah dikembalikan** oleh endpoint ini.
Jika `hasSecret` masih `false`, klik Simpan sekali lagi.

> **Keamanan:** App Secret disimpan dengan AES-GCM di kolom `IntegrationConnection.metadataJson`.
> Halaman tidak pernah menerima nilai secret yang tersimpan. Setelah disimpan, kolom secret
> dikosongkan dari memori browser, jadi untuk menggantinya Anda harus mengetik ulang.

## Langkah 6 — Otorisasi akun

1. Buka `http://localhost:3939/threads`
2. Klik **Hubungkan Threads**
3. Anda diarahkan ke Meta → login → **setujui scope**
4. Kembali ke aplikasi dengan status **terhubung**

### Verifikasi langkah 6

```bash
curl -s http://localhost:3939/api/threads/connection | jq '{status:.data.status, account:.data.accountName, scopes:.data.scopes}'
```

Harapan: `status: "CONNECTED"`, `accountName` terisi, `scopes` memuat `threads_content_publish`.

**Jika `status` bukan `CONNECTED`, berhenti.** Jangan lanjut ke langkah 7.

## Langkah 7 — Uji koneksi tanpa menerbitkan

```bash
curl -s -X POST http://localhost:3939/api/threads/test | jq .data
```

Ini memanggil endpoint profil Meta dan **tidak membuat postingan apa pun**. Harapan: `ok: true`.

## Langkah 8 — Publikasi pertama (butuh persetujuan eksplisit)

Ini satu-satunya langkah yang membuat konten **publik dan tidak dapat dibatalkan**.

Sebelum menekan tombol:
- [ ] Anda sudah membaca teks cerita yang akan dipublikasikan
- [ ] Tautan afiliasi yang disertakan sudah benar
- [ ] Anda menyetujui konten ini tampil publik di akun Anda

Setelah itu barulah aktifkan penerbitan. Auto-publish tetap **OFF** — posting dilakukan
manual dari Publishing Queue per item, sehingga tidak ada risiko spam massal.

---

## Setelah terhubung

### Masa berlaku token

Token Threads berumur ±60 hari. Aplikasi menampilkan tanggal kedaluwarsa di `/threads`.

```bash
curl -s -X POST http://localhost:3939/api/threads/refresh | jq .data
```

Lakukan penyegaran sebelum tanggal kedaluwarsa. Jika token dicabut dari sisi Meta, aplikasi
meminta Anda melakukan otorisasi ulang, bukan gagal diam-diam.

### Batas yang perlu diketahui

| Batas | Nilai |
|---|---|
| Panjang teks | 500 karakter (emoji dihitung per byte UTF-8) |
| Media (gambar/video) | **Belum diimplementasikan** |
| Rate limit | Mengikuti header Meta; `Retry-After` dihormati |

### Saat terjadi kegagalan

| Kode | Arti | Tindakan |
|---|---|---|
| `NOT_CONFIGURED` | Kredensial belum diisi | Selesaikan langkah 5 di halaman Threads |
| `PERMISSION_DENIED` | Scope tidak disetujui | Otorisasi ulang, centang izin publikasi |
| `RATE_LIMITED` | Terlalu banyak permintaan | Tunggu sesuai `Retry-After` |
| `UNKNOWN_OUTCOME` | Timeout **setelah** permintaan terkirim | **Periksa akun Threads dulu.** Jangan kirim ulang — bisa terjadi duplikat |
| Token kedaluwarsa | Lewat 60 hari | Refresh, atau otorisasi ulang |

`UNKNOWN_OUTCOME` adalah kasus paling berbahaya: permintaan mungkin sudah sampai. Retry
otomatis sengaja **ditolak** oleh aplikasi untuk mencegah duplikat.

---

## Checklist penerimaan

Integrasi Threads boleh disebut **PASS** hanya jika seluruh ini terpenuhi:

- [ ] `/api/threads/connection` → `configuredOnServer: true`
- [ ] OAuth selesai, `status: CONNECTED`
- [ ] `scopes` memuat `threads_content_publish`
- [ ] `POST /api/threads/test` → `ok: true`
- [ ] Satu postingan nyata berhasil terbit dengan persetujuan eksplisit
- [ ] Postingan terbaca kembali dari API (verifikasi langkah 3 publikasi)
- [ ] Auto-publish masih **OFF** setelah pengujian

Sampai semua tercentang, statusnya **NOT_TESTED** — bukan "siap".
