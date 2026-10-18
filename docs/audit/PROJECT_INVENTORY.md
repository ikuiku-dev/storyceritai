# Project Inventory — CeritaLab AI

Hasil inspeksi repository aktual. Disusun sebelum perubahan apa pun.

## Stack aktual (diverifikasi dari kode, bukan dari asumsi)

| Lapisan | Teknologi | Bukti |
|---|---|---|
| Framework | Next.js 16.4.2 (App Router, `src/`) | `package.json`, `src/app/` |
| Bahasa | TypeScript 5 | `tsconfig.json` |
| Database lokal | SQLite via libSQL adapter | `prisma/schema.prisma`, `src/lib/db.ts` |
| Database produksi | Postgres (Supabase) via `@prisma/adapter-pg` | `prisma/schema.postgres.prisma` |
| ORM | Prisma 7.10.1 | `node_modules/.prisma` |
| Styling | Tailwind CSS 4 | `src/app/globals.css` |
| Test runner | `node:test` via tsx | `package.json` → `npm test` |
| Hosting | Netlify (Functions) | `netlify.toml` |

## Entry point

- Root layout: `src/app/layout.tsx`
- Shell (sidebar + nav): `src/components/shell.tsx`
- Daftar menu: `src/lib/nav.ts` (23 item, 5 grup)
- Prisma client tunggal: `src/lib/db.ts` — memilih adapter dari bentuk `DATABASE_URL`

## Struktur modul

```
src/app/          23 halaman + 40 route API
src/components/   komponen per-domain (studio, arena, affiliate, threads, dll)
src/lib/services/ lapisan bisnis (stories, publishing, providers, research)
src/lib/net/      guard SSRF
prisma/           schema SQLite + schema Postgres
tests/            142 test
docs/             dokumentasi (lihat catatan di bawah)
```

## Routing — 23 halaman

Kerja: `/`, `/studio`, `/arena`, `/calendar`
Riset: `/products`, `/sources/collector`, `/sources/health`, `/products/compare`, `/research`, `/sources`, `/insights`, `/knowledge`
Distribusi: `/affiliate`, `/affiliate/links`, `/automation`, `/queue`, `/jobs`, `/threads`
Analitik: `/experiments`
Sistem: `/integrations`, `/providers`, `/settings`, `/audit`

## Cara menjalankan

```bash
npm run dev                 # lokal, port 3000 (dev aktif memakai 3939)
npm test                    # 142 test
npx tsc --noEmit            # type check
npm run build               # build lokal (client SQLite)
npm run build:netlify       # build produksi (client Postgres)
```

## Database

- 33 model. Tidak ada tipe `Json`/`Decimal`/`BigInt`/`Bytes` — semua JSON disimpan sebagai `String`,
  sehingga skema Postgres identik kecuali `provider`.
- Produksi saat ini: Supabase `ap-northeast-2` (Seoul), 33 tabel, 559 baris termigrasi.

## Integrasi eksternal — status sebenarnya

| Integrasi | Metode | Status terverifikasi |
|---|---|---|
| Threads (Meta) | OAuth resmi | **CONNECTED**, akun `@vick_aoi`, token s/d 2026-12-17 |
| AI provider (OneAPI) | OpenAI-compatible | Terhubung, model `deepseek-v4.1-flash`, test live lulus |
| AI provider (Mock) | internal | Ada, `active=false` |
| Shopee affiliate | Impor manual | **LIMITED_ACCESS** — API resmi belum tersedia untuk akun ini |

## Konfigurasi wajib

`DATABASE_URL`, `CERITALAB_SECRET` (kunci enkripsi AES-GCM), `DATABASE_PROVIDER`.
Kredensial Threads **tidak** di `.env` — disimpan terenkripsi di `IntegrationConnection`.

---

## ⚠️ Temuan audit: dokumentasi lama tidak dapat dipercaya

`docs/` berisi 15 file (1.520 baris) yang **saya tulis sendiri selama pembangunan**, bukan
diturunkan dari verifikasi UI. Saat diaudit ditemukan klaim yang tidak sesuai kode:

| Klaim di dokumentasi | Kenyataan di kode |
|---|---|
| Pengguna dapat mengekspor/mengimpor data lewat aplikasi | `/api/export` dan `/api/import` **tidak punya tombol di UI mana pun**. Hanya bisa dipanggil via curl/terminal. |
| `docs/FINAL_PRODUCTION_AUDIT.md` menyatakan kesiapan produksi | Ditulis sebelum deploy nyata; tidak mencerminkan Supabase/Netlify |

Karena itu dokumen di `docs/audit/` dibuat ulang berdasarkan pemeriksaan langsung, dan
`docs/user/` menggunakan nama tombol yang **diverifikasi ada** di komponen.

## Fitur backend tanpa antarmuka (7 endpoint yatim)

Dipanggil dari tidak ada tempat di UI. Bukan bug kritis, tetapi fitur yang tidak dapat
ditemukan pengguna:

| Endpoint | Kegunaan | Dampak |
|---|---|---|
| `POST /api/stories/concepts` | buat konsep cerita | Studio memakai jalur lain |
| `POST /api/stories/[id]/score` | skor draft | tidak terjangkau |
| `POST /api/stories/[id]/naturalize` | haluskan teks | tidak terjangkau |
| `POST /api/sources/[id]/summarize` | ringkas sumber | tidak terjangkau |
| `POST /api/sources/[id]/insights` | tarik insight | tidak terjangkau |
| `GET /api/analytics/brief` | ringkasan analitik | tidak terjangkau |
| `POST /api/experiments/[id]/conclude` | tutup eksperimen | tidak terjangkau |

Alasan tidak dihapus: kode berfungsi dan mungkin dimaksudkan untuk fase berikutnya. Dicatat
sebagai keterbatasan, bukan diklaim sebagai fitur.
