import { prisma } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Table, Td, type Tone } from "@/components/ui/primitives";
import { DT } from "@/lib/format";
import { connection } from "next/server";

const tone = (a: string): Tone =>
  a.includes("delete") || a.includes("failed")
    ? "red"
    : a.includes("publish") || a.includes("approved")
      ? "green"
      : a.includes("created")
        ? "blue"
        : "neutral";

export default async function AuditPage() {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Setiap tindakan penting dicatat dan tidak bisa diubah dari UI — termasuk perubahan provider, persetujuan, dan publikasi."
      />
      <Card>
        <CardHeader title="Aktivitas terbaru" subtitle={`${rows.length} entri`} />
        {rows.length === 0 ? (
          <EmptyState title="Belum ada aktivitas" description="Log akan terisi saat Anda mulai menggunakan aplikasi." />
        ) : (
          <Table head={["Waktu", "Aksi", "Ringkasan", "Aktor", "Objek"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><span className="mono text-xs text-ink-500">{DT(r.createdAt)}</span></Td>
                <Td><Badge tone={tone(r.action)}>{r.action}</Badge></Td>
                <Td><span className="text-[13px]">{r.summary}</span></Td>
                <Td><span className="text-xs text-ink-500">{r.actor}</span></Td>
                <Td><span className="mono text-[11px] text-ink-400">{r.entityType ?? "—"}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
