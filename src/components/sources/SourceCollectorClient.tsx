"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Select, Textarea, Badge, Callout, PageHeader, EmptyState, Table, Td } from "@/components/ui/primitives";

interface SourceRow {
  id: string;
  name: string;
  domain: string;
  adapterType: string;
  permissionStatus: string;
  robotsStatus: string | null;
  robotsCheckedAt: string | null;
  crawlDelayMs: number | null;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

const PERM_TONE: Record<string, "green" | "amber" | "red" | "neutral" | "violet"> = {
  ALLOWED: "green",
  USER_IMPORT: "violet",
  UNKNOWN: "amber",
  DISALLOWED: "red",
};

const PERM_LABEL: Record<string, string> = {
  ALLOWED: "Diizinkan",
  USER_IMPORT: "Impor pengguna",
  UNKNOWN: "Belum pasti",
  DISALLOWED: "Dilarang",
};

export default function SourceCollectorClient() {
  const [rows, setRows] = useState<SourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | false>(false);

  const [url, setUrl] = useState("");
  const [adapter, setAdapter] = useState("rss");
  const [format, setFormat] = useState("json");
  const [raw, setRaw] = useState("");

  async function load() {
    try {
      const r = await api<{ sources: SourceRow[] }>("/api/sources/registry");
      setRows(r.sources);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void load(); }, []);

  async function testAccess() {
    setBusy("test"); setError(null); setNotice(null);
    try {
      const r = await api<{ allowed: boolean; verdict: string; reason: string; minDelayMs: number }>(
        "/api/sources/test-access",
        { method: "POST", body: JSON.stringify({ url, adapterType: adapter }) },
      );
      setNotice(`${r.allowed ? "Diizinkan" : "Tidak diizinkan"} (${r.verdict}) — ${r.reason}`);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function doImport() {
    setBusy("import"); setError(null); setNotice(null);
    try {
      const r = await api<{ imported: number; skipped: { index: number; reason: string }[] }>(
        "/api/research/import",
        { method: "POST", body: JSON.stringify({ format, raw }) },
      );
      setNotice(`Diimpor: ${r.imported}. Dilewati: ${r.skipped.length}${r.skipped.length ? ` — ${r.skipped[0].reason}` : ""}`);
      setRaw("");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Source Collector"
        description="Kumpulkan referensi secara sah. robots.txt diperiksa sebagai salah satu sinyal izin — bukan satu-satunya."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}
      {notice && <Callout tone="green" title="Hasil">{notice}</Callout>}

      <Card>
        <CardHeader title="Uji akses sumber" subtitle="Periksa izin sebelum mengambil data." />
        <div className="space-y-3 p-5">
          <Field label="URL sumber">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://contoh.com/feed.xml" />
          </Field>
          <Field label="Jenis adapter">
            <Select value={adapter} onChange={(e) => setAdapter(e.target.value)}>
              <option value="rss">RSS feed — dirancang untuk dibaca mesin</option>
              <option value="public_api">API publik resmi</option>
              <option value="sitemap">Sitemap</option>
              <option value="manual_url">Halaman biasa (izin lebih lemah)</option>
            </Select>
          </Field>
          <Button variant="primary" onClick={testAccess} loading={busy === "test"} disabled={url.trim().length < 8}>
            Test access
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Impor data Anda" subtitle="Jalur yang selalu tersedia, tanpa perlu crawling." />
        <div className="space-y-3 p-5">
          <Callout tone="blue" title="Kapan memakai ini">
            Jika situs tidak mengizinkan pengambilan otomatis, atau izinnya tidak jelas, impor data yang
            Anda berhak gunakan. Data impor ditandai “Impor pengguna”, tidak pernah disajikan sebagai hasil crawl.
          </Callout>
          <Field label="Format">
            <Select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="json">JSON — [{`{"url","title","text"}`}]</option>
              <option value="csv">CSV — kolom url,title,text</option>
              <option value="text">Teks / Markdown — blok dipisah baris kosong</option>
            </Select>
          </Field>
          <Field label="Isi">
            <Textarea rows={7} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Tempel data di sini…" />
          </Field>
          <Button variant="primary" onClick={doImport} loading={busy === "import"} disabled={raw.trim().length < 20}>
            Import
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Registry sumber" subtitle="Status izin yang tercatat, bukan asumsi." action={<Button size="sm" variant="ghost" onClick={() => void load()}>Muat ulang</Button>} />
        {rows === null ? (
          <div className="p-5 text-sm text-ink-500">Memuat…</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada sumber terdaftar" description="Uji akses atau impor data untuk mulai mengisi registry." />
        ) : (
          <Table head={["Domain", "Adapter", "Izin", "robots.txt", "Jeda", "Aktif"]}>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hairline">
                <Td><span className="font-medium text-ink-900">{r.domain}</span></Td>
                <Td><span className="text-[12px] text-ink-600">{r.adapterType}</span></Td>
                <Td><Badge tone={PERM_TONE[r.permissionStatus] ?? "neutral"}>{PERM_LABEL[r.permissionStatus] ?? r.permissionStatus}</Badge></Td>
                <Td><span className="text-[12px] text-ink-600">{r.robotsStatus ?? "—"}</span></Td>
                <Td><span className="text-[12px] text-ink-600">{r.crawlDelayMs ? `${Math.round(r.crawlDelayMs / 1000)}s` : "—"}</span></Td>
                <Td>{r.enabled ? <Badge tone="green">ya</Badge> : <Badge tone="neutral">tidak</Badge>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Callout tone="amber" title="Batas yang tidak dilewati">
        Tidak ada login, CAPTCHA, paywall, atau endpoint privat yang dilewati. Jika robots.txt melarang,
        pengambilan berhenti — tidak ada opsi untuk memaksa.
      </Callout>
    </div>
  );
}
