import { handler, ok, parseBody, ApiError } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = handler(async () => {
  const runs = await prisma.researchRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return ok({ runs });
});

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    keywords: z.string().min(3).max(300),
    question: z.string().max(500).optional(),
    language: z.string().default("id"),
    sourceTypes: z.array(z.string()).default([]),
    maxDocuments: z.number().int().min(1).max(100).default(10),
  }));
  if (input.maxDocuments > 50) throw new ApiError("Maksimum 50 dokumen per run untuk membatasi biaya.", 422, "LIMIT_TOO_HIGH");

  const run = await prisma.researchRun.create({
    data: {
      keywords: input.keywords,
      question: input.question ?? null,
      language: input.language,
      sourceTypes: input.sourceTypes.join(","),
      maxDocuments: input.maxDocuments,
      status: "QUEUED",
    },
  });
  await audit({ action: "research.run.created", summary: `Run riset dibuat: ${input.keywords.slice(0, 60)}`, entityType: "ResearchRun", entityId: run.id });
  return ok({ run });
});
