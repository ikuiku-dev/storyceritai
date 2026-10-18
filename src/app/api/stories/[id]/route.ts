import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { z } from "zod";

export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const draft = await prisma.storyDraft.findUnique({
    where: { id },
    include: { concept: true, revisions: { orderBy: { revision: "desc" } }, scores: { orderBy: { createdAt: "desc" } } },
  });
  if (!draft) throw new ApiError("Draft tidak ditemukan", 404, "NOT_FOUND");
  return ok(draft);
});

export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const input = await req.json();
  const parsed = z.object({ title: z.string().max(200).nullable().optional(), status: z.enum(["DRAFT", "NEEDS_REVIEW", "REJECTED", "ARCHIVED"]).optional() }).safeParse(input);
  if (!parsed.success) throw new ApiError("Input tidak valid", 422, "VALIDATION_FAILED");
  return ok(await prisma.storyDraft.update({ where: { id }, data: parsed.data }));
});
