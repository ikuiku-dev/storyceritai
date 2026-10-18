// src/app/api/arena/regenerate/route.ts — regenerate a single weak candidate.
//
// PRD §11: "Regenerate Weakest Candidate". Rewrites ONE candidate without rerunning the
// whole tournament, so the user keeps the good ones and only pays for the replacement.
import { handler, ok, parseBody, ApiError } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAI, parseJsonLoose } from "@/lib/services/ai/runtime";
import { storyPrompt, ANGLES } from "@/lib/services/stories/prompts";
import { lintStory, hasBlockingIssue } from "@/lib/services/stories/lint";
import { similarity } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    draftId: z.string().min(1),
    audienceProblem: z.string().min(5),
    truthMode: z.string().default("HYPOTHETICAL"),
    avoidTexts: z.array(z.string()).default([]),
    angle: z.string().optional(),
  }));

  const draft = await prisma.storyDraft.findUnique({
    where: { id: input.draftId },
    include: { concept: { select: { angle: true } } },
  });
  if (!draft) throw new ApiError("Draft tidak ditemukan", 404, "NOT_FOUND");

  // Pick a different angle than the one being replaced, so the rewrite is not a paraphrase.
  const usedAngle = draft.concept?.angle ?? "";
  const available = ANGLES.filter((a) => a !== usedAngle);
  const angle = input.angle ?? available[Math.floor(Math.random() * available.length)] ?? ANGLES[0];

  const p = storyPrompt({
    premise: `Tulis dengan sudut "${angle}" yang berbeda dari sudut sebelumnya.`,
    audienceProblem: input.audienceProblem,
    truthMode: input.truthMode,
    stylePreset: draft.stylePreset ?? "santai",
    controls: {
      formality: 1, length: 2, promotion: draft.promotionLevel ?? 1, humor: 1,
      detail: 2, slang: 1, endingQuestion: false,
    },
    variants: 1,
  });

  let text = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await runAI({
      role: "story_writer",
      task: "story.regenerate",
      messages: [
        { role: "system", content: p.system },
        { role: "user", content: p.user },
      ],
      maxOutputTokens: 900,
      refType: "StoryDraft",
      refId: draft.id,
    });
    const parsed = parseJsonLoose<{ versions?: { text?: string }[] }>(res.text);
    const candidate = parsed?.versions?.[0]?.text?.trim() ?? "";
    if (!candidate) continue;

    const lint = lintStory(candidate, { truthMode: input.truthMode });
    if (hasBlockingIssue(lint)) continue;

    const tooSimilar = [...input.avoidTexts, draft.text].some((t) => similarity(candidate, t) >= 0.9);
    if (tooSimilar) continue;

    text = candidate;
    break;
  }

  if (!text) {
    throw new ApiError(
      "Tidak bisa menghasilkan variasi yang cukup berbeda. Coba ubah brief atau gunakan provider AI nyata.",
      422, "NO_DISTINCT_VARIANT",
    );
  }

  const nextRevision = draft.currentRevision + 1;
  const updated = await prisma.storyDraft.update({
    where: { id: draft.id },
    data: {
      text,
      status: "DRAFT",
      factCheckStatus: "NOT_RUN",
      currentRevision: nextRevision,
      revisions: {
        create: {
          revision: nextRevision,
          text,
          changeNote: `Regenerate dengan sudut "${angle}"`,
          actor: "ai_writer",
        },
      },
    },
  });

  await audit({
    action: "arena.regenerated",
    summary: `Kandidat ditulis ulang dengan sudut "${angle}"`,
    entityType: "StoryDraft", entityId: draft.id,
  });

  return ok({ draft: updated, angle });
});
