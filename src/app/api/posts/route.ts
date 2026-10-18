import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkGuardrails, queuePost } from "@/lib/services/publishing/service";

export const GET = handler(async () => ok(await prisma.publishedPost.findMany({
  orderBy: { createdAt: "desc" }, take: 100,
  include: { draft: { select: { title: true, truthMode: true } }, metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
})));

// Prepare a post (does not publish). Returns guardrail results.
export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    draftId: z.string().nullable().optional(),
    finalText: z.string().min(1).max(5000),
    affiliateUrl: z.string().url().nullable().optional(),
    disclosureIncluded: z.boolean().default(false),
    truthMode: z.string().default("HYPOTHETICAL"),
    factCheckStatus: z.string().default("NOT_RUN"),
    scheduledAt: z.string().datetime().nullable().optional(),
  }));

  const guard = await checkGuardrails({
    text: input.finalText, truthMode: input.truthMode,
    factCheckStatus: input.factCheckStatus, affiliateUrl: input.affiliateUrl ?? null,
  });
  if (!guard.ok) return ok({ prepared: false, guard }, { status: 409 });

  const { post, created } = await queuePost({
    draftId: input.draftId ?? null, finalText: input.finalText, affiliateUrl: input.affiliateUrl ?? null,
    disclosureIncluded: input.disclosureIncluded,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
  });
  return ok({ prepared: true, post, created, guard }, { status: created ? 201 : 200 });
});
