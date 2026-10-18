import { handler, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { approvePost, schedulePost } from "@/lib/services/publishing/service";
import { z } from "zod";

export const POST = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const p = z.object({ scheduledAt: z.string().datetime().optional() }).safeParse(body);
  if (!p.success) throw new ApiError("Input tidak valid", 422);

  // Auto-publish must never happen implicitly: approving only sets APPROVED/ SCHEDULED.
  const post = await approvePost(id);
  if (p.data.scheduledAt) return ok(await schedulePost(id, new Date(p.data.scheduledAt)));
  return ok(post);
});

export const DELETE = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const updated = await prisma.publishedPost.update({ where: { id }, data: { status: "CANCELLED" } });
  return ok(updated);
});
