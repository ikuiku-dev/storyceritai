// src/lib/services/arena/tournament.ts — the 12-step competitive story R&D loop.
// Hard caps on AI calls, wall time and candidates. No infinite loops, ever.
import "server-only";
import { prisma } from "@/lib/db";
import { runAI, parseJsonLoose } from "@/lib/services/ai/runtime";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { lintStory, hasBlockingIssue } from "@/lib/services/stories/lint";
import { similarity } from "@/lib/crypto";
import { conceptPrompt, storyPrompt, scorePrompt } from "@/lib/services/stories/prompts";
import { RUBRIC_V1, RUBRIC_WEIGHTS, findDuplicates } from "@/lib/services/stories/service";
import { z } from "zod";

export interface TournamentInput {
  productId?: string | null;
  audienceProblem: string;
  audience?: string | null;
  hypothesis?: string;
  truthMode: string;
  personalExperience?: string | null;
  maxConcepts: number;
  finalists: number;
  versionsPerConcept: number;
  maxAiCalls: number;
}

export interface TournamentStep {
  step: number;
  name: string;
  detail: string;
  aiCalls: number;
}

export interface CandidateResult {
  draftId: string;
  title: string | null;
  text: string;
  weightedScore: number | null;
  lintBlocked: boolean;
  lintCodes: string[];
  similarity: number;
  eliminatedReason?: string;
}

const HARD_TIMEOUT_MS = 180_000;

export async function runTournament(input: TournamentInput) {
  const started = Date.now();
  const steps: TournamentStep[] = [];
  let aiCalls = 0;
  const maxCalls = Math.min(input.maxAiCalls, 60);

  const budgetLeft = () => aiCalls < maxCalls && Date.now() - started < HARD_TIMEOUT_MS;

  if (input.truthMode === "REAL_EXPERIENCE" && !input.personalExperience?.trim()) {
    throw new Error("Mode REAL_EXPERIENCE butuh pengalaman nyata Anda.");
  }

  const product = input.productId ? await prisma.product.findUnique({ where: { id: input.productId } }) : null;

  /* ── Step 1: generate concepts (1 call) ── */
  const cp = conceptPrompt({
    audienceProblem: input.audienceProblem,
    audience: input.audience ?? null,
    productName: product?.name ?? null,
    sourceDigest: null,
    count: input.maxConcepts,
  });
  const cres = await runAI({ role: "story_writer", task: "tournament_concepts", messages: [{ role: "system", content: cp.system }, { role: "user", content: cp.user }], jsonMode: true });
  aiCalls++;
  const rawConcepts = z.object({ concepts: z.array(z.object({ title: z.string(), angle: z.string(), premise: z.string() })) }).parse(parseJsonLoose(cres.text)).concepts;
  steps.push({ step: 1, name: "Generate konsep", detail: `${rawConcepts.length} konsep`, aiCalls });

  /* ── Step 2: dedupe by angle + premise similarity ── */
  const seenAngles = new Set<string>();
  const uniqueConcepts = rawConcepts.filter((c) => {
    if (seenAngles.has(c.angle)) return false;
    seenAngles.add(c.angle);
    return true;
  });
  const finalists = uniqueConcepts.slice(0, Math.min(input.finalists, uniqueConcepts.length));
  if (finalists.length < 2) throw new Error("Konsep yang dihasilkan terlalu serupa. Coba ubah masalah audiens atau tambah jumlah konsep.");
  steps.push({ step: 2, name: "Seleksi konsep", detail: `${rawConcepts.length} → ${finalists.length} konsep berbeda sudut`, aiCalls });

  /* ── Step 3: generate versions per finalist ── */
  type Gen = { conceptTitle: string; angle: string; text: string; title: string | null; conceptIdx: number; versionIdx: number };
  const generated: Gen[] = [];
  for (let i = 0; i < finalists.length && budgetLeft(); i++) {
    const f = finalists[i];
    const sp = storyPrompt({
      premise: f.premise,
      audienceProblem: input.audienceProblem,
      truthMode: input.truthMode,
      stylePreset: "santai",
      personalExperience: input.personalExperience,
      productName: product?.name ?? null,
      productFacts: null,
      sourceDigest: null,
      controls: { formality: 1, length: 2, promotion: 1, humor: 1, detail: 2, slang: 1, endingQuestion: false },
      variants: input.versionsPerConcept,
      variationHint: "Setiap versi harus punya ritme/struktur berbeda, bukan sinonim.",
    });
    const res = await runAI({ role: "story_writer", task: "tournament_story", messages: [{ role: "system", content: sp.system }, { role: "user", content: sp.user }], jsonMode: true });
    aiCalls++;
    const versions = z.object({ versions: z.array(z.object({ title: z.string().nullable().optional(), text: z.string() })) }).parse(parseJsonLoose(res.text)).versions;
    versions.forEach((v, vi) => generated.push({ conceptTitle: f.title, angle: f.angle, text: v.text, title: v.title ?? null, conceptIdx: i, versionIdx: vi }));
  }
  steps.push({ step: 3, name: "Tulis versi", detail: `${generated.length} versi dari ${finalists.length} konsep`, aiCalls });

  /* ── Step 4: deterministic elimination (lint + duplicates) — no AI cost ── */
  // Two different comparisons, deliberately treated differently:
  //  - WITHIN THIS BATCH: near-identical drafts are one candidate → eliminate.
  //  - AGAINST THE EXISTING LIBRARY: a repeat is a *warning* the user decides on, not an
  //    automatic delete. Otherwise re-running the same brief can never produce anything,
  //    which is both surprising and wrong (the user may intend to iterate).
  const candidates: { gen: Gen; lintCodes: string[]; blocked: boolean; sim: number; librarySim: number; draftId: string }[] = [];
  const acceptedTexts: string[] = [];
  for (const g of generated) {
    const lint = lintStory(g.text, { truthMode: input.truthMode });
    const blocked = hasBlockingIssue(lint);
    const librarySim = (await findDuplicates(g.text))[0]?.score ?? 0;
    const againstBatch = acceptedTexts.reduce((m, t) => Math.max(m, similarity(g.text, t)), 0);
    if (!blocked && againstBatch < 0.9) acceptedTexts.push(g.text);
    candidates.push({ gen: g, lintCodes: lint.map((l) => l.code), blocked, sim: againstBatch, librarySim, draftId: "" });
  }
  const survivors = candidates.filter((c) => !c.blocked && c.sim < 0.9);
  const eliminated = candidates.filter((c) => c.blocked || c.sim >= 0.9);
  const repeatedCount = survivors.filter((c) => c.librarySim >= 0.85).length;
  steps.push({ step: 4, name: "Saring otomatis", detail: `${eliminated.length} gugur (klaim terlarang/duplikat dalam batch), ${survivors.length} lolos${repeatedCount ? `; ${repeatedCount} mirip draft lama di perpustakaan` : ""}`, aiCalls });

  if (!survivors.length) {
    // Distinguish "model produced junk" from "model produced the same thing twice".
    const anyBlocked = candidates.some((c) => c.blocked);
    throw new Error(
      anyBlocked
        ? "Semua kandidat gugur karena klaim terlarang. Ubah brief atau tulis manual."
        : "Semua kandidat terlalu mirip satu sama lain. Coba ubah sudut masalah atau gunakan provider AI nyata — provider mock menghasilkan variasi terbatas."
    );
  }

  /* ── Step 5: AI rubric scoring, capped ── */
  const toScore = survivors.slice(0, Math.max(3, Math.min(6, maxCalls - aiCalls)));
  const scored: { c: (typeof survivors)[number]; weighted: number }[] = [];
  for (const c of toScore) {
    if (!budgetLeft()) break;
    const q = scorePrompt(c.gen.text, RUBRIC_V1);
    const res = await runAI({ role: "critical_reviewer", task: "tournament_score", messages: [{ role: "system", content: q.system }, { role: "user", content: q.user }], jsonMode: true });
    aiCalls++;
    try {
      const p = z.object({ scores: z.record(z.string(), z.number()), penalties: z.array(z.object({ points: z.number() })).optional() }).parse(parseJsonLoose(res.text));
      const s = p.scores;
      const clamp = (n: number) => Math.max(1, Math.min(10, n ?? 5));
      let w =
        clamp(s.naturalness) * RUBRIC_WEIGHTS.naturalness + clamp(s.relevance) * RUBRIC_WEIGHTS.relevance +
        clamp(s.clarity) * RUBRIC_WEIGHTS.clarity + clamp(s.originality) * RUBRIC_WEIGHTS.originality +
        clamp(s.trustTransparency) * RUBRIC_WEIGHTS.trustTransparency + clamp(s.productFit) * RUBRIC_WEIGHTS.productFit +
        clamp(s.endingQuality) * RUBRIC_WEIGHTS.endingQuality;
      const pen = (p.penalties ?? []).reduce((a, b) => a + Math.abs(b.points ?? 0), 0);
      w = Math.max(0, w - pen * 0.35);
      scored.push({ c, weighted: Number(w.toFixed(2)) });
    } catch {
      scored.push({ c, weighted: 0 });
    }
  }
  steps.push({ step: 5, name: "Nilai rubrik", detail: `${scored.length} kandidat dinilai`, aiCalls });

  /* ── Step 6: pick top 3, persist ── */
  scored.sort((a, b) => b.weighted - a.weighted);
  const top = scored.slice(0, 3);
  const results: CandidateResult[] = [];
  for (const [idx, s] of top.entries()) {
    const concept = await prisma.storyConcept.create({
      data: { title: (s.c.gen.title ?? s.c.gen.conceptTitle).slice(0, 200), angle: s.c.gen.angle || "problem_observation", premise: s.c.gen.conceptTitle, audienceProblem: input.audienceProblem, productId: input.productId ?? null },
    });
    const draft = await prisma.storyDraft.create({
      data: {
        conceptId: concept.id, title: (s.c.gen.title ?? "").slice(0, 200) || null, text: s.c.gen.text,
        truthMode: input.truthMode, status: "DRAFT", promotionLevel: 1,
        revisions: { create: { revision: 1, text: s.c.gen.text, actor: "ai_writer", changeNote: `Turnamen — peringkat #${idx + 1}` } },
        scores: { create: { rubricVersion: "v1", weightedScore: s.weighted, scoredBy: "ai", reasonsJson: JSON.stringify({}) } },
      },
    });
    results.push({ draftId: draft.id, title: draft.title, text: draft.text, weightedScore: s.weighted, lintBlocked: false, lintCodes: s.c.lintCodes, similarity: s.c.librarySim });
  }
  for (const e of eliminated) {
    results.push({ draftId: "", title: e.gen.title, text: e.gen.text, weightedScore: null, lintBlocked: e.blocked, lintCodes: e.lintCodes, similarity: e.sim, eliminatedReason: e.blocked ? "Klaim terlarang / pengalaman palsu" : "Terlalu mirip kandidat lain" });
  }
  steps.push({ step: 6, name: "Simpan 3 teratas", detail: `Peringkat 1–${results.filter((r) => r.draftId).length} disimpan sebagai draft`, aiCalls });

  /* ── Step 7: winner explanation (1 call, optional) ── */
  let explanation = "Pemenang ditentukan oleh skor rubrik tertimbang. Ini penyaringan kandidat, bukan prediksi viralitas.";
  if (budgetLeft() && results[0]?.draftId) {
    try {
      const best = results[0];
      const res = await runAI({
        role: "critical_reviewer", task: "winner_explanation",
        messages: [
          { role: "system", content: "[TASK:generic] Jelaskan dalam 2-3 kalimat mengapa cerita ini menang secara rubrik dibanding kandidat lain. Bahasa Indonesia, tanpa klaim viralitas." },
          { role: "user", content: `Pemenang (skor ${best.weightedScore}):\n${best.text}\n\nRunner-up: ${results.slice(1, 3).map((r) => `skor ${r.weightedScore}`).join(", ")}` },
        ],
      });
      aiCalls++;
      explanation = res.text.trim().slice(0, 800) || explanation;
    } catch { /* explanation is optional */ }
  }
  steps.push({ step: 7, name: "Penjelasan pemenang", detail: "Selesai", aiCalls });

  log.info("arena.tournament", { aiCalls, candidates: candidates.length, survived: survivors.length });
  await audit({ action: "arena.tournament_run", summary: `Turnamen: ${candidates.length} kandidat → ${results.filter((r) => r.draftId).length} finalis dalam ${aiCalls} panggilan AI`, entityType: "StoryExperiment", meta: { aiCalls } });

  return { steps, results, explanation, aiCalls, elapsedMs: Date.now() - started, capped: aiCalls >= maxCalls };
}

/** Save a tournament outcome as a trackable experiment. */
export async function saveAsExperiment(input: {
  name: string; hypothesis: string; productId?: string | null; audience?: string | null;
  observationDays?: number; draftIds: string[];
}) {
  const exp = await prisma.storyExperiment.create({
    data: {
      name: input.name.slice(0, 200), hypothesis: input.hypothesis.slice(0, 1000),
      productId: input.productId ?? null, audience: input.audience ?? null,
      status: "DRAFT", observationDays: input.observationDays ?? 7,
      variants: {
        create: input.draftIds.map((id, i) => {
          const label = String.fromCharCode(65 + i);
          return { label, draftId: id };
        }),
      },
    },
    include: { variants: true },
  });
  await audit({ action: "experiment.created", summary: `Eksperimen "${exp.name}" dibuat dengan ${exp.variants.length} varian`, entityType: "StoryExperiment", entityId: exp.id });
  return exp;
}
