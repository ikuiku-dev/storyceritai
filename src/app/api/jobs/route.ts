import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async () => {
  // PublishingJob stores postId as a plain column (no FK), so join manually.
  const rows = await prisma.publishingJob.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const postIds = [...new Set(rows.map((r) => r.postId).filter((v): v is string => Boolean(v)))];
  const posts = postIds.length
    ? await prisma.publishedPost.findMany({ where: { id: { in: postIds } }, select: { id: true, finalText: true, status: true } })
    : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  const jobs = rows.map((r) => ({ ...r, post: r.postId ? byId.get(r.postId) ?? null : null }));
  const counts = await prisma.publishingJob.groupBy({ by: ["state"], _count: { _all: true } });
  return ok({ jobs, counts });
});
