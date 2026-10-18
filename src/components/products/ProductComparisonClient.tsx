"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Badge, Callout, PageHeader, EmptyState, Spinner } from "@/components/ui/primitives";

interface Snapshot {
  priceIdr: number | null;
  rating: number | null;
  reviewCount: number | null;
  soldCount: number | null;
  sourceOrigin: string;
  fetchedAt: string;
}

interface Product {
  id: string;
  name: string;
  shopName: string | null;
  category: string | null;
  url: string | null;
  sourceOrigin: string;
  verificationStatus: string;
  problemFitScore: number | null;
  demandEvidenceScore: number | null;
  dataQualityScore: number | null;
  demonstrabilityScore: number | null;
  commissionScore: number | null;
  riskScore: number | null;
  opportunityScore: number | null;
  snapshots: Snapshot[];
}

/** Missing data is an em-dash, never 0 — the difference matters for decisions. */
function v(n: number | null | undefined, suffix = ""): string {
  return n === null || n === undefined ? "—" : `${n}${suffix}`;
}

function rupiah(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `Rp${n.toLocaleString("id-ID")}`;
}

const DIMENSIONS: [string, (p: Product) => number | null][] = [
  ["Kecocokan masalah", (p) => p.problemFitScore],
  ["Bukti permintaan", (p) => p.demandEvidenceScore],
  ["Kualitas data", (p) => p.dataQualityScore],
  ["Kemudahan demo", (p) => p.demonstrabilityScore],
  ["Potensi komisi", (p) => p.commissionScore],
  ["Risiko (rendah = baik)", (p) => p.riskScore],
];

export default function ProductComparisonClient() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api<Product[]>("/api/products");
        const list = Array.isArray(r) ? r : [];
        setProducts(list);
        setSelected(list.slice(0, 3).map((p) => p.id));
      } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));
  }

  const chosen = (products ?? []).filter((p) => selected.includes(p.id));

  // Coverage is computed from what actually exists, so "60%" means 3 of 5 dimensions
  // carried real values — not an estimate.
  function coverage(p: Product) {
    const known = DIMENSIONS.filter(([, get]) => get(p) !== null).length;
    return { known, total: DIMENSIONS.length, unknown: DIMENSIONS.filter(([, get]) => get(p) === null).map(([n]) => n) };
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Product Comparison"
        description="Bandingkan berdampingan. Dimensi tanpa data tetap kosong — bukan diisi nol."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}
      {products === null && !error && <div className="flex items-center gap-2 text-sm text-ink-500"><Spinner /> Memuat…</div>}

      {products && products.length === 0 && (
        <EmptyState title="Belum ada produk" description="Tambahkan produk di halaman Product Research untuk membandingkannya di sini." />
      )}

      {products && products.length > 0 && (
        <>
          <Card>
            <CardHeader title="Pilih produk" subtitle="Maksimal 4 produk." />
            <div className="flex flex-wrap gap-2 p-5">
              {products.map((p) => (
                <Button key={p.id} size="sm" variant={selected.includes(p.id) ? "primary" : "ghost"} onClick={() => toggle(p.id)}>
                  {p.name.slice(0, 34)}
                </Button>
              ))}
            </div>
          </Card>

          {chosen.length > 0 && (
            <Card>
              <CardHeader title="Perbandingan" subtitle={`${chosen.length} produk dipilih`} />
              <div className="overflow-x-auto p-5">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="pb-2 pr-4 font-semibold">Atribut</th>
                      {chosen.map((p) => <th key={p.id} className="pb-2 pr-4 font-semibold text-ink-700">{p.name.slice(0, 22)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Harga terakhir</td>
                      {chosen.map((p) => <td key={p.id} className="py-2 pr-4">{rupiah(p.snapshots[0]?.priceIdr)}</td>)}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Rating</td>
                      {chosen.map((p) => <td key={p.id} className="py-2 pr-4">{v(p.snapshots[0]?.rating)}</td>)}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Jumlah ulasan</td>
                      {chosen.map((p) => <td key={p.id} className="py-2 pr-4">{v(p.snapshots[0]?.reviewCount)}</td>)}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Terjual</td>
                      {chosen.map((p) => <td key={p.id} className="py-2 pr-4">{v(p.snapshots[0]?.soldCount)}</td>)}
                    </tr>
                    {DIMENSIONS.map(([label, get]) => (
                      <tr key={label} className="border-t hairline">
                        <td className="py-2 pr-4 font-medium text-ink-600">{label}</td>
                        {chosen.map((p) => <td key={p.id} className="py-2 pr-4">{v(get(p), "/100")}</td>)}
                      </tr>
                    ))}
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Skor peluang</td>
                      {chosen.map((p) => <td key={p.id} className="py-2 pr-4 font-semibold">{v(p.opportunityScore)}</td>)}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Cakupan data</td>
                      {chosen.map((p) => {
                        const c = coverage(p);
                        return <td key={p.id} className="py-2 pr-4"><Badge tone={c.known === c.total ? "green" : "amber"}>{c.known}/{c.total}</Badge></td>;
                      })}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Dimensi kosong</td>
                      {chosen.map((p) => (
                        <td key={p.id} className="py-2 pr-4 text-[12px] text-ink-500">
                          {coverage(p).unknown.join(", ") || "—"}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Sumber</td>
                      {chosen.map((p) => <td key={p.id} className="py-2 pr-4 text-[12px]">{p.snapshots[0]?.sourceOrigin ?? p.sourceOrigin}</td>)}
                    </tr>
                    <tr className="border-t hairline">
                      <td className="py-2 pr-4 font-medium text-ink-600">Verifikasi</td>
                      {chosen.map((p) => (
                        <td key={p.id} className="py-2 pr-4">
                          <Badge tone={p.verificationStatus === "API_VERIFIED" ? "green" : p.verificationStatus === "USER_CONFIRMED" ? "violet" : "amber"}>
                            {p.verificationStatus}
                          </Badge>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Callout tone="amber" title="Kenapa banyak tanda “—”">
        Harga, rating, dan angka terjual hanya tampil bila ada snapshot dari sumber sah. Mengisinya
        dengan perkiraan akan membuat perbandingan terlihat lebih pasti daripada kenyataannya.
      </Callout>
    </div>
  );
}
