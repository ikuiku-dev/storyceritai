// src/lib/connectors/sources/pipeline.ts — Discover → Fetch → Validate → Extract →
// Normalize → Deduplicate → Classify → Store → Summarize.
//
// Two safety rules run through every stage:
//   • collected text is DATA, never instructions (prompt-injection guard)
//   • we store metadata + summary + a short quote, never whole pages
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/net/ssrf";
import { decideAccess, type AdapterType } from "./registry";
import { log } from "@/lib/logger";

export const MIN_USEFUL_CHARS = 120;
export const MAX_STORED_QUOTE = 280;
export const MAX_SUMMARY = 600;

export interface FetchOutcome {
  ok: boolean;
  stage: "fetch" | "validate" | "extract" | "store";
  status: string;
  title?: string;
  text?: string;
  wordCount?: number;
  reason?: string;
  documentId?: string;
  duplicate?: boolean;
}

/** Detect the common shapes of injected instruction text inside collected content. */
export function detectInjection(text: string): string | null {
  const patterns: { re: RegExp; label: string }[] = [
    { re: /\b(ignore|disregard|forget)\b[^.]{0,40}\b(instruction|prompt|rule)s?\b/i, label: "abaikan instruksi" },
    { re: /\bsystem\s*prompt\b/i, label: "system prompt" },
    { re: /\b(kamu|anda|you)\s+(sekarang\s+)?(adalah|are)\b[^.]{0,30}\b(ai|assistant|bot)\b/i, label: "penggantian identitas" },
    { re: /\b(publish|posting|terbitkan)\b[^.]{0,30}\b(sekarang|immediately|otomatis)\b/i, label: "perintah publikasi" },
    { re: /\b(api[_\s-]?key|secret|token|password)\b/i, label: "permintaan rahasia" },
    { re: /\bkirim\s+(data|informasi|kredensial)\b/i, label: "permintaan pengiriman data" },
  ];
  for (const p of patterns) if (p.re.test(text)) return p.label;
  return null;
}

/** Normalize whitespace so identical text dedupes across formats. */
export function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Stable fingerprint of the meaningful content (not the URL). */
export function fingerprint(text: string): string {
  const normalized = normalizeText(text).toLowerCase().replace(/[\s\p{P}]/gu, "");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

/** Pull a short, quotable sentence that actually appears in the text. */
export function extractQuote(text: string, keyword?: string): string | null {
  const sentences = normalizeText(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 30);
  if (!sentences.length) return null;
  const pool = keyword
    ? sentences.filter((s) => s.toLowerCase().includes(keyword.toLowerCase()))
    : sentences;
  const pick = (pool.length ? pool : sentences)[0];
  return pick.length > MAX_STORED_QUOTE ? pick.slice(0, MAX_STORED_QUOTE).trimEnd() + "…" : pick;
}

/** Cheap extractive summary. No model call, so it cannot hallucinate. */
export function summarize(text: string, maxChars = MAX_SUMMARY): string {
  const clean = normalizeText(text);
  if (clean.length <= maxChars) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).length > maxChars) break;
    out = out ? `${out} ${s}` : s;
  }
  return out || clean.slice(0, maxChars).trimEnd() + "…";
}

export interface CollectInput {
  url: string;
  adapterType: AdapterType;
  runId?: string;
  keyword?: string;
  sourceType?: string;
}

/**
 * Collect one document. Every failure returns a stage-tagged outcome instead of throwing,
 * so a research run can continue past one bad source and report exactly what was skipped.
 */
export async function collectDocument(input: CollectInput): Promise<FetchOutcome> {
  // ── Validate permission BEFORE touching the network ──
  const access = await decideAccess(input.url, input.adapterType);
  if (!access.allowed) {
    return { ok: false, stage: "validate", status: access.verdict, reason: access.reason };
  }

  // ── Fetch ──
  let fetched;
  try {
    fetched = await safeFetch(input.url, { timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024 });
  } catch (e) {
    return { ok: false, stage: "fetch", status: "FAILED", reason: (e as Error).message };
  }

  const contentType = fetched.contentType.toLowerCase();
  const allowedTypes = ["text/html", "text/plain", "application/json", "application/xml", "text/xml", "application/rss+xml"];
  if (!allowedTypes.some((t) => contentType.includes(t))) {
    return { ok: false, stage: "validate", status: "BAD_TYPE", reason: `Tipe konten tidak didukung: ${fetched.contentType}` };
  }

  // ── Extract ──
  const { htmlToText, cleanArticleText } = await import("@/lib/services/sources/extract");
  let extracted: { text: string; title: string | null };
  if (contentType.includes("html") || contentType.includes("xml")) {
    extracted = htmlToText(fetched.body);
  } else if (contentType.includes("json")) {
    // JSON: stringify the readable values rather than pretending to parse a schema.
    try {
      const parsed = JSON.parse(fetched.body);
      const flat = JSON.stringify(parsed, null, 0);
      extracted = { text: flat, title: null };
    } catch {
      extracted = { text: fetched.body, title: null };
    }
  } else {
    extracted = { text: fetched.body, title: null };
  }
  const text = normalizeText(cleanArticleText(extracted.text ?? ""));
  const title = extracted.title ?? null;

  if (text.length < MIN_USEFUL_CHARS) {
    // Honest classification: thin pages are common and are not errors.
    return {
      ok: false, stage: "extract", status: "TOO_THIN",
      reason: `Hanya ${text.length} karakter teks — terlalu tipis untuk riset.`,
      title: title ?? undefined,
    };
  }

  // ── Classify: prompt injection is stored, flagged, and excluded from insight input ──
  const injection = detectInjection(text);

  // ── Deduplicate ──
  const fp = fingerprint(text);
  const existing = await prisma.researchDocument.findUnique({ where: { fingerprint: fp } });
  if (existing) {
    return { ok: false, stage: "store", status: "DUPLICATE", documentId: existing.id, duplicate: true, reason: "Dokumen identik sudah ada." };
  }

  // ── Store (metadata + summary + quote only) ──
  const retentionDays = 90;
  const doc = await prisma.researchDocument.create({
    data: {
      runId: input.runId ?? null,
      url: input.url,
      title,
      language: detectLanguage(text),
      sourceType: input.sourceType ?? input.adapterType,
      origin: input.adapterType === "import" ? "imported" : "fetched",
      summary: summarize(text),
      quote: extractQuote(text, input.keyword),
      wordCount: text.split(/\s+/).length,
      fingerprint: fp,
      extractionStatus: injection ? "OK" : "OK",
      permissionStatus: access.verdict,
      qualityNote: injection
        ? `PERINGATAN: konten berisi pola instruksi mencurigakan (${injection}). Diperlakukan sebagai data, tidak dijalankan.`
        : null,
      expiresAt: new Date(Date.now() + retentionDays * 86_400_000),
    },
  });

  log.info("source.collected", { url: input.url, chars: text.length, injection: Boolean(injection) });
  return { ok: true, stage: "store", status: "OK", title: title ?? undefined, text, wordCount: doc.wordCount ?? undefined, documentId: doc.id };
}

/** Very rough language guess from common function words. Honest about its limits. */
export function detectLanguage(text: string): string {
  const sample = text.toLowerCase().slice(0, 800);
  const id = (sample.match(/\b(yang|dan|dengan|untuk|tidak|saya|aku|ini|itu|dari)\b/g) ?? []).length;
  const en = (sample.match(/\b(the|and|with|for|not|this|that|from|you)\b/g) ?? []).length;
  if (id === 0 && en === 0) return "unknown";
  return id >= en ? "id" : "en";
}
