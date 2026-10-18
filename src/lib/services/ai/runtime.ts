// src/lib/services/ai/runtime.ts — the only entry point other services use for AI.
// Handles: role→provider resolution, budgets, retry/backoff, fallback, cost accounting.
import "server-only";
import { prisma, getSettings } from "@/lib/db";
import { openSecret } from "@/lib/crypto";
import { log } from "@/lib/logger";
import { openaiAdapter } from "./openai";
import { mockAdapter } from "./mock";
import { AIError, type AIAdapter, type AIRole, type ChatMessage, type CompletionResult, type ProviderConfig } from "./types";
import type { AIProvider } from "@prisma/client";

export function adapterFor(protocol: string): AIAdapter {
  switch (protocol) {
    case "mock":
      return mockAdapter;
    case "openai_compatible":
    default:
      return openaiAdapter;
  }
}

export function toConfig(p: AIProvider): ProviderConfig {
  let apiKey: string | null = null;
  if (p.apiKeyCipher) {
    try {
      apiKey = openSecret(p.apiKeyCipher);
    } catch (e) {
      throw new AIError("AUTH_FAILED", `Tidak bisa membuka API key tersimpan: ${(e as Error).message}`);
    }
  }
  return {
    id: p.id,
    name: p.name,
    protocol: p.protocol as ProviderConfig["protocol"],
    baseUrl: p.baseUrl,
    apiKey,
    model: p.model,
    timeoutMs: p.timeoutMs,
    maxOutputTokens: p.maxOutputTokens,
    temperature: p.temperature,
    maxRetries: p.maxRetries,
  };
}

async function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}
async function dayStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export async function spentUsd(since: Date): Promise<number> {
  const agg = await prisma.costRecord.aggregate({
    _sum: { costUsd: true },
    where: { createdAt: { gte: since }, ok: true },
  });
  return agg._sum.costUsd ?? 0;
}

export class BudgetExceededError extends AIError {
  constructor(message: string) {
    super("BUDGET_EXCEEDED", message);
  }
}

async function assertBudget() {
  const s = await getSettings();
  if (s.dailyBudgetUsd != null) {
    const d = await spentUsd(await dayStart());
    if (d >= s.dailyBudgetUsd) throw new BudgetExceededError(`Batas biaya harian tercapai ($${d.toFixed(4)} / $${s.dailyBudgetUsd}).`);
  }
  if (s.monthlyBudgetUsd != null) {
    const m = await spentUsd(await monthStart());
    if (m >= s.monthlyBudgetUsd) throw new BudgetExceededError(`Batas biaya bulanan tercapai ($${m.toFixed(4)} / $${s.monthlyBudgetUsd}).`);
  }
}

function cost(provider: AIProvider, inTok: number | null, outTok: number | null): number | null {
  if (inTok == null || outTok == null) return null;
  // Prices come only from user input. Unset = unknown cost (null), never assumed 0.
  if (provider.priceInputPer1M == null && provider.priceOutputPer1M == null) return null;
  const pin = provider.priceInputPer1M ?? 0;
  const pout = provider.priceOutputPer1M ?? 0;
  return (inTok / 1_000_000) * pin + (outTok / 1_000_000) * pout;
}

/** Resolve which provider+model to use for a role. */
export async function resolveForRole(role: AIRole): Promise<{ provider: AIProvider; model: string }> {
  const cfg = await prisma.aIModelConfiguration.findFirst({ where: { role, active: true }, include: { provider: true } });
  if (cfg?.provider?.active) {
    return { provider: cfg.provider, model: cfg.modelOverride ?? cfg.provider.model };
  }
  // Prefer an explicitly designated fallback, then the oldest real provider, then mock.
  // Skipping mock entirely meant a configured-but-broken real provider (no credit, bad key)
  // blocked every generation even though a working mock provider was active.
  let p = await prisma.aIProvider.findFirst({ where: { active: true, isFallback: true }, orderBy: { createdAt: "asc" } });
  p ??= await prisma.aIProvider.findFirst({ where: { active: true, protocol: { not: "mock" } }, orderBy: { createdAt: "asc" } });
  p ??= await prisma.aIProvider.findFirst({ where: { active: true } });
  if (!p) {
    throw new AIError("NO_PROVIDER", "Belum ada provider AI aktif. Tambahkan provider di halaman AI Providers (atau aktifkan Mock provider).");
  }
  return { provider: p, model: p.model };
}

export interface RunOptions {
  role: AIRole;
  task: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxOutputTokens?: number;
  refType?: string;
  refId?: string;
}

export interface RunResult extends CompletionResult {
  providerId: string;
  model: string;
  costUsd: number | null;
  usedFallback: boolean;
}

async function callWithRetry(provider: AIProvider, model: string, opts: RunOptions): Promise<CompletionResult> {
  const adapter = adapterFor(provider.protocol);
  const cfg = toConfig(provider);
  const attempts = Math.max(1, Math.min(provider.maxRetries + 1, 4));
  let lastErr: unknown;
  for (let a = 1; a <= attempts; a++) {
    const started = Date.now();
    try {
      const result = await adapter.complete(
        { messages: opts.messages, model, jsonMode: opts.jsonMode, maxOutputTokens: opts.maxOutputTokens ?? provider.maxOutputTokens },
        cfg
      );
      await prisma.costRecord.create({
        data: {
          providerId: provider.id,
          model,
          task: opts.task,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: cost(provider, result.inputTokens, result.outputTokens),
          latencyMs: Date.now() - started,
          ok: true,
          refType: opts.refType,
          refId: opts.refId,
        },
      });
      return result;
    } catch (e) {
      lastErr = e;
      const aiErr = e instanceof AIError ? e : new AIError("UNKNOWN", (e as Error).message);
      await prisma.costRecord.create({
        data: {
          providerId: provider.id,
          model,
          task: opts.task,
          latencyMs: Date.now() - started,
          ok: false,
          errorCode: aiErr.code,
          refType: opts.refType,
          refId: opts.refId,
        },
      });
      if (!aiErr.retryable || a === attempts) throw aiErr;
      await new Promise((r) => setTimeout(r, 2 ** a * 400));
      log.warn("ai.retry", { provider: provider.name, attempt: a, code: aiErr.code });
    }
  }
  throw lastErr instanceof Error ? lastErr : new AIError("UNKNOWN", "Unknown provider failure");
}

export async function runAI(opts: RunOptions): Promise<RunResult> {
  await assertBudget();
  const { provider, model } = await resolveForRole(opts.role);

  try {
    const r = await callWithRetry(provider, model, opts);
    return { ...r, providerId: provider.id, model, costUsd: cost(provider, r.inputTokens, r.outputTokens), usedFallback: false };
  } catch (e) {
    const aiErr = e instanceof AIError ? e : new AIError("UNKNOWN", (e as Error).message);
    // Don't burn the fallback on config problems that the fallback would share.
    if (["BUDGET_EXCEEDED", "AUTH_FAILED", "INVALID_BASE_URL"].includes(aiErr.code)) throw aiErr;
    const fb = await prisma.aIProvider.findFirst({ where: { active: true, isFallback: true, id: { not: provider.id } } });
    if (!fb) throw aiErr;
    log.warn("ai.fallback", { from: provider.name, to: fb.name, code: aiErr.code });
    const r = await callWithRetry(fb, fb.model, opts);
    return { ...r, providerId: fb.id, model: fb.model, costUsd: cost(fb, r.inputTokens, r.outputTokens), usedFallback: true };
  }
}

/** Extract the first JSON object from a model response (models sometimes wrap in prose/fences). */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AIError("PARSE_FAILED", "Model tidak mengembalikan JSON yang bisa dibaca");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    throw new AIError("PARSE_FAILED", "JSON dari model tidak valid");
  }
}

/**
 * Repair a drifting JSON object into the requested shape, and say whether it was repaired.
 *
 * Some OpenAI-compatible providers (e.g. deepseek-v4.1-flash) invent their own keys instead
 * of following the requested skeleton, and without `response_format` nothing enforces it.
 * Repairing silently would hide a real quality problem, so the caller gets `repaired:true`
 * and can surface it. If no sensible mapping exists we return null — an honest failure beats
 * inventing content that looks valid.
 */
export function coerceArrayField<T>(
  raw: unknown,
  field: string,
  candidateKeys: string[],
): { value: T[]; repaired: boolean } | null {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj[field])) return { value: obj[field] as T[], repaired: false };

    // 1. A differently-named array holding objects with the expected-ish fields.
    for (const k of Object.keys(obj)) {
      if (Array.isArray(obj[k]) && (obj[k] as unknown[]).every((x) => x && typeof x === "object")) {
        return { value: obj[k] as T[], repaired: true };
      }
    }
    // 2. No array at all: build one from named sub-objects that look like items.
    const gathered = candidateKeys
      .map((k) => Object.keys(obj).find((ok) => ok.toLowerCase() === k.toLowerCase()))
      .filter((k): k is string => Boolean(k))
      .map((k) => obj[k])
      .filter((v) => v && typeof v === "object");
    if (gathered.length) return { value: gathered as T[], repaired: true };
  }
  if (Array.isArray(raw)) return { value: raw as T[], repaired: true };
  return null;
}
