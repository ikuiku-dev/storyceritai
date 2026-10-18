import { handler, ok, parseBody, ApiError } from "@/lib/api";
import { productScoreInput } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { recomputeScore } from "@/lib/services/products/service";
import { audit } from "@/lib/audit";

export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const p = await prisma.product.findUnique({
    where: { id },
    include: { affiliateLinks: true, snapshots: { orderBy: { fetchedAt: "desc" } }, concepts: true },
  });
  if (!p) throw new ApiError("Produk tidak ditemukan", 404, "NOT_FOUND");
  return ok(p);
});

export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(req, productScoreInput);
  await prisma.product.update({ where: { id }, data: input });
  const score = await recomputeScore(id);
  await audit({ action: "product.scored", summary: `Skor peluang dihitung ulang (${score.score ?? "belum cukup data"})`, entityType: "Product", entityId: id });
  return ok(score);
});

export const DELETE = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  await prisma.product.delete({ where: { id } });
  await audit({ action: "product.deleted", summary: "Produk dihapus", entityType: "Product", entityId: id });
  return ok({ deleted: true });
});
