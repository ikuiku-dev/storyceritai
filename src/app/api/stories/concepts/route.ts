import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { generateConcepts } from "@/lib/services/stories/service";

const schema = z.object({
  audienceProblem: z.string().min(5).max(1000),
  audience: z.string().max(300).nullable().optional(),
  productId: z.string().nullable().optional(),
  sourceIds: z.array(z.string()).max(10).default([]),
  count: z.number().int().min(4).max(12).default(10),
});

export const POST = handler(async (req) => ok(await generateConcepts(await parseBody(req, schema))));

export const GET = handler(async () => {
  const { prisma } = await import("@/lib/db");
  return ok(await prisma.storyConcept.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { drafts: true } } } }));
});
