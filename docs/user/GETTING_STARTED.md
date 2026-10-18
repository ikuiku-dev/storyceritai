# Mulai Menggunakan CeritaLab AI

Panduan untuk pengguna baru. Semua nama menu dan tombol di sini **diverifikasi ada** di
aplikasi, bukan dikarang.

**Alamat aplikasi:** `https://ceritastoryai.netlify.app`

---

## Gambaran singkat

CeritaLab membantu Anda mengubah produk affiliate menjadi cerita yang layak dibaca, lalu
menerbitkannya ke Threads. Alurnya:

```
Riset produk → Kumpulkan sumber → Tulis cerita → Adu versi → Simpan draft
   → Antrekan → Setujui → Terbit ke Threads
```

Tidak wajib urut sempurna. Anda bisa langsung menulis cerita di Story Studio kalau sudah
punya ide.

---

## Langkah 1 — Kenali 5 kelompok menu

Menu di sebelah kiri dibagi lima kelompok. Tidak semuanya perlu dipakai setiap hari.

| Kelompok | Isi | Kapan dipakai |
|---|---|---|
| **Kerja** | Overview, Story Studio, Story Arena, Publishing Calendar | Setiap hari — ini pekerjaan utama |
| **Riset** | Product Research, Source Collector, Source Health, Compare Products, Research Scheduler, Source Library, Audience Insights, Knowledge Base | Saat mencari ide dan bahan |
| **Distribusi** | Affiliate Links, Link Manager, Automation Rules, Publishing Queue, Execution History, Threads Integration | Saat menyiapkan dan menerbitkan |
| **Analitik** | Experiments & Analytics | Saat mengevaluasi hasil |
| **Sistem** | Integrations, AI Providers, Settings, Audit Logs | Saat mengatur, jarang setelahnya |

**Saran:** mulai dari **Overview** (`/`) setiap kali membuka aplikasi. Di sana terlihat apa
yang perlu dikerjakan hari itu.

---

## Langkah 2 — Pastikan AI sudah tersambung

Buka **Sistem → AI Providers** (`/providers`).

Anda akan melihat daftar provider. Yang penting: ada satu yang **aktif**.

- Kalau sudah ada provider aktif (ditandai `active`), lewati langkah ini.
- Kalau belum, klik **Tambah provider** dan isi:
  - **Nama** — bebas, mis. `OneAPI`
  - **Base URL** — alamat API, mis. `https://api.oneapi.id/v1`
  - **API key** — kunci dari penyedia. **Jangan kirim ke siapa pun.**
  - **Model** — klik pemilih model; daftar diambil langsung dari API key Anda

Klik **Test Connection**. Kalau berhasil, pilih **Aktifkan**.

> **Penting:** provider harus mendukung format OpenAI. Kalau tidak, cerita tidak bisa
> dibuat. Aplikasi akan memberi pesan error yang jelas, bukan diam saja.

---

## Langkah 3 — Tambahkan produk

Buka **Riset → Product Research** (`/products`).

Klik **Tambah produk**, isi:
- **Nama produk**
- **URL produk** (link Shopee biasa)
- **Target audiens** — siapa yang Anda bayangkan membeli ini

Klik **Simpan**. Produk muncul di daftar dengan skor peluang.

> **Catatan jujur:** skor peluang dihitung dari data yang Anda isi, bukan data pasar
> Shopee. Aplikasi tidak mengambil harga, stok, atau rating dari Shopee secara otomatis.

---

## Langkah 4 — Siapkan tautan afiliasi

Buka **Distribusi → Affiliate Links** (`/affiliate`).

Tempel URL afiliasi Anda (yang mengandung `mmp_pid=...`). Klik **Simpan**, lalu **Validasi**.

Hasil validasi:
- **VALID_AFFILIATE** — link mengandung parameter afiliasi yang benar
- **INVALID** — link tidak mengandung parameter afiliasi

> **Batas yang perlu Anda tahu:** validasi hanya memeriksa **format link**. Aplikasi tidak
> bisa membuktikan komisi benar-benar masuk — itu hanya terlihat di laporan Shopee Affiliate
> Anda.

---

## Langkah 5 — Tulis cerita

Buka **Kerja → Story Studio** (`/studio`). Ini inti aplikasi.

Isi formulir:
- **Masalah audiens** — keluhan yang dirasakan calon pembeli
- **Audiens** — siapa mereka
- **Jumlah** — minimal 4 cerita

Klik **Buat cerita**. Proses memakan waktu — Anda akan melihat indikator memuat.

Hasilnya berupa beberapa versi cerita. Untuk masing-masing Anda bisa:
- **Simpan** sebagai draft
- **Edit** teksnya langsung
- **Buat ulang** kalau kurang pas

> **Kalau gagal:** pesan error akan menyebutkan penyebabnya (kuota habis, model tidak
> mendukung, timeout). Tidak ada klaim sukses palsu.

---

## Langkah 6 — Adu versi (opsional)

Buka **Kerja → Story Arena** (`/arena`).

Di sini beberapa versi cerita dibandingkan berdampingan. Anda memilih yang terbaik.

> **Batas:** penilaian dilakukan **oleh model AI**, bukan pembaca sungguhan. Anggap sebagai
> saran, bukan kebenaran objektif. Keputusan akhir tetap milik Anda.

---

## Langkah 7 — Antrekan dan setujui

Buka **Distribusi → Publishing Queue** (`/queue`).

Draft yang siap muncul di sini. Untuk setiap item:
- Periksa **teks lengkap** — pastikan Anda setuju dengan isinya
- Periksa **tautan affiliate** sudah benar
- Periksa **disclosure** affiliate muncul

Setiap item punya tombol persetujuan. Kalau belum layak, tolak dan perbaiki di Studio.
(Antrean kosong berarti belum ada draft yang masuk — buat dulu di Story Studio.)

**Auto-publish default MATI.** Tidak ada yang terbit tanpa Anda klik setuju.

---

## Langkah 8 — Terbitkan ke Threads

Buka **Distribusi → Threads Integration** (`/threads`).

Status akun terlihat di atas:
- **CONNECTED** + nama akun = tersambung dan siap
- **NOT_CONFIGURED** = belum ada kredensial

Kalau belum tersambung, isi form **Kredensial App Meta**:
- **App ID** dan **App Secret** dari Meta for Developers
- **Redirect URI** — salin persis yang tertera di halaman itu

Lalu klik **Simpan kredensial**, kemudian **Siapkan postingan**.

> Kredensial disimpan **terenkripsi** di database. Setelah disimpan, yang ditampilkan hanya
> sebagian (mis. `204338…3451`). Secret tidak pernah dikirim balik ke browser.

---

## Langkah 9 — Backup data

Buka **Sistem → Settings** (`/settings`), scroll ke bawah ke kartu **Backup & Restore**.

- **Unduh backup lengkap** — semua data dalam satu berkas JSON
- **Hanya konten** — cerita, produk, sumber
- **Hanya pengaturan** — konfigurasi

Untuk memulihkan: **Pilih berkas backup**, pilih berkas `.json` yang pernah diunduh.

**Lakukan sebelum mengubah banyak hal.** Kredensial di dalam backup tersimpan dalam bentuk
terenkripsi.

---

## Kapan harus berhenti dan memeriksa

| Gejala | Yang harus dilakukan |
|---|---|
| Cerita tidak bisa dibuat | Cek **AI Providers** — provider aktif? Klik **Test Connection** |
| Error "kuota habis" / 402 | Kredit penyedia AI Anda habis — isi ulang di sana |
| Threads menolak terhubung | Akun Meta Anda mungkin belum terdaftar sebagai Threads Tester |
| Tautan tidak muncul di cerita | Cek **Affiliate Links** — link tersimpan dan valid? |
| Ragu ada yang salah | **Settings → Pause All** menghentikan semua publikasi otomatis |

---

## Hal yang perlu Anda ketahui sejak awal

Ini batasan nyata, bukan cacat tersembunyi:

1. **Penjadwalan tidak berjalan otomatis** di Netlify. Datanya tersimpan, tetapi tidak ada
   proses latar yang mengirim pada waktu tertentu. Publikasi dilakukan manual.
2. **Shopee API resmi belum tersedia** untuk akun Anda. Mode yang aktif: impor manual
   (URL atau CSV).
3. **Komisi tidak bisa diverifikasi** oleh aplikasi. Hanya format link yang diperiksa.
4. **Penilaian Story Arena oleh AI**, bukan manusia.
5. **Auto-publish mati secara default** dan memerlukan pengaktifan eksplisit.
