import { prisma } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Callout, type Tone } from "@/components/ui/primitives";
import { D } from "@/lib/format";
import { connection } from "next/server";

const stTone = (s: string): Tone => (s === "CONCLUDED" ? "green" : s === "RUNNING" ? "blue" : s === "CANCELLED" ? "red" : "neutral");

export default async function KnowledgePage() {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const exps = await prisma.storyExperiment.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { variants: true } } },
  });
  const concluded = exps.filter((e) => e.status === "CONCLUDED");

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Pelajaran dari eksperimen yang sudah selesai. Satu hasil tidak otomatis menjadi aturan umum."
      />

      <Callout tone="blue" title="Prinsip">
        Sebuah eksperimen ditandai selesai hanya jika sampelnya cukup dan Anda sendiri menutupnya. Halaman ini mencatat apa yang
        <em> terjadi</em>, bukan apa yang <em>seharusnya</em>.
      </Callout>

      <Card className="mt-4">
        <CardHeader title="Eksperimen" subtitle={`${concluded.length} selesai dari ${exps.length}`} />
        {exps.length === 0 ? (
          <EmptyState title="Belum ada eksperimen" description="Jalankan Story Arena lalu simpan hasilnya sebagai eksperimen." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {exps.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium text-ink-800">{e.name}</span>
                  <Badge tone={stTone(e.status)}>{e.status.toLowerCase()}</Badge>
                  <span className="text-[11px] text-ink-400">{e._count.variants} varian · {D(e.createdAt)}</span>
                </div>
                <p className="mt-1 text-[13px] text-ink-600">Hipotesis: {e.hypothesis}</p>
                {e.conclusion ? (
                  <p className="mt-1 rounded-md bg-brand-50 px-2 py-1 text-[13px] text-ink-700">Kesimpulan: {e.conclusion}</p>
                ) : (
                  <p className="mt-1 text-xs text-ink-500">Belum disimpulkan.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
