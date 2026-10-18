import { prisma } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Callout, type Tone } from "@/components/ui/primitives";
import { ago } from "@/lib/format";
import { connection } from "next/server";

const catTone = (c: string): Tone => (c === "PROBLEM" ? "red" : c === "LANGUAGE" ? "blue" : c === "OBJECTION" ? "amber" : "neutral");
const evTone = (e: string): Tone => (e === "OBSERVATION" ? "green" : e === "PATTERN" ? "blue" : e === "INTERPRETATION" ? "violet" : "amber");

export default async function InsightsPage() {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const insights = await prisma.audienceInsight.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { source: { select: { title: true, domain: true } } },
  });
  const byCat = new Map<string, number>();
  for (const i of insights) byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Audience Insights" description="Wawasan yang diekstrak dari sumber. Tipe bukti dipisahkan supaya tafsiran tidak tersamar sebagai fakta." />

      <Callout tone="blue" title="Cara membaca halaman ini">
        <strong>OBSERVATION</strong> = tertulis di sumber · <strong>PATTERN</strong> = pola berulang ·
        <strong> INTERPRETATION</strong> = tafsiran AI · <strong>HYPOTHESIS</strong> = dugaan yang belum teruji.
        Keyakinan rendah bukan berarti salah, hanya belum didukung cukup.
      </Callout>

      <div className="mt-4 flex flex-wrap gap-2">
        {[...byCat.entries()].map(([c, n]) => (
          <Badge key={c} tone={catTone(c)}>{c} · {n}</Badge>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="Semua insight" subtitle={`${insights.length} insight`} />
        {insights.length === 0 ? (
          <EmptyState title="Belum ada insight" description="Buka Source Library, pilih sumber, lalu jalankan Ekstrak insight." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {insights.map((i) => (
              <li key={i.id} className="px-5 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={catTone(i.category)}>{i.category}</Badge>
                  <Badge tone={evTone(i.evidenceType)}>{i.evidenceType.toLowerCase()}</Badge>
                  <span className="mono text-[11px] text-ink-500">keyakinan {i.confidence}%</span>
                  <span className="text-[11px] text-ink-400">· {i.source?.title ?? i.source?.domain ?? "sumber"} · {ago(i.createdAt)}</span>
                </div>
                <p className="text-[13.5px] text-ink-800">{i.statement}</p>
                {i.evidenceQuote && <p className="mt-1 border-l-2 border-ink-200 pl-2 text-xs italic text-ink-500">{i.evidenceQuote}</p>}
                {i.limitation && <p className="mt-1 text-xs text-ink-500">Keterbatasan: {i.limitation}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
