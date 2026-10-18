// src/lib/services/stories/service.ts — concept → draft → revision → review pipeline.
import "server-only";
import { prisma } from "@/lib/db";
import { runAI, parseJsonLoose, coerceArrayField } from "@/lib/services/ai/runtime";
import { AIError } from "@/lib/services/ai/types";
import { audit } from "@/lib/audit";
import { similarity } from "@/lib/crypto";
import { lintStory, hasBlockingIssue, type LintIssue } from "./lint";
import { conceptPrompt, storyPrompt, scorePrompt, factCheckPrompt, naturalnessPrompt, ANGLES } from "./prompts";
import { z } from "zod";
import { log } from "@/lib/logger";
import { buildAudienceBrief, briefToPromptText } from "@/lib/services/analytics/learning";

/* ─────────── Deterministic duplicate detection ─────────── */
export async function findDuplicates(text: string, excludeId?: string) {
  const recent = await prisma.storyDraft.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: { id: true, text: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return recent
    .map((d) => ({ id: d.id, title: d.title, score: similarity(text, d.text) }))
    .filter((d) => d.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/* ─────────── Concepts ─────────── */
const ConceptSchema = z.object({
  concepts: z.array(z.object({ title: z.string(), angle: z.string(), premise: z.string() })).min(1),
});

export async function generateConcepts(input: {
  audienceProblem: string;
  audience?: string | null;
  productId?: string | null;
  sourceIds?: string[];
  count?: number;
}) {
  const product = input.productId ? await prisma.product.findUnique({ where: { id: input.productId } }) : null;
  const sources = input.sourceIds?.length
    ? await prisma.source.findMany({ where: { id: { in: input.sourceIds } }, select: { summary: true, rawText: true } })
    : [];
  const digest = sources.map((s) => s.summary ?? s.rawText?.slice(0, 800)).filter(Boolean).join("\n---\n");

  const count = Math.min(input.count ?? 10, 12);
  // Close the loop: feed concluded-experiment lessons into new concepts.
  // If there are none, the brief is empty and generation behaves exactly as before.
  let learnedBrief: string | null = null;
  try {
    const brief = await buildAudienceBrief();
    learnedBrief = briefToPromptText(brief) || null;
  } catch {
    // Learning context is an optimisation, never a reason to fail generation.
    learnedBrief = null;
  }
  const p = conceptPrompt({ audienceProblem: input.audienceProblem, audience: input.audience, productName: product?.name, sourceDigest: digest, learnedBrief, count });
  const res = await runAI({ role: "story_writer", task: "concept_generation", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true });
  // Models without response_format support sometimes return the right content under their own
  // key names. Repair the envelope when we can, and record that it happened rather than
  // pretending the provider followed the schema.
  const rawConcept = parseJsonLoose<unknown>(res.text);
  const coerced = coerceArrayField<{ title?: string; angle?: string; premise?: string }>(rawConcept, "concepts", ["title", "angle", "premise"]);
  if (!coerced) {
    throw new AIError(
      "PROVIDER_SCHEMA_MISMATCH",
      "Model tidak mengembalikan struktur konsep yang diminta. Model ini belum mendukung output terstruktur — pilih model lain di halaman AI Providers.",
      { status: 422, retryable: false },
    );
  }
  if (coerced.repaired) {
    log.warn("ai.concepts.schema_repaired", { model: res.model, keys: Object.keys(rawConcept as object).slice(0, 6) });
  }
  const parsed = ConceptSchema.parse({ concepts: coerced.value });

  // Enforce angle diversity: dedupe identical angles when we have enough
  const seen = new Set<string>();
  const kept = parsed.concepts.filter((c) => {
    const angle = ANGLES.includes(c.angle as (typeof ANGLES)[number]) ? c.angle : "problem_observation";
    if (seen.has(angle) && seen.size < Math.min(6, parsed.concepts.length)) return false;
    seen.add(angle);
    return true;
  }).slice(0, count);

  const created = await prisma.$transaction(
    kept.map((c) =>
      prisma.storyConcept.create({
        data: {
          title: c.title.slice(0, 200),
          angle: ANGLES.includes(c.angle as (typeof ANGLES)[number]) ? c.angle : "problem_observation",
          premise: c.premise.slice(0, 1000),
          audienceProblem: input.audienceProblem,
          productId: input.productId ?? null,
          sourceIdsJson: JSON.stringify(input.sourceIds ?? []),
        },
      })
    )
  );
  await audit({ action: "concepts.generated", summary: `${created.length} konsep cerita dibuat`, entityType: "StoryConcept", actor: "system", meta: { provider: res.providerId, model: res.model } });
  return created;
}

/* ─────────── Drafts ─────────── */
const StorySchema = z.object({
  versions: z.array(z.object({ title: z.string().optional().nullable(), text: z.string().min(1), promotionLevel: z.number().int().min(0).max(4).optional() })).min(1),
});

export async function generateDrafts(input: {
  conceptId?: string;
  premise?: string;
  audienceProblem: string;
  audience?: string | null;
  productId?: string | null;
  sourceIds?: string[];
  stylePreset: string;
  truthMode: string;
  personalExperience?: string | null;
  controls: { formality: number; length: number; promotion: number; humor: number; detail: number; slang: number; endingQuestion: boolean };
  versions: number;
  variationHint?: string;
}) {
  if (input.truthMode === "REAL_EXPERIENCE" && !input.personalExperience?.trim()) {
    throw new AIError("BAD_REQUEST", "Mode REAL_EXPERIENCE butuh pengalaman nyata Anda. Isi kolom pengalaman — jangan biarkan AI mengarang.");
  }
  const concept = input.conceptId ? await prisma.storyConcept.findUnique({ where: { id: input.conceptId } }) : null;
  const product = input.productId ? await prisma.product.findUnique({ where: { id: input.productId }, include: { snapshots: { take: 1, orderBy: { fetchedAt: "desc" } } } }) : null;
  const sources = input.sourceIds?.length ? await prisma.source.findMany({ where: { id: { in: input.sourceIds } }, select: { summary: true, rawText: true } }) : [];

  const snap = product?.snapshots[0];
  const facts = product
    ? [
        product.name,
        snap?.priceIdr ? `Harga: Rp${snap.priceIdr} (diambil ${snap.fetchedAt.toISOString().slice(0, 10)})` : null,
        snap?.rating ? `Rating: ${snap.rating}` : null,
        snap?.description ? `Deskripsi: ${snap.description.slice(0, 400)}` : null,
      ].filter(Boolean).join("\n")
    : null;

  const p = storyPrompt({
    premise: concept?.premise ?? input.premise ?? input.audienceProblem,
    audienceProblem: input.audienceProblem,
    truthMode: input.truthMode,
    stylePreset: input.stylePreset,
    personalExperience: input.personalExperience,
    productName: product?.name,
    productFacts: facts,
    sourceDigest: sources.map((s) => s.summary ?? s.rawText?.slice(0, 600)).filter(Boolean).join("\n---\n"),
    controls: input.controls,
    variants: input.versions,
    variationHint: input.variationHint,
  });

  const res = await runAI({ role: "story_writer", task: "story_generation", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true, refId: input.conceptId });
  const parsed = StorySchema.parse(parseJsonLoose(res.text));

  let cid = input.conceptId;
  if (!cid) {
    const c = await prisma.storyConcept.create({
      data: { title: parsed.versions[0]?.title ?? "Cerita baru", angle: "problem_observation", premise: input.premise ?? input.audienceProblem, audienceProblem: input.audienceProblem, productId: input.productId ?? null },
    });
    cid = c.id;
  }

  const out = [];
  for (const v of parsed.versions) {
    const issues = lintStory(v.text, { truthMode: input.truthMode, allowSocialProof: false });
    const dupes = await findDuplicates(v.text);
    const draft = await prisma.storyDraft.create({
      data: {
        conceptId: cid,
        title: v.title?.slice(0, 200) ?? null,
        text: v.text,
        truthMode: input.truthMode,
        stylePreset: input.stylePreset,
        promotionLevel: v.promotionLevel ?? input.controls.promotion,
        status: "DRAFT",
        duplicateOfId: dupes[0]?.id ?? null,
        similarityScore: dupes[0]?.score ?? null,
        revisions: { create: { revision: 1, text: v.text, actor: "ai_writer", changeNote: "Draft awal" } },
      },
    });
    out.push({ draft, issues, duplicates: dupes });
    if (hasBlockingIssue(issues)) {
      await prisma.storyDraft.update({ where: { id: draft.id }, data: { status: "NEEDS_REVIEW", factCheckStatus: "FAILED" } });
    }
  }
  return { drafts: out, providerId: res.providerId, model: res.model, usedFallback: res.usedFallback };
}

/* ─────────── Revisions ─────────── */
export async function saveRevision(draftId: string, text: string, changeNote?: string) {
  const draft = await prisma.storyDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new AIError("MODEL_NOT_FOUND", "Draft tidak ditemukan");
  const next = draft.currentRevision + 1;
  const issues = lintStory(text, { truthMode: draft.truthMode });
  await prisma.$transaction([
    prisma.storyRevision.create({ data: { draftId, revision: next, text, changeNote: changeNote ?? "Diedit pengguna", actor: "user" } }),
    prisma.storyDraft.update({
      where: { id: draftId },
      data: {
        text,
        currentRevision: next,
        factCheckStatus: "NOT_RUN",
        status: hasBlockingIssue(issues) ? "NEEDS_REVIEW" : "DRAFT",
      },
    }),
  ]);
  return { revision: next, issues };
}

/* ─────────── Rubric ─────────── */
export const RUBRIC_V1 = `- Naturalness (bobot 20%): terasa seperti orang Indonesia menulis, bukan mesin.
- Relevansi dengan masalah (20%): benar-benar menyentuh masalah audiens.
- Kejelasan cerita (15%): alur mudah diikuti, tidak berbelit.
- Keaslian sudut pandang (15%): ada perspektif khas, bukan generik.
- Kepercayaan & transparansi (15%): tidak ada klaim berlebihan, jujur soal keterbatasan.
- Kecocokan produk (10%): produk relevan dengan cerita.
- Kualitas penutup (5%): penutup terasa selesai, tidak dipaksakan.`;

export const RUBRIC_WEIGHTS = { naturalness: 0.2, relevance: 0.2, clarity: 0.15, originality: 0.15, trustTransparency: 0.15, productFit: 0.1, endingQuality: 0.05 };

const ScoreSchema = z.object({
  scores: z.object({
    naturalness: z.number(), relevance: z.number(), clarity: z.number(), originality: z.number(),
    trustTransparency: z.number(), productFit: z.number(), endingQuality: z.number(),
  }),
  reasons: z.record(z.string(), z.string()).optional(),
  penalties: z.array(z.object({ code: z.string(), points: z.number(), reason: z.string() })).optional(),
});

export async function scoreDraft(draftId: string) {
  const draft = await prisma.storyDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new AIError("MODEL_NOT_FOUND", "Draft tidak ditemukan");

  const p = scorePrompt(draft.text, RUBRIC_V1);
  const res = await runAI({ role: "critical_reviewer", task: "story_scoring", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true, refId: draftId });
  const parsed = ScoreSchema.parse(parseJsonLoose(res.text));

  const clamp = (n: number) => Math.max(1, Math.min(10, n));
  const s = parsed.scores;
  let weighted =
    clamp(s.naturalness) * RUBRIC_WEIGHTS.naturalness +
    clamp(s.relevance) * RUBRIC_WEIGHTS.relevance +
    clamp(s.clarity) * RUBRIC_WEIGHTS.clarity +
    clamp(s.originality) * RUBRIC_WEIGHTS.originality +
    clamp(s.trustTransparency) * RUBRIC_WEIGHTS.trustTransparency +
    clamp(s.productFit) * RUBRIC_WEIGHTS.productFit +
    clamp(s.endingQuality) * RUBRIC_WEIGHTS.endingQuality;

  // Deterministic penalties on top of AI penalties — these don't depend on the model being generous.
  const penalties = [...(parsed.penalties ?? [])];
  const lint = lintStory(draft.text, { truthMode: draft.truthMode });
  for (const i of lint) {
    if (i.code === "FAKE_EXPERIENCE") penalties.push({ code: i.code, points: 3, reason: i.message });
    else if (i.code === "HYPE_CLAIM") penalties.push({ code: i.code, points: 2, reason: i.message });
    else if (i.code === "FABRICATED_PROOF") penalties.push({ code: i.code, points: 3, reason: i.message });
  }
  const dupes = await findDuplicates(draft.text, draft.id);
  const dedupePenalty = (dupes[0]?.score ?? 0) >= 0.8 ? 3 : 0;
  if (dedupePenalty) penalties.push({ code: "TOO_SIMILAR_TO_EXISTING", points: dedupePenalty, reason: `Kemiripan ${(dupes[0].score * 100).toFixed(0)}% dengan draft lain.` });

  weighted = Math.max(0, weighted - penalties.reduce((a, b) => a + b.points, 0) * 0.35);

  const row = await prisma.storyScore.create({
    data: {
      draftId,
      rubricVersion: "v1",
      naturalness: clamp(s.naturalness), relevance: clamp(s.relevance), clarity: clamp(s.clarity),
      originality: clamp(s.originality), trustTransparency: clamp(s.trustTransparency),
      productFit: clamp(s.productFit), endingQuality: clamp(s.endingQuality),
      weightedScore: Number(weighted.toFixed(2)),
      penaltiesJson: JSON.stringify(penalties),
      reasonsJson: JSON.stringify(parsed.reasons ?? {}),
      warningsJson: JSON.stringify(lint),
      scoredBy: "ai",
    },
  });
  return row;
}

/* ─────────── Fact check ─────────── */
export async function factCheckDraft(draftId: string) {
  const draft = await prisma.storyDraft.findUnique({ where: { id: draftId }, include: { concept: true } });
  if (!draft) throw new AIError("MODEL_NOT_FOUND", "Draft tidak ditemukan");

  const sourceIds: string[] = draft.concept.sourceIdsJson ? JSON.parse(draft.concept.sourceIdsJson) : [];
  const sources = sourceIds.length ? await prisma.source.findMany({ where: { id: { in: sourceIds } }, select: { summary: true, rawText: true } }) : [];
  const evidence = sources.map((s) => s.summary ?? s.rawText?.slice(0, 800)).filter(Boolean).join("\n---\n");

  const p = factCheckPrompt(draft.text, evidence);
  const res = await runAI({ role: "final_validator", task: "fact_check", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true, refId: draftId });
  const parsed = z.object({ verdict: z.enum(["PASSED", "WARNINGS", "FAILED"]), claims: z.array(z.any()).optional(), notes: z.string().optional() }).parse(parseJsonLoose(res.text));

  // Deterministic override: lint blockers always beat a generous model verdict.
  const lint = lintStory(draft.text, { truthMode: draft.truthMode });
  let verdict = parsed.verdict;
  if (hasBlockingIssue(lint)) verdict = "FAILED";

  const status = verdict === "PASSED" ? "PASSED" : verdict === "FAILED" ? "FAILED" : "WARNINGS";
  await prisma.storyDraft.update({ where: { id: draftId }, data: { factCheckStatus: status } });
  return { verdict, status, claims: parsed.claims ?? [], notes: parsed.notes ?? null, lint };
}

/* ─────────── Naturalness edit ─────────── */
export async function naturalizeDraft(draftId: string) {
  const draft = await prisma.storyDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new AIError("MODEL_NOT_FOUND", "Draft tidak ditemukan");
  const p = naturalnessPrompt(draft.text, "Hindari pembukaan template dan klaim yang tidak ada di teks asli.");
  const res = await runAI({ role: "naturalness_editor", task: "naturalness_edit", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true, refId: draftId });
  const parsed = z.object({ issues: z.array(z.any()).optional(), revised: z.string().nullable().optional(), slopFlags: z.array(z.string()).optional() }).parse(parseJsonLoose(res.text));

  if (parsed.revised && parsed.revised.trim() && parsed.revised.trim() !== draft.text.trim()) {
    // Guard: revisions must not introduce fake experience or hype
    const before = lintStory(draft.text, { truthMode: draft.truthMode });
    const after = lintStory(parsed.revised, { truthMode: draft.truthMode });
    if (after.filter((i) => i.severity === "block").length > before.filter((i) => i.severity === "block").length) {
      throw new AIError("BAD_REQUEST", "Revisi AI memperkenalkan klaim terlarang — ditolak. Edit manual lebih aman di sini.");
    }
    await saveRevision(draftId, parsed.revised, "Revisi naturalness oleh AI");
    return { applied: true, issues: parsed.issues ?? [], slopFlags: parsed.slopFlags ?? [] };
  }
  return { applied: false, issues: parsed.issues ?? [], slopFlags: parsed.slopFlags ?? [] };
}

export type { LintIssue };
