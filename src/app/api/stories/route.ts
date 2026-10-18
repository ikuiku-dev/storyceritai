import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async (req) => {
  const status = new URL(req.url).searchParams.get("status");
  const drafts = await prisma.storyDraft.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      concept: { select: { title: true, angle: true } },
      scores: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return ok(drafts);
});
