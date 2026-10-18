import { handler, ok, parseBody } from "@/lib/api";
import { productInput } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = handler(async () => {
  return ok(await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      affiliateLinks: true,
      snapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
      _count: { select: { concepts: true } },
    },
  }));
});

export const POST = handler(async (req) => {
  const input = await parseBody(req, productInput);
  const p = await prisma.product.create({ data: { ...input, verificationStatus: "USER_CONFIRMED" } });
  await audit({ action: "product.created", summary: `Produk ditambahkan: ${p.name}`, entityType: "Product", entityId: p.id });
  return ok(p, { status: 201 });
});
