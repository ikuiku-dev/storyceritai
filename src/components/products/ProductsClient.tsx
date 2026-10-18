"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Textarea, Badge, Callout, PageHeader, EmptyState, Table, Td, type Tone } from "@/components/ui/primitives";
import { IDR } from "@/lib/format";

interface Snap { priceIdr: number | null; rating: number | null; reviewCount: number | null; fetchedAt: string }
interface Link { id: string; affiliateUrl: string; validationStatus: string; validationNote: string | null; commissionPerOrderIdr: number | null }
interface Product {
  id: string; name: string; shopName: string | null; category: string | null; url: string | null;
  buyerProblem: string | null; sourceOrigin: string; verificationStatus: string;
  opportunityScore: number | null; problemFitScore: number | null; demandEvidenceScore: number | null;
  dataQualityScore: number | null; demonstrabilityScore: number | null; commissionScore: number | null;
  riskScore: number | null; notes: string | null;
  snapshots: Snap[]; affiliateLinks: Link[];
}

const DIMS: [keyof Product, string, string][] = [
  ["problemFitScore", "Kecocokan masalah", "25%"],
  ["demandEvidenceScore", "Bukti permintaan", "20%"],
  ["dataQualityScore", "Kualitas data", "15%"],
  ["demonstrabilityScore", "Kemudahan didemokan", "15%"],
  ["commissionScore", "Potensi komisi", "15%"],
  ["riskScore", "Risiko (makin tinggi = makin buruk)", "10%"],
];

const linkTone = (s: string): Tone => (s === "VALID" ? "green" : s === "INVALID" ? "red" : "neutral");

export function ProductsClient() {
  const [rows, setRows] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [shop, setShop] = useState("");
  const [problem, setProblem] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sel, setSel] = useState<Product | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [affUrl, setAffUrl] = useState("");

  async function load() {
    try { setRows(await api<Product[]>("/api/products")); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function addProduct() {
    setError(null); setBusy("add");
    try {
      await api("/api/products", { method: "POST", body: JSON.stringify({ name, shopName: shop || null, buyerProblem: problem || null, sourceOrigin: "MANUAL" }) });
      setName(""); setShop(""); setProblem(""); setNotice("Produk ditambahkan."); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function importCsv() {
    setError(null); setBusy("csv");
    try {
      const r = await api<{ created: number; errors: { row: number; message: string }[] }>("/api/products/import", { method: "POST", body: JSON.stringify({ csv }) });
      setNotice(`${r.created} produk diimpor${r.errors.length ? `, ${r.errors.length} gagal` : ""}.`);
      if (r.errors.length) setError(r.errors.map((x) => `Baris ${x.row}: ${x.message}`).join("; "));
      setCsv(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function saveScores(id: string) {
    setError(null); setBusy(`score:${id}`);
    try {
      const payload: Record<string, number | null> = {};
      for (const [k] of DIMS) {
        const v = scores[k as string];
        payload[k as string] = v === undefined || v === "" ? null : Number(v);
      }
      const r = await api<{ score: number | null; explanation: string }>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setNotice(r.explanation); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function addLink(productId: string) {
    setError(null); setBusy("link");
    try {
      await api("/api/affiliate-links", { method: "POST", body: JSON.stringify({ productId, affiliateUrl: affUrl, urlSource: "MANUAL", active: true }) });
      setAffUrl(""); setNotice("Tautan ditambahkan. Jalankan validasi."); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function validate(linkId: string) {
    setError(null); setBusy(`val:${linkId}`);
    try {
      const r = await api<{ status: string; note: string }>(`/api/affiliate-links/${linkId}/validate`, { method: "POST" });
      setNotice(`${r.status}: ${r.note}`); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Product Research" description="Simpan kandidat produk beserta sumber datanya. Skor peluang transparan — dimensi tanpa data ditandai “belum diketahui”, bukan diisi angka." />

      {error && <div className="mb-4"><Callout tone="red" title="Perhatian">{error}</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="blue">{notice}</Callout></div>}

      <Callout tone="amber" title="Status integrasi Shopee">
        Tidak ada API pencarian produk publik yang tersedia untuk akun affiliate biasa. Gunakan input manual, URL produk, atau impor CSV/JSON.
        Kolom yang didukung: name, shopName, category, url, buyerProblem, priceIdr, rating, reviewCount, commissionPerOrderIdr.
        Data hasil impor berlabel <strong>UNVERIFIED</strong> sampai Anda memeriksanya.
      </Callout>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tambah produk manual" />
          <div className="space-y-3 p-5">
            <Field label="Nama produk" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stand HP lipat" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Toko"><Input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="Nama toko" /></Field>
              <Field label="Masalah pembeli"><Input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Meja sempit" /></Field>
            </div>
            <Button variant="primary" onClick={addProduct} loading={busy === "add"} disabled={!name.trim()}>Tambah</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Impor CSV" subtitle="Baris pertama = header." />
          <div className="space-y-3 p-5">
            <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,shopName,buyerProblem,priceIdr\nStand HP,Toko A,Meja sempit,45000"} className="mono text-[12px]" />
            <Button onClick={importCsv} loading={busy === "csv"} disabled={!csv.trim()}>Impor</Button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Kandidat produk" subtitle={`${rows.length} produk`} />
        {rows.length === 0 ? (
          <EmptyState title="Belum ada produk" description="Tambahkan produk pertama, atau impor CSV hasil riset manual Anda." />
        ) : (
          <Table head={["Produk", "Harga", "Skor peluang", "Asal data", ""]}>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-ink-100/40">
                <Td>
                  <p className="font-medium text-ink-900">{p.name}</p>
                  <p className="text-xs text-ink-500">{p.shopName ?? "—"}{p.buyerProblem ? ` · ${p.buyerProblem}` : ""}</p>
                </Td>
                <Td><span className="mono">{IDR(p.snapshots[0]?.priceIdr ?? null)}</span></Td>
                <Td>{p.opportunityScore != null ? <Badge tone="violet">{p.opportunityScore}/100</Badge> : <span className="text-xs text-ink-400">belum diketahui</span>}</Td>
                <Td><Badge tone={p.verificationStatus === "USER_CONFIRMED" ? "green" : "neutral"}>{p.sourceOrigin.toLowerCase()}</Badge></Td>
                <Td>
                  <Button size="sm" onClick={() => { setSel(p); setScores(Object.fromEntries(DIMS.map(([k]) => [k as string, p[k] != null ? String(p[k]) : ""]))); }}>
                    Nilai & tautan
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {sel && (
        <Card className="mt-4">
          <CardHeader title={`Nilai: ${sel.name}`} subtitle="Isi hanya yang Anda ketahui. Kosongkan yang tidak." action={<Button size="sm" variant="ghost" onClick={() => setSel(null)}>Tutup</Button>} />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-3">
              {DIMS.map(([k, label, weight]) => (
                <div key={k as string} className="flex items-center gap-3">
                  <label className="w-56 shrink-0 text-[13px] text-ink-700">{label} <span className="text-ink-400">({weight})</span></label>
                  <Input type="number" min={0} max={100} value={scores[k as string] ?? ""} onChange={(e) => setScores((s) => ({ ...s, [k as string]: e.target.value }))} placeholder="belum diketahui" />
                </div>
              ))}
              <Button variant="primary" onClick={() => saveScores(sel.id)} loading={busy === `score:${sel.id}`}>Hitung skor</Button>
            </div>

            <div>
              <h4 className="mb-2 text-[13px] font-semibold text-ink-800">Tautan affiliate</h4>
              <div className="space-y-2">
                <Input value={affUrl} onChange={(e) => setAffUrl(e.target.value)} placeholder="https://shope.ee/..." />
                <Button size="sm" onClick={() => addLink(sel.id)} loading={busy === "link"} disabled={!affUrl.trim()}>Tambah tautan</Button>
              </div>
              <ul className="mt-3 space-y-2">
                {sel.affiliateLinks.length === 0 && <li className="text-xs text-ink-500">Belum ada tautan.</li>}
                {sel.affiliateLinks.map((l) => (
                  <li key={l.id} className="rounded-lg border hairline p-3">
                    <p className="mono truncate text-[12px] text-ink-700">{l.affiliateUrl}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone={linkTone(l.validationStatus)}>{l.validationStatus.toLowerCase()}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => validate(l.id)} loading={busy === `val:${l.id}`}>Validasi</Button>
                    </div>
                    {l.validationNote && <p className="mt-1 text-xs text-ink-500">{l.validationNote}</p>}
                  </li>
                ))}
              </ul>
              {sel.notes && <div className="mt-3"><Callout tone="neutral">{sel.notes}</Callout></div>}
              <p className="mt-3 text-xs leading-relaxed text-ink-500">Tautan affiliate tidak pernah dibuat otomatis — tempel versi asli dari portal afiliasi Shopee.</p>
            </div>

            <div className="border-t hairline pt-4">
              <h4 className="mb-1 text-[13px] font-semibold text-ink-800">Langkah berikutnya</h4>
              <p className="mb-2 text-xs leading-relaxed text-ink-500">
                Bawa produk ini ke Story Studio. Nama produk dan masalah audiensnya terisi
                otomatis, jadi tidak perlu diketik ulang.
              </p>
              <a
                href={`/studio?product=${sel.id}${sel.buyerProblem ? `&problem=${encodeURIComponent(sel.buyerProblem)}` : ""}`}
                className="inline-flex items-center rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
              >
                Buat cerita dari produk ini →
              </a>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
