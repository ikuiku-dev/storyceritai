# CeritaLab AI

Studio cerita affiliate untuk Threads: riset produk → pahami bahasa audiens → tulis & adu kandidat cerita → periksa fakta → setujui → publikasikan → ukur.

Dibangun sebagai aplikasi **local-first**: data tinggal di SQLite di mesin Anda, kunci API terenkripsi, dan tidak ada panggilan jaringan kecuali Anda sendiri mengaktifkan provider.

---

## Mulai cepat

```bash
npm install
cp .env.example .env          # lalu isi CERITALAB_SECRET (wajib)

# Bangkitkan secret:
openssl rand -base64 32

npm run db:push               # buat skema SQLite
npm run dev                   # http://localhost:3000
```

Lalu buka **AI Providers** dan tambahkan salah satu:

| Pilihan | Base URL | Catatan |
|---|---|---|
| Mock | `http://localhost:11434/v1` | Tanpa jaringan. Untuk mencoba alur & tes. |
| Ollama lokal | `http://localhost:11434/v1` | Model mis. `llama3.1`. Tanpa API key. |
| LM Studio | `http://localhost:1234/v1` | Tanpa API key. |
| OpenAI-compatible | `https://api.openai.com/v1` | Butuh API key. |

Klik **Test Connection** lalu **Test Model** untuk memastikan.

---

## Alur kerja

1. **Product Research** — tambah kandidat produk (manual atau impor CSV). Isi skor dimensi yang Anda ketahui; yang kosong ditandai *belum diketahui*, tidak diisi nol.
2. **Source Library** — impor catatan Anda sendiri atau ambil halaman publik. Jalankan *Ringkas* dan *Ekstrak insight*.
3. **Story Studio** — tulis cerita dengan **mode kebenaran** yang ditegakkan di server.
4. **Story Arena** — adu beberapa kandidat dalam satu turnamen berbatas (jumlah panggilan AI & waktu).
5. **Threads Integration** — siapkan postingan → setujui → terbitkan. Terakhir, ambil metrik.
6. **Experiments & Analytics** — bandingkan varian dengan uji interval kepercayaan, bukan tebakan.

---

## Prinsip yang dijaga oleh kode (bukan hanya dokumentasi)

### Mode kebenaran
Setiap draft punya label: `REAL_EXPERIENCE`, `SOURCE_BASED`, `HYPOTHETICAL`, `OPINION`, `PRODUCT_EXPLAINER`.

- Mode `REAL_EXPERIENCE` **menolak** permintaan jika Anda belum menuliskan pengalaman nyata. AI tidak boleh mengarang.
- Di mode lain, frasa seperti *"aku sudah pakai…"* diblokir oleh linter deterministik.
- Klaim angka palsu (`10.000 terjual`, `rating 4.9`) diblokir kecuali ditandai bersumber.

### Data yang tidak diketahui bukan nol
Skor peluang, metrik, dan estimasi biaya menampilkan `—` ketika datanya tidak ada. Tidak ada angka rekaan yang terlihat presisi.

### Publikasi tidak pernah implisit
- Membuat postingan hanya menyimpannya sebagai `WAITING_APPROVAL`.
- Persetujuan tidak menerbitkan; tombol **Terbitkan** adalah aksi terpisah dengan `confirm: true`.
- Mode `DRAFT_ONLY` memblokir publikasi di server.
- `AUTO_PUBLISH` tanpa `autoPublishEnabled` otomatis diturunkan ke `MANUAL_APPROVAL`.

### Pencegahan posting ganda
1. `dedupeKey` unik dibuat **sebelum** panggilan API apa pun.
2. Container ID disimpan segera setelah dibuat, sehingga percobaan ulang melanjutkan alih-alih mengulang.
3. Timeout setelah `threads_publish` → status `UNKNOWN_AFTER_SEND`. **Tidak pernah dicoba ulang otomatis**; Anda harus memeriksa akun dulu.

### Analitik yang jujur
`compareVariants()` memakai interval Wilson. Pemenang hanya diumumkan jika setiap varian mencapai jumlah sampel minimum **dan** interval 95% pemenang tidak tumpang tindih dengan runner-up. Selain itu hasilnya `UNDERPOWERED` atau `INCONCLUSIVE`, disertai penjelasan mengapa.

### Keamanan
- **SSRF guard**: blokir localhost, IP privat, `169.254.169.254`, port non-standar, redirect internal, dan validasi ulang setelah redirect.
- **Prompt injection**: teks sumber dibungkus `<source>` sebagai data tak tepercaya; instruksi di dalamnya diabaikan.
- **Kunci API**: disimpan dengan AES-256-GCM. Hanya mask (`sk-…3456`) yang pernah dikirim ke klien.
- **OAuth CSRF**: state acak disimpan di cookie HttpOnly dan diverifikasi saat callback.

---

## Perintah

```bash
npm run dev          # server pengembangan
npm run build        # build produksi
npm test             # unit test (lint, SSRF, crypto, ekstraksi, skor, statistik)
npm run typecheck    # tsc --noEmit
npm run db:push      # sinkronkan skema
npm run backup       # arsipkan DB (menolak jalan tanpa CERITALAB_SECRET)
```

---

## Integrasi Threads (opsional)

Publikasi ke Threads memerlukan aplikasi Meta:

1. Buat app di [Meta for Developers](https://developers.facebook.com/) dengan use case **Threads**.
2. Tambahkan redirect URI **HTTPS** yang persis sama dengan `THREADS_REDIRECT_URI`.
3. Isi `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI` di `.env`, lalu restart.
4. Buka **Threads Integration → Hubungkan akun**.

Scope yang diminta: `threads_basic`, `threads_content_publish`, `threads_manage_insights`.

> **Tanpa kredensial ini, semua fitur lain tetap berfungsi.** Hanya penerbitan ke Threads yang nonaktif, dan UI mengatakannya terus terang.

---

## Batasan yang diketahui

- **API produk Shopee**: tidak ada endpoint pencarian publik untuk akun affiliate biasa. Gunakan input manual atau impor CSV/JSON. Semua data impor berlabel `UNVERIFIED` sampai Anda memeriksanya.
- **Metrik Threads**: ketersediaan metrik bergantung pada API. Yang tidak tersedia bisa diisi manual dan disimpan sebagai "diketahui"; yang tidak diisi tetap `null`.
- **Linter bahasa** berbasis pola. Ia menangkap klaim palsu dan iritasi gaya yang jelas, bukan semua kemungkinan tulisan AI.
- **Pengujian memakai provider mock.** Variasi cerita mock terbatas; gunakan provider nyata untuk hasil sebenarnya.

---

## Struktur

```
src/
  app/                 # halaman + API route
  components/          # UI (client components per domain)
  lib/
    services/
      ai/              # adapter provider, runtime, mock
      stories/         # prompt, linter, generasi, penilaian
      sources/         # ekstraksi HTML, ingest, insight
      products/        # skor peluang, impor CSV, validasi tautan
      arena/           # turnamen berbatas
      publishing/      # Threads API, OAuth, guardrail, idempoten
      analytics/       # statistik jujur
    net/ssrf.ts        # penjaga SSRF
    crypto.ts          # seal/open, hash, similarity
    jobs/queue.ts      # antrean berbasis SQLite
tests/                 # unit test (node:test)
docs/                  # rencana, arsitektur, status tugas
```

---

## Lisensi

Proyek pribadi. Tidak ada jaminan. Verifikasi sendiri sebelum mempublikasikan konten yang memengaruhi orang lain.
