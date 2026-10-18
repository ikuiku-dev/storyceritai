import { handler, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { audit } from "@/lib/audit";

export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const exp = await prisma.storyExperiment.findUnique({
    where: { id },
    include: { variants: { include: { draft: true, posts: { include: { metrics: { orderBy: { capturedAt: "desc" } } } } } } },
  });
  if (!exp) throw new ApiError("Eksperimen tidak ditemukan", 404, "NOT_FOUND");
  return ok(exp);
});

export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const input = await req.json();
  const p = z.object({
    status: z.enum(["DRAFT", "RUNNING", "AWAITING_DATA", "CONCLUDED", "CANCELLED"]).optional(),
    conclusion: z.string().max(2000).nullable().optional(),
    recommendation: z.string().max(2000).nullable().optional(),
  }).safeParse(input);
  if (!p.success) throw new ApiError("Input tidak valid", 422);
  const data: Record<string, unknown> = { ...p.data };
  if (p.data.status === "RUNNING") data.startedAt = new Date();
  if (p.data.status === "CONCLUDED") data.concludedAt = new Date();
  const updated = await prisma.storyExperiment.update({ where: { id }, data });
  await audit({ action: "experiment.updated", summary: `Eksperimen diperbarui: ${updated.status}`, entityType: "StoryExperiment", entityId: id });
  return ok(updated);
});
