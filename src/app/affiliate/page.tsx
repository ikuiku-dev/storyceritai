import { prisma } from "@/lib/db";
import { PageHeader, Card, CardHeader, Badge, EmptyState, Table, Td, Callout, type Tone } from "@/components/ui/primitives";
import { IDR, DT } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";

const tone = (s: string): Tone => (s === "VALID" ? "green" : s === "INVALID" ? "red" : "neutral");

export default async function AffiliatePage() {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const links = await prisma.affiliateLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true } } },
  });
  const invalid = links.filter((l) => l.validationStatus === "INVALID").length;
  const unverified = links.filter((l) => l.validationStatus === "UNVERIFIED").length;

  return (
    <>
      <PageHeader
        title="Affiliate Links"
        description="Semua tautan diketik atau ditempel manual dari portal afiliasi. Aplikasi tidak pernah membuat tautan sendiri."
      />

      {(invalid > 0 || unverified > 0) && (
        <Callout tone="amber" title="Perlu diperiksa">
          {invalid} tautan tidak valid · {unverified} belum divalidasi. Buka{" "}
          <Link href="/products" className="underline">Product Research</Link> untuk memvalidasi.
        </Callout>
      )}

      <Card className="mt-4">
        <CardHeader title="Tautan" subtitle={`${links.length} tautan`} />
        {links.length === 0 ? (
          <EmptyState title="Belum ada tautan" description="Tambahkan tautan affiliate dari halaman Product Research." />
        ) : (
          <Table head={["Produk", "Tautan", "Status", "Komisi/order", "Diperiksa"]}>
            {links.map((l) => (
              <tr key={l.id}>
                <Td>{l.product.name}</Td>
                <Td>
                  <span className="mono text-[12px]">
                    {l.affiliateUrl.slice(0, 48)}
                    {l.affiliateUrl.length > 48 ? "…" : ""}
                  </span>
                  {l.validationNote && <p className="mt-0.5 text-[11px] text-ink-500">{l.validationNote.slice(0, 70)}</p>}
                </Td>
                <Td><Badge tone={tone(l.validationStatus)}>{l.validationStatus.toLowerCase()}</Badge></Td>
                <Td><span className="mono text-[12px]">{IDR(l.commissionPerOrderIdr)}</span></Td>
                <Td><span className="text-xs text-ink-500">{l.checkedAt ? DT(l.checkedAt) : "belum"}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
