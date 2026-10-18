import { handler, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

// Approval is the ONLY path to APPROVED. Blockers are re-checked here, server-side.
export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const draft = await prisma.storyDraft.findUnique({ where: { id } });
  if (!draft) throw new ApiError("Draft tidak ditemukan", 404, "NOT_FOUND");
  const settings = await prisma.userSettings.findUnique({ where: { id: "singleton" } });
  const requireFact = settings?.requireFactCheckPass ?? true;

  if (draft.factCheckStatus === "FAILED") throw new ApiError("Fact-check gagal — perbaiki dulu sebelum disetujui.", 409, "FACT_CHECK_FAILED");
  if (requireFact && draft.factCheckStatus !== "PASSED" && draft.factCheckStatus !== "WARNINGS") {
    throw new ApiError("Jalankan fact-check sebelum menyetujui.", 409, "FACT_CHECK_REQUIRED");
  }
  if (draft.duplicateOfId && (draft.similarityScore ?? 0) >= 0.85) throw new ApiError("Terlalu mirip dengan draft lain. Edit dulu.", 409, "DUPLICATE");

  const updated = await prisma.storyDraft.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy: "user" } });
  await audit({ action: "story.approved", summary: `Cerita disetujui: ${draft.title ?? draft.id}`, entityType: "StoryDraft", entityId: id, meta: { factCheck: draft.factCheckStatus } });
  return ok(updated);
});
