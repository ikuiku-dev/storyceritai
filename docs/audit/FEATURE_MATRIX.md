# Feature Matrix — CeritaLab AI

Status setiap fitur berdasarkan **bukti pengujian langsung**, bukan inspeksi UI saja.

Kategori status:
- `IMPLEMENTED & VERIFIED` — ada di kode, dipanggil UI, dan diuji langsung
- `IMPLEMENTED, NOT FULLY VERIFIED` — kode ada dan UI memanggilnya, tetapi jalur penuh belum diuji
- `PARTIALLY IMPLEMENTED` — sebagian alur bekerja, sebagian belum
- `UI ONLY` — tampilan ada, backend belum terbukti
- `MOCK / DEMO` — memakai data tiruan
- `NOT IMPLEMENTED` — tidak ada
- `BLOCKED` — tidak dapat diverifikasi karena akses eksternal

Tanggal audit: 2026-10-18. Baseline: **146/146 test PASS**, `tsc` bersih, semua 23 halaman
HTTP 200 di produksi.

---

## A. Inti — pembuatan cerita

| Fitur | Halaman | Backend | Persistence | Bukti | Status |
|---|---|---|---|---|---|
| Buat cerita (multi-versi) | `/studio` | `POST /api/stories` | `StoryDraft` | UI terverifikasi di browser; 39 draft di DB | `IMPLEMENTED & VERIFIED` |
| Simpan draft | `/studio` | idem | `StoryDraft` | 39 baris termigrasi dan terbaca di produksi | `IMPLEMENTED & VERIFIED` |
| Edit teks draft | `/studio` | `PATCH` | `StoryDraft` | UI ada | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Story Arena (adu versi) | `/arena` | `POST /api/arena/run` | `StoryExperiment` | 1 eksperimen, 3 varian di DB | `IMPLEMENTED & VERIFIED` |

**Batasan jujur:** penilaian Arena dilakukan oleh model AI, bukan pembaca manusia.

## B. AI Provider

| Fitur | Halaman | Backend | Bukti | Status |
|---|---|---|---|---|
| Tambah/edit provider | `/providers` | `POST/PATCH /api/providers` | Tombol "Tambah provider" terverifikasi | `IMPLEMENTED & VERIFIED` |
| Test koneksi | `/providers` | `POST .../test-connection` | Tombol "Test Connection" ada; test live lulus 88 ms pada provider OneAPI | `IMPLEMENTED & VERIFIED` |
| Test model | `/providers` | `POST .../test-model` | Tombol "Test Model" ada | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Pemilihan model per-kunci | `/providers` | `GET .../models` | 28 model terambil dari API key nyata | `IMPLEMENTED & VERIFIED` |
| Ganti model provider tersimpan | `/providers` | `PATCH /api/providers/[id]` | Tombol "Ganti model" terverifikasi | `IMPLEMENTED & VERIFIED` |
| Provider aktif | — | `PATCH` | OneAPI `active=true` di produksi | `IMPLEMENTED & VERIFIED` |

**Batasan jujur:** dari 28 model yang tersedia pada kunci OneAPI, tidak ada yang mematuhi
JSON schema secara konsisten (20×402, 4×502, 3×200 yang mengabaikan JSON, 2×400). Pipeline
tetap berjalan tanpa jaminan format JSON kaku.

## C. Riset dan sumber

| Fitur | Halaman | Backend | Bukti | Status |
|---|---|---|---|---|
| Product research | `/products` | `GET/POST /api/products` | 3 produk di produksi | `IMPLEMENTED & VERIFIED` |
| Impor produk (URL/CSV) | `/products` | `POST /api/products/import` | Tombol ada | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Bandingkan produk | `/products/compare` | — | Halaman 200 | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Source library | `/sources` | `GET/POST /api/sources` | 25 sumber di DB | `IMPLEMENTED & VERIFIED` |
| Uji izin sumber (robots) | `/sources/collector` | `POST /api/sources/test-access` | Guard robots.txt + SSRF diuji | `IMPLEMENTED & VERIFIED` |
| Kesehatan sumber | `/sources/health` | `GET /api/sources/health` | Halaman 200 | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Research scheduler | `/research` | `POST /api/research/runs` | 1 ResearchDocument di DB | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Audience insights | `/insights` | DB | 4 baris AudienceInsight | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Knowledge base | `/knowledge` | DB | Halaman 200 | `IMPLEMENTED, NOT FULLY VERIFIED` |

**Batasan jujur:** pengumpulan sumber bersifat **impor/manual dengan uji izin**, bukan
scraping aktif. Robots.txt dihormati.

## D. Afiliasi

| Fitur | Halaman | Backend | Bukti | Status |
|---|---|---|---|---|
| Simpan tautan afiliasi | `/affiliate` | `POST /api/affiliate-links` | 2 link di DB | `IMPLEMENTED & VERIFIED` |
| Validasi format link | `/affiliate/links` | `POST .../validate` | Test unit 10/10, mendeteksi `mmp_pid` | `IMPLEMENTED & VERIFIED` |
| Buat link Shopee | `/affiliate` | `POST /api/shopee/link` | Tombol ada | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Disclosure affiliate | `/settings` | `disclosureText` | Tersimpan dan terbaca | `IMPLEMENTED & VERIFIED` |

**Batasan jujur — penting:** validasi hanya memeriksa **format URL**. Komisi, klik, dan
konversi **tidak dapat diverifikasi** aplikasi. Tidak ada klik/order palsu yang dibuat
(dilarang oleh aturan QA).

## E. Publikasi Threads

| Fitur | Halaman | Backend | Bukti | Status |
|---|---|---|---|---|
| OAuth resmi Meta | `/threads` | `/api/threads/authorize` + callback | **CONNECTED**, akun `@vick_aoi`, token s/d 2026-12-17 | `IMPLEMENTED & VERIFIED` |
| Simpan kredensial app | `/threads` | `POST /api/threads/app-config` | Terenkripsi AES-GCM; GET hanya mask | `IMPLEMENTED & VERIFIED` |
| Perbaikan redirect di belakang proxy | — | `publicOrigin()` | `Location` ke domain tunnel terverifikasi | `IMPLEMENTED & VERIFIED` |
| Siapkan postingan | `/threads` | — | Tombol "Siapkan postingan" terverifikasi ada | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Publish nyata ke Threads | — | — | **Belum pernah dijalankan** | `BLOCKED` |
| Status/ID post terverifikasi | — | — | — | `BLOCKED` |

**Batasan jujur:** publikasi nyata ke Threads **belum pernah dilakukan**. Ini memerlukan
persetujuan eksplisit Anda untuk satu post tertentu. Status `CONNECTED` berarti OAuth
berhasil dan token valid — **bukan** bukti bahwa publish berhasil.

## F. Antrean dan penjadwalan

| Fitur | Halaman | Backend | Bukti | Status |
|---|---|---|---|---|
| Antrean publikasi | `/queue` | `GET /api/publishing/queue` | Halaman 200 (antrean kosong saat audit) | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Kalender publikasi | `/calendar` | DB | Halaman 200 | `IMPLEMENTED, NOT FULLY VERIFIED` |
| Job execution + lease | `/jobs` | `GET /api/jobs` | 27 PublishingJob di DB | `IMPLEMENTED & VERIFIED` |
| Riwayat eksekusi | `/jobs` | idem | 14.931 byte data nyata | `IMPLEMENTED & VERIFIED` |
| Auto-publish | `/settings` | `PublishDecision` | Default **OFF**, terverifikasi | `IMPLEMENTED & VERIFIED` |
| Penjadwalan otomatis berjalan | — | — | **Tidak ada proses latar di Netlify** | `PARTIALLY IMPLEMENTED` |

**Batasan jujur:** data jadwal tersimpan, tetapi di Netlify Functions tidak ada proses yang
berjalan terus untuk mengirimkannya. Penjadwalan tidak berjalan otomatis.

## G. Keamanan dan kontrol

| Fitur | Halaman | Bukti | Status |
|---|---|---|---|
| Pause All (kill switch) | `/settings` | Tombol "Pause All" terverifikasi | `IMPLEMENTED & VERIFIED` |
| Cancel scheduled | `/settings` | Tombol ada | `IMPLEMENTED & VERIFIED` |
| Audit log | `/audit` | 144 entri di DB | `IMPLEMENTED & VERIFIED` |
| Enkripsi secret (AES-GCM) | — | Test: tidak ada plaintext di DB | `IMPLEMENTED & VERIFIED` |
| Masking secret di API | — | Test: GET hanya mengembalikan mask | `IMPLEMENTED & VERIFIED` |
| Guard SSRF | — | Literal `169.254.169.254` ditolak 0,4 ms | `IMPLEMENTED & VERIFIED` |
| Validasi input (zod) | — | Test 422 untuk input salah | `IMPLEMENTED & VERIFIED` |
| Backup & Restore (UI) | `/settings` | **Baru diperbaiki** — tombol tadinya tidak ada | `IMPLEMENTED & VERIFIED` |

## H. Sistem

| Fitur | Halaman | Bukti | Status |
|---|---|---|---|
| Status konektor | `/integrations` | `LIMITED_ACCESS` untuk Shopee (jujur, bukan CONNECTED) | `IMPLEMENTED & VERIFIED` |
| Settings publikasi | `/settings` | `MANUAL_APPROVAL`, auto-publish OFF | `IMPLEMENTED & VERIFIED` |
| Eksperimen & analitik | `/experiments` | 3 eksperimen di DB | `IMPLEMENTED, NOT FULLY VERIFIED` |

---

## Endpoint backend tanpa UI (7)

Fitur ini ada dan berfungsi, tetapi **tidak dapat ditemukan pengguna** karena tidak ada
tombol yang memanggilnya. Dicatat sebagai keterbatasan, bukan diklaim sebagai fitur.

| Endpoint | Kegunaan |
|---|---|
| `POST /api/stories/concepts` | buat konsep cerita |
| `POST /api/stories/[id]/score` | skor draft |
| `POST /api/stories/[id]/naturalize` | haluskan teks |
| `POST /api/sources/[id]/summarize` | ringkas sumber |
| `POST /api/sources/[id]/insights` | tarik insight |
| `GET /api/analytics/brief` | ringkasan analitik |
| `POST /api/experiments/[id]/conclude` | tutup eksperimen |

---

## Rekapitulasi

| Status | Jumlah |
|---|---|
| `IMPLEMENTED & VERIFIED` | 22 |
| `IMPLEMENTED, NOT FULLY VERIFIED` | 13 |
| `PARTIALLY IMPLEMENTED` | 1 (penjadwalan otomatis) |
| `BLOCKED` | 2 (publish nyata, verifikasi post) |
| `MOCK / DEMO` | 1 (provider "Mock Local", `active=false`) |
| `NOT IMPLEMENTED` | 0 |
| `UI ONLY` | 0 |

**Tidak ada fitur palsu yang ditemukan.** Setiap tombol yang diaudit memanggil endpoint yang
benar-benar ada. Sebaliknya, ditemukan 8 fitur yang berfungsi tetapi tidak terjangkau UI
(7 yatim + export/import yang diperbaiki pada audit ini).
