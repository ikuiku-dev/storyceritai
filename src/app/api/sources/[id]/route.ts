import { handler, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const row = await prisma.source.findUnique({ where: { id }, include: { insights: { orderBy: { createdAt: "desc" } }, excerpts: true } });
  if (!row) throw new ApiError("Sumber tidak ditemukan", 404, "NOT_FOUND");
  return ok(row);
});

export const DELETE = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  await prisma.source.delete({ where: { id } });
  const { audit } = await import("@/lib/audit");
  await audit({ action: "source.deleted", summary: `Sumber dihapus`, entityType: "Source", entityId: id });
  return ok({ deleted: true });
});
