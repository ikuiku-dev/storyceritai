"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Badge, Callout, PageHeader, EmptyState, Stat, type Tone } from "@/components/ui/primitives";
import { USD, NUM } from "@/lib/format";

interface Summary { n: number; mean: number | null; median: number | null; min: number | null; max: number | null }
interface OverviewData {
  posts: { total: number; published: number; draftQueue: number };
  metrics: { snapshots: number; views: Summary; likes: Summary; replies: Summary };
  cost: { totalUsd: number | null; pricedCalls: number; unpricedCalls: number; failedCalls: number; tokensIn: number; tokensOut: number; byTask: { task: string; usd: number }[]; dailyCap: number | null; monthlyCap: number | null };
}
interface ExpRow { id: string; name: string; status: string; hypothesis: string; _count: { variants: number } }
interface VariantAnalysis {
  label: string; total: number | null; successes: number | null; rate: number | null; ci: [number, number] | null;
  verdict: { verdict: string; note: string };
}
interface Analysis { experiment: { name: string; hypothesis: string; status: string }; required: number; variants: VariantAnalysis[]; conclusion: string }

const vTone = (v: string): Tone => (v === "CLEAR_LEADER" ? "green" : v === "UNDERPOWERED" ? "amber" : "neutral");
const vLabel = (v: string) => (v === "CLEAR_LEADER" ? "unggul jelas" : v === "UNDERPOWERED" ? "data kurang" : "belum bisa disimpulkan");

export function AnalyticsClient() {
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [exps, setExps] = useState<ExpRow[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [o, e] = await Promise.all([api<OverviewData>("/api/analytics/overview"), api<ExpRow[]>("/api/analytics/experiments")]);
        setOv(o); setExps(e);
      } catch (err) { setError((err as Error).message); }
    })();
  }, []);

  async function open(id: string) {
    setBusy(`open:${id}`); setError(null);
    try { setAnalysis(await api<Analysis>(`/api/analytics/experiments?id=${id}`)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const insufficient = ov ? ov.metrics.snapshots === 0 : true;

  return (
    <>
      <PageHeader title="Experiments & Analytics" description="Hanya angka yang benar-benar tercatat. Ukuran sampel ditampilkan lebih dulu daripada “pemenang”." />

      {error && <div className="mb-4"><Callout tone="red" title="Gagal">{error}</Callout></div>}

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Terbit" value={ov?.posts.published ?? 0} sub={`${ov?.posts.total ?? 0} total di antrean`} />
        <Stat label="Snapshot metrik" value={ov?.metrics.snapshots ?? 0} sub={insufficient ? "Belum ada data" : "Dari Threads API / input manual"} />
        <Stat label="Views" value={NUM(ov?.metrics.views.mean)} sub={ov?.metrics.views.n ? `median ${NUM(ov.metrics.views.median)} · n=${ov.metrics.views.n}` : "belum ada"} />
        <Stat label="Balasan" value={NUM(ov?.metrics.replies.mean)} sub={ov?.metrics.replies.n ? `n=${ov.metrics.replies.n}` : "belum ada"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Biaya AI" subtitle="Estimasi dari token tercatat × harga yang Anda isi." />
          <div className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-600">Total tercatat</span>
              <span className="mono text-xl font-semibold">{USD(ov?.cost.totalUsd)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px] text-ink-600">
              <span>Panggilan berharga: <span className="mono">{ov?.cost.pricedCalls ?? 0}</span></span>
              <span>Tanpa harga: <span className="mono">{ov?.cost.unpricedCalls ?? 0}</span></span>
              <span>Gagal: <span className="mono">{ov?.cost.failedCalls ?? 0}</span></span>
              <span>Token: <span className="mono">{NUM((ov?.cost.tokensIn ?? 0) + (ov?.cost.tokensOut ?? 0))}</span></span>
            </div>
            {(ov?.cost.unpricedCalls ?? 0) > 0 && (
              <Callout tone="amber" title="Estimasi tidak lengkap">
                {ov?.cost.unpricedCalls} panggilan tidak punya harga model. Isi harga di AI Providers supaya total ini akurat.
              </Callout>
            )}
            {ov && ov.cost.byTask.length > 0 && (
              <div>
                <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-500">Per jenis tugas</p>
                <ul className="space-y-1">
                  {ov.cost.byTask.slice(0, 6).map((t) => (
                    <li key={t.task} className="flex justify-between text-[13px] text-ink-700">
                      <span className="mono text-[12px]">{t.task}</span>
                      <span className="mono">{USD(t.usd)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Eksperimen" subtitle={`${exps.length} eksperimen`} />
          {exps.length === 0 ? (
            <EmptyState title="Belum ada eksperimen" description="Buat eksperimen dari Story Arena setelah turnamen selesai." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {exps.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13.5px] font-medium text-ink-800">{e.name}</p>
                    <Badge tone={e.status === "CONCLUDED" ? "green" : e.status === "RUNNING" ? "blue" : "neutral"}>{e.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">{e._count.variants} varian · {e.hypothesis.slice(0, 60)}</p>
                  <button onClick={() => open(e.id)} className="mt-1.5 text-xs font-medium text-brand-700 hover:underline">
                    {busy === `open:${e.id}` ? "Memuat…" : "Lihat analisis →"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {analysis && (
        <Card className="mt-4">
          <CardHeader title={analysis.experiment.name} subtitle={`Butuh ≥${analysis.required} views per varian untuk kesimpulan yang jujur`} />
          <div className="space-y-4 p-5">
            <Callout tone={analysis.conclusion.includes("belum cukup") || analysis.conclusion.includes("Belum ada") ? "amber" : "blue"} title="Kesimpulan (dihitung, bukan ditulis AI)">
              {analysis.conclusion}
            </Callout>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b hairline text-left text-[12px] uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2">Varian</th>
                    <th className="px-3 py-2">Views</th>
                    <th className="px-3 py-2">Balasan</th>
                    <th className="px-3 py-2">Rasio</th>
                    <th className="px-3 py-2">95% CI</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {analysis.variants.map((v) => (
                    <tr key={v.label}>
                      <td className="px-3 py-2 font-medium">{v.label}</td>
                      <td className="mono px-3 py-2">{v.total ?? "—"}</td>
                      <td className="mono px-3 py-2">{v.successes ?? "—"}</td>
                      <td className="mono px-3 py-2">{v.rate != null ? `${(v.rate * 100).toFixed(2)}%` : "—"}</td>
                      <td className="mono px-3 py-2 text-xs">{v.ci ? `${(v.ci[0] * 100).toFixed(1)}–${(v.ci[1] * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-3 py-2"><Badge tone={vTone(v.verdict.verdict)}>{vLabel(v.verdict.verdict)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-relaxed text-ink-500">{analysis.variants[0]?.verdict.note}</p>
          </div>
        </Card>
      )}

      <div className="mt-4">
        <Callout tone="blue" title="Metrik manual">
          Jika Threads API tidak menyediakan sebuah angka, masukkan manual lewat <code className="mono text-[12px]">POST /api/metrics/&lt;postId&gt;</code>.
          Kolom yang tidak diisi disimpan sebagai “tidak diketahui”, bukan nol.
        </Callout>
      </div>
    </>
  );
}
