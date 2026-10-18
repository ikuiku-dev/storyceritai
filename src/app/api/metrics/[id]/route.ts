import { handler, ok, parseBody, ApiError } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

// Manual metric entry — for when the API does not expose a number.
// Every field is optional; omitted stays null (unknown), never 0.
export const POST = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const post = await prisma.publishedPost.findUnique({ where: { id } });
  if (!post) throw new ApiError("Postingan tidak ditemukan", 404, "NOT_FOUND");

  const input = await parseBody(req, z.object({
    views: z.number().int().min(0).nullable().optional(),
    likes: z.number().int().min(0).nullable().optional(),
    replies: z.number().int().min(0).nullable().optional(),
    reposts: z.number().int().min(0).nullable().optional(),
    shares: z.number().int().min(0).nullable().optional(),
    note: z.string().max(300).nullable().optional(),
  }));

  const snap = await prisma.postMetricSnapshot.create({
    data: { postId: id, views: input.views ?? null, likes: input.likes ?? null, replies: input.replies ?? null, reposts: input.reposts ?? null, shares: input.shares ?? null, source: "MANUAL", note: input.note ?? null },
  });
  await audit({ action: "metrics.manual_entry", summary: `Metrik dimasukkan manual untuk postingan`, entityType: "PublishedPost", entityId: id, meta: { note: input.note } });
  return ok(snap, { status: 201 });
});
