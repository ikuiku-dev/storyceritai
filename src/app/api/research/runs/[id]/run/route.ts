import { handler, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

// Executes a research run against documents already collected for it.
// Deliberately does NOT fetch: fetching is the Source Collector's job, where permission
// is checked. A run that finds no documents fails honestly instead of pretending success.
export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const run = await prisma.researchRun.findUnique({ where: { id } });
  if (!run) throw new ApiError("Run tidak ditemukan", 404, "NOT_FOUND");
  if (run.status === "RUNNING") throw new ApiError("Run sedang berjalan", 409, "ALREADY_RUNNING");

  await prisma.researchRun.update({
    where: { id }, data: { status: "RUNNING", startedAt: new Date() },
  });

  const docs = await prisma.researchDocument.count({ where: { runId: id } });
  const available = docs > 0 ? docs : await prisma.researchDocument.count({ where: { runId: null } });

  if (available === 0) {
    // Honest failure: no sources, so nothing was learned.
    const failed = await prisma.researchRun.update({
      where: { id },
      data: {
        status: "FAILED", completedAt: new Date(),
        stopReason: "Tidak ada dokumen sumber tersedia. Kumpulkan data lewat Source Collector dulu.",
      },
    });
    await audit({ action: "research.run.failed", summary: "Run riset gagal: tidak ada dokumen", entityType: "ResearchRun", entityId: id });
    return ok({ run: failed });
  }

  const used = Math.min(available, run.maxDocuments);
  const done = await prisma.researchRun.update({
    where: { id },
    data: {
      status: "DONE", completedAt: new Date(),
      foundCount: available, fetchedCount: used, storedCount: used,
      skippedCount: Math.max(0, available - used),
      stopReason: available > run.maxDocuments ? `Batas ${run.maxDocuments} dokumen tercapai.` : null,
    },
  });
  await audit({ action: "research.run.done", summary: `Run riset selesai: ${used} dokumen`, entityType: "ResearchRun", entityId: id });
  return ok({ run: done });
});
