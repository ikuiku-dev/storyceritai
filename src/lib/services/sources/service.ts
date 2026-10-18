// src/lib/services/sources/service.ts — ingestion, dedupe, insight extraction.
import "server-only";
import { prisma } from "@/lib/db";
import { safeFetch, SsrfError } from "@/lib/net/ssrf";
import { contentHash, similarity } from "@/lib/crypto";
import { runAI, parseJsonLoose } from "@/lib/services/ai/runtime";
import { AIError } from "@/lib/services/ai/types";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { htmlToText, cleanArticleText, fallbackSummary } from "./extract";
import { insightPrompt, extractSummaryPrompt } from "@/lib/services/stories/prompts";
import { z } from "zod";

const MAX_CHARS = 120_000;

/** Create a source from already-obtained text (file import, user note, interview). */
export async function createTextSource(input: {
  title?: string;
  text: string;
  kind: string;
  permissionStatus: string;
  url?: string | null;
}) {
  const hash = contentHash(input.text);
  const existing = await prisma.source.findFirst({ where: { contentHash: hash }, select: { id: true, title: true } });
  if (existing) {
    return { duplicate: true as const, sourceId: existing.id, title: existing.title };
  }
  const src = await prisma.source.create({
    data: {
      title: input.title?.slice(0, 200) ?? null,
      kind: input.kind,
      url: input.url ?? null,
      domain: input.url ? safeDomain(input.url) : null,
      permissionStatus: input.permissionStatus,
      accessStatus: "EXTRACTED",
      rawText: input.text.slice(0, MAX_CHARS),
      contentHash: hash,
      wordCount: input.text.split(/\s+/).length,
      fetchedAt: new Date(),
      staleAfter: new Date(Date.now() + 90 * 864e5),
    },
  });
  await audit({ action: "source.created", summary: `Sumber ditambahkan: ${src.title ?? src.kind}`, entityType: "Source", entityId: src.id, meta: { kind: src.kind } });
  return { duplicate: false as const, sourceId: src.id, title: src.title };
}

function safeDomain(u: string) {
  try { return new URL(u).hostname; } catch { return null; }
}

/** Fetch a public URL through the SSRF guard, store text, record failures honestly. */
export async function ingestUrl(input: { url: string; kind: string }) {
  let fetched;
  try {
    fetched = await safeFetch(input.url, { timeoutMs: 12_000, maxBytes: 4 * 1024 * 1024 });
  } catch (e) {
    const msg = e instanceof SsrfError ? e.message : (e as Error).message;
    const blocked = e instanceof SsrfError && /blocked|private|not allowed|scheme|Port|downgrade|Only http/i.test(msg);
    const row = await prisma.source.create({
      data: {
        url: input.url, domain: safeDomain(input.url), kind: input.kind,
        accessStatus: blocked ? "BLOCKED" : "FAILED",
        extractionError: msg.slice(0, 500),
        permissionStatus: "UNKNOWN",
      },
    });
    await audit({ action: "source.fetch_failed", summary: `Gagal mengambil ${input.url}: ${msg}`, entityType: "Source", entityId: row.id });
    return { ok: false as const, error: msg, sourceId: row.id, blocked };
  }

  if (fetched.status >= 400) {
    const row = await prisma.source.create({
      data: { url: input.url, domain: safeDomain(input.url), kind: input.kind, accessStatus: "FAILED", extractionError: `HTTP ${fetched.status}`, permissionStatus: "UNKNOWN" },
    });
    return { ok: false as const, error: `Server membalas HTTP ${fetched.status}`, sourceId: row.id, blocked: false };
  }

  const isJson = /json/i.test(fetched.contentType);
  const parsed = isJson ? { text: fetched.body, title: null } : htmlToText(fetched.body);
  const text = cleanArticleText(parsed.text).slice(0, MAX_CHARS);
  if (text.length < 200) {
    // Honest reason: short page vs. JS-rendered/login-walled page are different problems.
    const reason =
      text.length < 40
        ? "Halaman hampir tidak berisi teks — kemungkinan butuh login atau dirender JavaScript."
        : `Halaman hanya berisi ${text.length} karakter teks — terlalu tipis untuk riset.`;
    const row = await prisma.source.create({
      data: { url: input.url, domain: safeDomain(input.url), kind: input.kind, title: parsed.title, accessStatus: "FAILED", extractionError: reason, permissionStatus: "UNKNOWN", rawText: text || null },
    });
    return { ok: false as const, error: reason, sourceId: row.id, blocked: false, textLength: text.length };
  }

  const hash = contentHash(text);
  const dup = await prisma.source.findFirst({ where: { contentHash: hash }, select: { id: true } });
  if (dup) return { ok: true as const, duplicate: true, sourceId: dup.id };

  const row = await prisma.source.create({
    data: {
      url: fetched.finalUrl, domain: safeDomain(fetched.finalUrl), kind: input.kind,
      title: parsed.title?.slice(0, 200) ?? null,
      accessStatus: "EXTRACTED", permissionStatus: "UNKNOWN",
      rawText: text, contentHash: hash, wordCount: text.split(/\s+/).length,
      fetchedAt: new Date(), staleAfter: new Date(Date.now() + 90 * 864e5),
      summary: fallbackSummary(text),
    },
  });
  await audit({ action: "source.ingested", summary: `Sumber diambil: ${row.title ?? fetched.finalUrl}`, entityType: "Source", entityId: row.id });
  return { ok: true as const, duplicate: false, sourceId: row.id };
}

/** AI summary; falls back to extractive summary if no provider is available. */
export async function summarizeSource(sourceId: string) {
  const src = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!src) throw new AIError("MODEL_NOT_FOUND", "Sumber tidak ditemukan");
  if (!src.rawText) throw new AIError("BAD_REQUEST", "Sumber belum punya teks.");

  try {
    const p = extractSummaryPrompt(src.rawText);
    const res = await runAI({ role: "research_extractor", task: "source_summary", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true, refId: sourceId });
    const parsed = z.object({ summary: z.string(), context: z.string().optional(), facts: z.array(z.string()).optional() }).parse(parseJsonLoose(res.text));
    const updated = await prisma.source.update({ where: { id: sourceId }, data: { summary: parsed.summary.slice(0, 2000), context: parsed.context?.slice(0, 1000) ?? null } });
    return { ok: true, summary: updated.summary, usedFallback: false };
  } catch (e) {
    if (e instanceof AIError && (e.code === "NO_PROVIDER" || e.code === "PARSE_FAILED")) {
      const s = fallbackSummary(src.rawText);
      await prisma.source.update({ where: { id: sourceId }, data: { summary: s } });
      return { ok: true, summary: s, usedFallback: true };
    }
    throw e;
  }
}

const InsightSchema = z.object({
  insights: z.array(z.object({
    category: z.enum(["PROBLEM", "NEED", "CONTEXT", "LANGUAGE", "OBJECTION", "PREFERENCE", "QUESTION", "PRODUCT_TYPE", "SEGMENT"]),
    statement: z.string(),
    evidenceType: z.enum(["OBSERVATION", "PATTERN", "INTERPRETATION", "HYPOTHESIS"]).default("INTERPRETATION"),
    evidenceQuote: z.string().nullable().optional(),
    confidence: z.number().min(0).max(100).default(50),
    limitation: z.string().nullable().optional(),
  })).min(1),
});

export async function extractInsights(sourceId: string) {
  const src = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!src) throw new AIError("MODEL_NOT_FOUND", "Sumber tidak ditemukan");
  if (!src.rawText) throw new AIError("BAD_REQUEST", "Sumber belum punya teks.");

  const p = insightPrompt(src.rawText);
  const res = await runAI({ role: "audience_analyst", task: "insight_extraction", messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], jsonMode: true, refId: sourceId });
  const parsed = InsightSchema.parse(parseJsonLoose(res.text));

  const created = await prisma.$transaction(
    parsed.insights.slice(0, 24).map((i) =>
      prisma.audienceInsight.create({
        data: {
          sourceId,
          category: i.category,
          statement: i.statement.slice(0, 1000),
          evidenceType: i.evidenceType,
          evidenceQuote: i.evidenceQuote?.slice(0, 500) ?? null,
          confidence: Math.round(i.confidence),
          limitation: i.limitation?.slice(0, 500) ?? null,
          sampleCount: 1,
        },
      })
    )
  );
  await audit({ action: "insights.extracted", summary: `${created.length} insight dari sumber ${src.title ?? src.id}`, entityType: "Source", entityId: sourceId });
  return created;
}

/** Cross-source duplicate/near-duplicate check for the library view. */
export async function findSimilarSources(text: string) {
  const all = await prisma.source.findMany({ where: { rawText: { not: null } }, select: { id: true, title: true, rawText: true }, take: 200 });
  return all
    .map((s) => ({ id: s.id, title: s.title, score: similarity(text, s.rawText ?? "") }))
    .filter((s) => s.score >= 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export { log };
