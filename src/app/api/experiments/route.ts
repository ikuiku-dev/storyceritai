import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { saveAsExperiment } from "@/lib/services/arena/tournament";

export const GET = handler(async () => ok(await prisma.storyExperiment.findMany({
  orderBy: { createdAt: "desc" },
  include: { variants: { include: { draft: { select: { title: true, text: true, factCheckStatus: true } }, posts: { include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } } } } } },
})));

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    name: z.string().min(3).max(200),
    hypothesis: z.string().min(5).max(1000),
    productId: z.string().nullable().optional(),
    audience: z.string().max(300).nullable().optional(),
    observationDays: z.number().int().min(1).max(60).default(7),
    draftIds: z.array(z.string()).min(2).max(6),
  }));
  return ok(await saveAsExperiment(input), { status: 201 });
});
