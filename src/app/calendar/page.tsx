import { prisma } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Callout, type Tone } from "@/components/ui/primitives";
import { DT } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";

const stTone = (s: string): Tone => (s === "PUBLISHED" ? "green" : s === "FAILED" ? "red" : s === "SCHEDULED" ? "blue" : "amber");

export default async function CalendarPage() {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const posts = await prisma.publishedPost.findMany({
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { draft: { select: { title: true } } },
  });
  const upcoming = posts.filter((p) => ["SCHEDULED", "APPROVED", "WAITING_APPROVAL"].includes(p.status));
  const done = posts.filter((p) => ["PUBLISHED", "FAILED", "CANCELLED"].includes(p.status));
  const settings = await prisma.userSettings.findUnique({ where: { id: "singleton" } });

  return (
    <>
      <PageHeader title="Publishing Calendar" description="Antrean dan riwayat publikasi. Tidak ada posting yang terbit tanpa persetujuan Anda." />

      <Callout tone="blue" title="Mode publikasi saat ini">
        <strong>{settings?.publishingMode ?? "MANUAL_APPROVAL"}</strong>
        {settings?.publishingMode === "AUTO_PUBLISH"
          ? settings.autoPublishEnabled
            ? " — auto-publish aktif."
            : " — dipilih tetapi auto-publish dimatikan (perilaku aman)."
          : " — Anda yang memutuskan kapan menekan Terbitkan."}{" "}
        Batas {settings?.maxPostsPerDay ?? 3}/hari, jarak minimal {settings?.minGapMinutes ?? 60} menit.
      </Callout>

      <Card className="mt-4">
        <CardHeader title="Akan datang / menunggu" subtitle={`${upcoming.length} postingan`} />
        {upcoming.length === 0 ? (
          <EmptyState
            title="Tidak ada antrean"
            description="Siapkan postingan di halaman Threads Integration."
            action={<Link className="text-sm font-medium text-brand-700 hover:underline" href="/threads">Buka Threads</Link>}
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {upcoming.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] text-ink-800">{p.finalText.slice(0, 100)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {p.scheduledAt ? `Dijadwalkan ${DT(p.scheduledAt)}` : "Belum dijadwalkan"}
                    {p.draft?.title ? ` · draft: ${p.draft.title}` : ""}
                  </p>
                </div>
                <Badge tone={stTone(p.status)}>{p.status.toLowerCase().replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Riwayat" subtitle={`${done.length} postingan`} />
        {done.length === 0 ? (
          <EmptyState title="Belum ada riwayat" description="Postingan yang sudah terbit atau gagal akan muncul di sini." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {done.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] text-ink-800">{p.finalText.slice(0, 100)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{p.publishedAt ? `Terbit ${DT(p.publishedAt)}` : (p.failedReason ?? "—")}</p>
                </div>
                <Badge tone={stTone(p.status)}>{p.status.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
