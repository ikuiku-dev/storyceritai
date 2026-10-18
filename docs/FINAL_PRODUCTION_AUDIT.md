# FINAL PRODUCTION AUDIT — CeritaLab AI

Tanggal: 2026-10-18 · Commit dasar: `42c75df` · Runtime: Node v25.2.1, npm 11.6.2, macOS arm64

---

## Executive summary

**Status kesiapan: PASS WITH CONDITIONS — siap untuk penerbitan manual, belum untuk auto-publish.**

Aplikasi terbukti berfungsi di jalur yang dapat diuji: 127 test lulus, typecheck bersih,
build produksi selesai, 23/23 halaman merespons 200. Integrasi AI nyata **berhasil
dipanggil** dengan kredensial pengguna, tetapi **belum pernah menghasilkan satu cerita
terstruktur end-to-end** karena batasan model yang dapat diakses.

### Blocker
1. **Tidak ada model yang mendukung output JSON terstruktur.** Pipeline concept/scoring/
   fact-check memerlukan JSON. 28 model dipindai: tidak satu pun mematuhi skema.
2. **Threads belum terhubung.** Penerbitan live belum pernah diuji.

### Koreksi atas temuan sebelumnya
Pada sesi audit sebelumnya saya menyimpulkan "kredit habis". **Itu keliru.** Buktinya:
`deepseek-v4.1-flash` merespons 200 dan menghasilkan teks. Kesalahan saya adalah
menggeneralisasi satu respons 402 milik satu model menjadi kesimpulan tentang seluruh akun.

---

## Test environment

| Item | Nilai |
|---|---|
| OS | macOS Darwin 25.3.0 arm64 (Apple M4, 16 GB) |
| Node / npm | v25.2.1 / 11.6.2 |
| Database | SQLite (`dev.db`, 33 tabel), backup diambil sebelum audit |
| Provider diuji | OneAPI (`api.oneapi.id/v1`) — kredensial pengguna |
| Integrasi eksternal aktif | AI provider (nyata), source collection (nyata), Threads (tidak terhubung) |

Secret tidak dicantumkan di laporan ini. Kunci hanya berada di `.env` (gitignored).

---

## Test results

| Kategori | Hasil |
|---|---|
| Type checking (`tsc --noEmit`) | **CLEAN** |
| Unit + integration tests | **127/127 lulus**, stabil |
| Production build | **Lulus** (67 static pages) |
| Route smoke test | **23/23** halaman HTTP 200 |
| Live AI provider (models list) | **200** — 28 model, 88–145 ms |
| Live AI generation (teks) | **200** — 3/3 berhasil, 1643 ms rata-rata |
| Live AI structured JSON | **0/3 model** mematuhi skema |
| Affiliate link validation | **VALID_AFFILIATE** — redirect membuktikan `mmp_pid` + `utm_medium=affiliates` |
| SSRF | 4/4 payload ditolak |
| Secret leak sweep | 0 kebocoran di 5 endpoint + git |
| Threads live publish | **NOT TESTED** — tidak ada kredensial |

---

## Integration matrix

| Integrasi | Configured | Authenticated | Capability verified | Hasil |
|---|---|---|---|---|
| AI Provider (OneAPI) | Ya | **Ya** (28 model) | Teks: ya · JSON: tidak | PASS (teks) / FAIL (JSON) |
| Shopee Affiliate | Ya (link pengguna) | n/a | Validasi format + redirect | **PASS** |
| Threads | Tidak | Tidak | Tidak | **NOT TESTED** |
| Source Collector | n/a | n/a | robots.txt nyata | **PASS** (Reddit diblokir) |
| Auto-publish | Ya (OFF) | n/a | Gate menolak | **PASS** (menolak dengan benar) |

---

## Bug register

| ID | Severity | Deskripsi | Akar masalah | Perbaikan | Test regresi |
|---|---|---|---|---|---|
| B-01 | **Critical** | File adapter AI tidak dapat dikompilasi | Template literal rusak: `authorization: *** ${cfg.apiKey}` — `Bearer` dan backtick hilang | Dipulihkan ke `Bearer ${cfg.apiKey}` | `ai-adapter-provider.test.ts` (dibuktikan gagal saat bug dikembalikan) |
| B-02 | High | Provider yang menolak `response_format` menggagalkan seluruh generasi | Parameter dikirim tanpa deteksi dukungan | Retry sekali tanpa parameter + instruksi JSON inline + cache kemampuan | 4 test adapter |
| B-03 | High | Provider mock dilewati saat ada provider nyata | Query `protocol: { not: "mock" }` | Urutan: fallback → nyata → mock | Terbukti: generasi pulih setelah provider rusak dinonaktifkan |
| B-04 | High | Link afiliasi valid dilaporkan "belum terverifikasi" | `SHORT_LINK_UNVERIFIED` tidak pernah di-upgrade; `mmp_pid` tidak dikenali | `analyzeLink()` follow redirect (SSRF-checked) lalu klasifikasi ulang | 4 test link |
| B-05 | Medium | `APPROVED → BLOCKED` transisi ilegal → policy engine melempar error | Tabel transisi tidak mencakup pemblokiran pasca-persetujuan | Transisi ditambahkan | `state-machine.test.ts` |
| B-06 | Medium | Test gagal intermiten | File test paralel berbagi satu SQLite | `--test-concurrency=1` + fixture unik | Stabil 3× berturut-turut |
| B-07 | Medium | 6 layar wajib PRD tidak ada meski build hijau | Tidak ada pemeriksaan struktural | 4 layar dibangun + `nav-parity.test.ts` | Dibuktikan gagal saat link mati dimasukkan |
| B-08 | Low | Model tanpa dukungan JSON menghasilkan error parsing samar | Tidak ada deteksi penyimpangan skema | `PROVIDER_SCHEMA_MISMATCH` + `coerceArrayField` | — |

---

## Temuan model (diukur, bukan diperkirakan)

Pemindaian 28 model dengan permintaan JSON sederhana:

| Kategori | Jumlah | Contoh |
|---|---|---|
| `402 insufficient_credit` | 20 | claude-*, gpt-*, gemini-*, glm-5.3, kimi-k3 |
| `502 upstream_error` | 4 | deepseek-v4.1-flash-free, glm-5.3-flash-free |
| `200` tetapi **mengabaikan skema** | 3 | deepseek-v4.1-flash, muse-spark-1.3-contributor, step-5-preview |
| `400 unsupported_conversion` | 2 | jev-1.13, jev-1.14.0 |

**Kesimpulan:** akun ini memiliki akses ke model yang pandai menulis teks tetapi tidak ada
yang mendukung output terstruktur. Status `402` bersifat **per model** (hak akses), bukan
saldo akun — terbukti karena model lain pada akun yang sama merespons 200.

### Kualitas teks `deepseek-v4.1-flash` (model pilihan pengguna)

3 generasi dengan prompt produksi:
- Bahasa Indonesia natural ✓
- 206/251/209 karakter (di bawah batas 500) ✓
- **0 klaim pengalaman palsu** ("saya beli/pakai/coba") ✓
- Ketiga output berbeda, bukan variasi sinonim ✓

---

## Backtesting

**NOT TESTED.** Dataset historis yang tersedia tidak memadai untuk backtest yang sah:
39 draft belum memiliki metrik performa, 1 post historis, dan tidak ada data insight Threads
(tidak terhubung). Menguji dengan data sintetis lalu menyebutnya backtest akan menyesatkan.

---

## Performance (baseline terukur)

| Metrik | Nilai |
|---|---|
| Halaman (SSR, lokal) | 30–67 ms |
| API providers | 9 ms |
| `/v1/models` (jaringan) | 88–145 ms |
| Generasi teks (model nyata) | 1104–1643 ms |
| Generasi gagal (402) | 140 ms |

---

## Security

| Uji | Hasil |
|---|---|
| Key di respons API (5 endpoint) | 0 kebocoran |
| Key di git (195 file terlacak) | 0 kecocokan |
| Key di log/terminal | Tidak dicetak |
| Mask di UI | `sk-one…TyrL` |
| SSRF (127.0.0.1, 169.254.169.254, [::1], 192.168.1.1) | 4/4 ditolak |
| Export bundle | Bersih; impor menolak ciphertext |
| Auto-publish tanpa konfirmasi | `409 CONFIRM_REQUIRED` |
| Auto-publish dengan konfirmasi | `409 PRECONDITIONS_MISSING` (akun Threads) |

---

## Residual risk

1. **Kunci API terekspos di percakapan.** Harus dirotasi. Tidak ada jejak di repo/log.
2. **Tidak ada lapisan autentikasi.** Aplikasi ini alat satu-operator; jangan diekspos publik
   tanpa auth + TLS.
3. **Output model tanpa penegakan skema.** Instruksi prompt tidak dapat menggantikan
   `response_format`. Jika provider menambahkan dukungan, jalur ini otomatis aktif.
4. **Threads belum diuji live.** Seluruh logika terbukti terhadap API tiruan; penerbitan
   nyata belum pernah terjadi.

---

## Final decision

### **PASS WITH CONDITIONS**

Yang **dapat** digunakan sekarang:
- Generasi teks Indonesia secara manual (kualitas terverifikasi)
- Validasi link afiliasi (terbukti terhadap link pengguna)
- Pengumpulan sumber dengan penegakan robots.txt
- Seluruh UI, kebijakan, kill switch, dan audit log

**Kondisi sebelum auto-publish:**
1. Pilih model yang mendukung `response_format` (atau tunggu provider menambahkannya)
2. Hubungkan akun Threads dan verifikasi scope publikasi
3. Jalankan satu uji publik dengan persetujuan eksplisit
4. Rotasi API key yang telah terekspos
5. Jalankan backtest setelah ada data metrik nyata

**Auto-publish tetap OFF.** Tidak ada pengujian yang mengubahnya, sesuai PRD §12.
