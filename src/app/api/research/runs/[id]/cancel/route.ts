import { handler, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const run = await prisma.researchRun.findUnique({ where: { id } });
  if (!run) throw new ApiError("Run tidak ditemukan", 404, "NOT_FOUND");
  if (run.status === "DONE") throw new ApiError("Run sudah selesai", 409, "ALREADY_DONE");

  const cancelled = await prisma.researchRun.update({
    where: { id }, data: { status: "CANCELLED", completedAt: new Date(), stopReason: "Dibatalkan pengguna." },
  });
  await audit({ action: "research.run.cancelled", summary: "Run riset dibatalkan", entityType: "ResearchRun", entityId: id });
  return ok({ run: cancelled });
});
