# Deploy ke Netlify + Supabase

Aplikasi ini lokal-first: database-nya file SQLite di disk. Netlify Functions bersifat
serverless dan **filesystem-nya dihapus** setiap kali function berhenti, jadi SQLite akan
kehilangan semua data. Karena itu database dipindah ke Postgres (Supabase, gratis).

Skema sudah disiapkan: `prisma/schema.postgres.prisma` identik dengan `schema.prisma`
kecuali provider. Semua field JSON disimpan sebagai `String`, jadi tidak ada tipe yang
perlu diterjemahkan.

---

## Langkah 1 — Buat project Supabase

1. Daftar di https://supabase.com (gratis)
2. **New project** → pilih region terdekat (mis. `Southeast Asia (Singapore)`)
3. Simpan password database yang dibuat

## Langkah 2 — Ambil connection string

Supabase → **Project Settings → Database → Connection string**. Pilih **URI**, lalu
gunakan **Connection pooling** (port `6543`), bukan koneksi langsung.

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

> **Kenapa pooling?** Serverless membuka koneksi baru pada setiap invocation. Tanpa pooler,
> koneksi akan cepat habis dan aplikasi gagal dengan `too many connections`.

Ganti `<password>` dengan password Anda. Jika password mengandung karakter khusus
(`@ : / ?`), encode dulu (mis. `@` → `%40`).

## Langkah 3 — Buat tabel di Supabase

Jalankan dari folder proyek, dengan connection string tadi:

```bash
DATABASE_PROVIDER=postgresql \
DATABASE_URL="postgresql://postgres.<ref>:<password>@...pooler.supabase.com:6543/postgres" \
npx prisma db push --schema prisma/schema.postgres.prisma
```

Ini membuat 33 tabel. **Tanpa langkah ini, deploy akan berhasil tetapi setiap halaman
error** karena tabel tidak ada.

### Verifikasi

Buka Supabase → **Table Editor**. Harus terlihat tabel `StoryDraft`, `AIProvider`,
`UserSettings`, `IntegrationConnection`, dan 29 lainnya.

## Langkah 4 — Deploy ke Netlify

1. Push repo ke GitHub (Netlify butuh repo, bukan upload folder)
2. https://app.netlify.com → **Add new site → Import an existing project** → GitHub
3. Pilih repo. Netlify membaca `netlify.toml` otomatis — build command sudah diatur
4. **Site settings → Environment variables**, tambahkan:

| Nama | Nilai |
|---|---|
| `DATABASE_URL` | connection string Supabase (port 6543) |
| `DATABASE_PROVIDER` | `postgresql` |
| `CERITALAB_SECRET` | **sama persis** dengan yang di lokal |

### ⚠️ `CERITALAB_SECRET` harus sama

Nilai ini mengenkripsi API key provider AI dan App Secret Threads. Jika berbeda, data
terenkripsi yang Anda salin dari lokal **tidak bisa dibuka** dan aplikasi akan melaporkan
kredensial rusak. Ambil dari `.env` lokal Anda — jangan membuat yang baru.

5. **Deploy site**

## Langkah 5 — Verifikasi setelah deploy

```bash
curl -s https://<site-anda>.netlify.app/api/settings | head -c 200
```

Harapan: JSON `{"ok":true,...}`, **bukan** halaman HTML error.

Lalu buka di browser dan pastikan:
- [ ] Halaman utama memuat data (bukan kosong)
- [ ] `/providers` menampilkan provider AI Anda
- [ ] `/threads` menampilkan kredensial yang tersimpan
- [ ] Membuat satu cerita uji berhasil tersimpan

Kalau semua lolos, baru salin data dari lokal.

## Langkah 6 — Pindahkan data dari SQLite

Data lokal tidak ikut otomatis. Dua pilihan:

**A. Ekspor/impor JSON (disarankan, tidak menyentuh SQLite lokal)**

Aplikasi punya `/api/export?scope=full`. Unduh dari lokal, lalu impor ke yang sudah
deploy lewat `/api/import`. Ini tidak menghapus apa pun di lokal — aman.

**B. Mulai baru**

Untuk pemakaian baru, cukup isi ulang provider AI dan tautan afiliasi lewat UI.

> Jangan menyalin file `dev.db` — SQLite tidak bisa dibuka Postgres.

## Langkah 7 — Perbarui Redirect URI Threads

Domain berubah dari tunnel ke `https://<site-anda>.netlify.app`, jadi:

1. Meta → Threads API → Settings → ganti Redirect URI menjadi
   `https://<site-anda>.netlify.app/api/threads/callback`
2. CeritaLab `/threads` → tempel ulang Redirect URI → **Simpan kredensial**

Redirect URI lama (tunnel) akan tetap ditolak Meta.

---

## Catatan penting

### Worker & cron

Fitur terjadwal (`/api/worker/*`) mengandalkan proses yang berjalan terus. Di Netlify
tidak ada proses latar permanen. Auto-publish tetap **OFF**, jadi tidak ada yang rusak,
tapi penjadwalan tidak akan berjalan otomatis sampai dipindah ke Supabase Cron atau
Netlify Scheduled Functions.

### Batas gratis Supabase

| Batas | Nilai |
|---|---|
| Penyimpanan | 500 MB |
| Pause proyek | Setelah 7 hari tanpa aktivitas |

Proyek yang di-pause harus diaktifkan manual dari dashboard.

### Kalau build gagal dengan "adapter not compatible"

Prisma client harus digenerate untuk provider yang sesuai. `npm run build:netlify`
melakukan urutan yang benar:

```
prisma generate --schema prisma/schema.postgres.prisma && next build
```

Kalau Anda mengubah `schema.prisma`, jalankan `npm run schema:pg:sync` agar skema Postgres
ikut diperbarui, supaya keduanya tidak berbeda diam-diam.

### Biaya

Supabase dan Netlify punya tier gratis yang cukup untuk satu operator. Tidak ada biaya
selama tetap di dalam batas tersebut.
