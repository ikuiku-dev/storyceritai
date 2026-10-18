import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async () => {
  const items = await prisma.publishedPost.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, finalText: true, status: true, scheduledAt: true, publishedAt: true,
      affiliateUrl: true, disclosureIncluded: true, failedReason: true,
    },
  });
  return ok({ items });
});
