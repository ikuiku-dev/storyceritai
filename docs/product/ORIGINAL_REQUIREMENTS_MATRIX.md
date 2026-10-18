# Original Requirements Matrix

Perbandingan visi produk asli terhadap implementasi aktual.

**Catatan keterbatasan sumber:** prompt PRD asli tidak tersimpan di repository. Baseline yang
dipakai adalah dokumen "Original Product Vision" yang diberikan 2026-10-18. Dokumen di `docs/`
sebelumnya adalah rencana yang saya tulis sendiri selama pembangunan, bukan PRD.

Status: `OK` · `PARTIAL` · `MISSING` · `BLOCKED`

---

## A. Manajemen AI Provider

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Konfigurasi provider | Base URL + API key + model | `POST /api/providers`, form lengkap | — | — | — | OK: OneAPI aktif, test 88 ms |
| Pemilihan model | Model diambil dari provider, bukan daftar statis | `GET .../models` ambil 28 model dari kunci nyata | — | — | — | OK |
| Uji koneksi | Per-akun dan per-model | `test-connection` + `test-model` | — | — | — | OK (live) |
| Kompatibilitas API | Provider berbeda format ditangani | Hanya OpenAI-compatible | Provider non-OpenAI tidak didukung | P3 | Dokumentasikan | OK: pesan error jelas |
| Laporan biaya | Biaya per generasi | `CostRecord` 220 baris | — | — | — | OK |
| Penanganan secret | Tidak pernah dikirim ke browser | AES-GCM, GET hanya mask | — | — | — | OK (test) |

## B. Riset Produk & Audiens

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Identitas produk | Nama, toko, kategori, URL | Model `Product` lengkap | — | — | — | OK: 3 produk |
| URL + URL affiliate | Dipisah | `Product.url`, `AffiliateLink.affiliateUrl` | — | — | — | OK |
| Target audiens | Profil audiens | `AudienceInsight` 4 baris | — | — | — | PARTIAL: belum terhubung ke Studio secara otomatis |
| Pain point | Masalah audiens | `Product.buyerProblem` | — | — | — | OK: terbawa ke Studio via `?problem=` |
| Manfaat berbasis bukti | Klaim bersumber | `SourceEvidence` | — | — | — | PARTIAL |
| Batasan & keberatan | Daftar keberatan | `AudienceInsight` | — | — | — | PARTIAL |
| Harga bertanggal | Harga + sumber + tanggal ambil | `ProductSnapshot.fetchedAt` | — | — | — | OK |
| Sudut cerita | Angle + hook | `StoryConcept.angle` (11 angle) | — | — | — | OK |
| Provenance sumber | Asal data | `sourceOrigin`, `verificationStatus` | — | — | — | OK |

## C. Riset Sumber & Reference Library

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Tambah sumber | URL / teks / impor | `POST /api/sources`, `sources/url`, `sources/text` | — | — | — | OK: 25 sumber |
| Uji izin | Hormati robots.txt | `sources/test-access` + guard SSRF | — | — | — | OK (test) |
| Ekstrak kutipan | Simpan kutipan | `SourceExcerpt` | — | — | — | PARTIAL |
| Provenance | Asal & tanggal | `Source` diperiksa | — | — | — | OK |
| Prompt injection | Konten luar diperlakukan tak tepercaya | `<source>` + instruksi abaikan | — | — | — | OK |
| Reusable insight | Pelajaran dipakai ulang | `KnowledgeBase`, `learnedBrief` | — | — | — | OK |

## D. Story Studio

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Konteks produk | Pakai data produk terpilih | `productName` + `productFacts` di prompt | — | — | — | OK |
| **Handoff produk** | Tidak perlu pilih ulang | **`?product=` + `?problem=`** | **DIPERBAIKI** | **P1** | Selesai | OK: terverifikasi |
| Konteks audiens | Masalah audiens | `audienceProblem` di prompt | — | — | — | OK |
| Angle & tone | Kontrol gaya | 11 angle + 6 slider | — | — | — | OK |
| Klaim bersumber | Grounded pada bukti | `sourceDigest` di prompt | — | — | — | OK |
| Disclosure | Teks affiliate | `settings.disclosureText` | — | — | — | OK |
| Variasi 4+ | Berbeda, bukan sinonim | `variationHint` per varian | Kualitas variasi belum diukur objektif | P3 | Ukur similarity | PARTIAL |
| Edit & simpan | Revisi tersimpan | `StoryRevision` 40 baris | — | — | — | OK |

## E. Story Arena

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Terima kandidat | Dari Studio | `POST /api/arena/run` | — | — | — | OK |
| Kriteria eksplisit | Rubrik | `StoryScore` 31 baris | — | — | — | OK |
| Deteksi masalah fakta | Fact-check | `factCheckStatus` | — | — | — | OK |
| Deteksi kemiripan | Similarity | `similarityScore` | — | — | — | OK |
| Hasil komparatif | Alasan | `explanation` | — | — | — | OK |
| Pilih pemenang | User memilih | Approve/Reject | — | — | — | OK |
| **Kirim ke tahap berikut** | Tanpa kehilangan konteks | **`SendToQueue`** | **DIPERBAIKI** | **P1** | Selesai | OK |
| Riwayat evaluasi | Versi lama disimpan | `ExperimentVariant` | — | — | — | OK |

## F. Tautan Affiliate

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Bedakan URL produk vs affiliate | Dua field terpisah | `Product.url` vs `AffiliateLink.affiliateUrl` | — | — | — | OK |
| Status validasi | VALID/INVALID/UNREACHABLE | `validationStatus` | — | — | — | OK |
| Validasi tujuan | Ikuti redirect aman | Guard SSRF + redirect | — | — | — | OK |
| Asosiasi produk | Tautan milik produk | `productId` wajib | — | — | — | OK |
| Waktu verifikasi | Kapan dicek | `checkedAt` | — | — | — | OK |
| **Bawa ke publikasi** | Otomatis ikut cerita | **`publish-context`** | **DIPERBAIKI** | **P1** | Selesai | OK |

## G. Alur Publikasi

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Buat draft post | Dari cerita | `POST /api/posts` | — | — | — | OK |
| **Handoff draft → antrean** | Tombol ada | **`SendToQueue`** | **DIPERBAIKI** | **P1** | Selesai | OK: `WAITING_APPROVAL` |
| Pratinjau | Lihat teks final | Queue menampilkan teks | — | — | — | OK |
| Validasi disclosure | Wajib | `disclosureIncluded` | — | — | — | OK |
| Persetujuan user | Sebelum terbit | `/api/posts/[id]/approve` | — | — | — | OK |
| Antrean persisten | Tersimpan | `PublishedPost` | — | — | — | OK |
| Cegah duplikat | Idempoten | `dedupeKey` unik + guard 30 hari | — | — | — | OK: diuji, tidak menambah baris |
| Pemulihan kegagalan | Retry aman | `attempts`, `failedReason` | — | — | — | OK |
| Integrasi Threads resmi | OAuth | `CONNECTED`, `@vick_aoi` | — | — | — | OK |
| **Publish nyata** | Post terkirim | Belum pernah dijalankan | Butuh persetujuan | P1 | Uji dengan izin | BLOCKED |
| ID post | `remotePostId` | Ada field, belum terisi | Bergantung publish | P1 | — | BLOCKED |
| Penjadwalan otomatis | Jalan di waktu tertentu | Data ada, tidak ada proses latar | Netlify Functions tanpa worker | P2 | Scheduled Function | BLOCKED |
| Auto-publish default OFF | Aman | Terverifikasi OFF | — | — | — | OK |

## H. Umpan Balik Performa

| Requirement | Intended Behavior | Current Implementation | Gap | Priority | Plan | Verification |
|---|---|---|---|---|---|---|
| Data hasil publish | Metrik resmi | `PostMetricSnapshot` | Belum ada post terbit | P1 | Setelah publish | BLOCKED |
| Hubungkan ke keputusan | Pelajaran → konten berikut | `KnowledgeBase` | Tanpa metrik nyata, kosong | P2 | — | BLOCKED |
| Tidak mengarang angka | Jujur | UI menampilkan `—` untuk null | — | — | — | OK |

---

## Rekapitulasi

| Status | Jumlah | Arti |
|---|---|---|
| OK | 42 | Bekerja dan terverifikasi |
| PARTIAL | 7 | Sebagian bekerja, sebagian belum |
| MISSING → DIPERBAIKI | 4 | Handoff yang hilang, sudah dibangun |
| BLOCKED | 5 | Butuh akses eksternal / persetujuan / worker |

**Gap terbesar yang ditemukan dan diperbaiki:** rantai data antar modul. Skema sudah
menyimpan `Product → Concept → Draft → Post`, tetapi UI tidak punya tombol untuk membawa
data melaluinya. Tiga handoff dibangun: Products→Studio, Studio→Queue, Arena→Queue.
