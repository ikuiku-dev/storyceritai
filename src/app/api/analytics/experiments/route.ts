import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { analyzeExperiment } from "@/lib/services/analytics/service";

export const GET = handler(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (id) return ok(await analyzeExperiment(id));
  const list = await prisma.storyExperiment.findMany({
    orderBy: { createdAt: "desc" }, take: 50,
    include: { _count: { select: { variants: true } } },
  });
  return ok(list);
});
