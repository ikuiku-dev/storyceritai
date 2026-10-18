// src/lib/connectors/base.ts — shared mechanics for every connector.
//
// Written once so retry/backoff, timeout, redaction and health tracking behave identically
// across sources, Shopee and Threads. A connector that reimplements these will drift.
import "server-only";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import {
  classifyHttpStatus, isRetryable, statusForError,
  type ConnectionTestResult, type ErrorClass, type HealthSnapshot, type ConnectorStatus,
} from "./types";

/** Strip anything that looks like a credential before it reaches a log or an API response. */
export function redact(input: unknown): string {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  return s
    .replace(/\b(sk|pk|th|shp|ghp|xox[baprs])[-_][A-Za-z0-9_-]{8,}/gi, "$1…REDACTED")
    .replace(/(access_token|refresh_token|token|cipher|secret|api[_-]?key|password)["']?\s*[:=]\s*["']?[^\s,"'}]{6,}/gi, "$1=REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]{10,}/gi, "Bearer REDACTED")
    .slice(0, 500);
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly errorClass: ErrorClass,
    readonly status?: number,
  ) {
    super(redact(message));
    this.name = "ConnectorError";
  }

  get retryable(): boolean {
    return isRetryable(this.errorClass);
  }
}

export interface RequestOptions {
  timeoutMs?: number;
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  baseDelayMs?: number;
  headers?: Record<string, string>;
}

export interface RawResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
  latencyMs: number;
}

/**
 * Perform one request with timeout, then retry only what is safe to retry.
 * Rate-limit responses honour Retry-After instead of a blind backoff — hammering a
 * rate-limited API is how accounts get locked.
 */
export async function requestWithRetry(
  url: string,
  init: RequestInit,
  opts: RequestOptions = {},
): Promise<RawResponse> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 400;

  let lastErr: ConnectorError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ac.signal, redirect: "manual" });
      const text = await res.text();
      const latencyMs = Date.now() - started;
      const out: RawResponse = { status: res.status, ok: res.ok, headers: res.headers, text, latencyMs };

      if (res.ok) return out;

      const cls = classifyHttpStatus(res.status);
      lastErr = new ConnectorError(`HTTP ${res.status} from ${new URL(url).host}`, cls, res.status);
      if (!isRetryable(cls) || attempt === maxAttempts) throw lastErr;

      // Rate limit: wait exactly as told. Otherwise exponential backoff with jitter.
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = cls === "RATE_LIMIT" && Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 30_000)
        : baseDelay * 2 ** (attempt - 1) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, wait));
    } catch (e) {
      if (e instanceof ConnectorError) throw e;
      const aborted = (e as Error).name === "AbortError";
      lastErr = new ConnectorError(
        aborted ? `Timeout after ${timeoutMs}ms` : `Network error: ${(e as Error).message}`,
        "TRANSIENT",
      );
      if (attempt === maxAttempts) throw lastErr;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr ?? new ConnectorError("Request failed", "TRANSIENT");
}

/** Record a connector outcome so Health shows real history, not a guess. */
export async function recordHealth(
  connectorId: string,
  status: ConnectorStatus,
  detail: string | null,
): Promise<void> {
  const now = new Date();
  const ok = status === "CONNECTED" || status === "LIMITED_ACCESS";
  const prior = await prisma.integrationHealth.findUnique({ where: { connectorId } });
  const consecutive = ok ? 0 : (prior?.consecutiveFailures ?? 0) + 1;

  await prisma.integrationHealth.upsert({
    where: { connectorId },
    create: {
      connectorId, status, checkedAt: now,
      lastSuccessAt: ok ? now : null,
      lastErrorAt: ok ? null : now,
      lastError: ok ? null : redact(detail ?? ""),
      consecutiveFailures: consecutive,
    },
    update: {
      status, checkedAt: now,
      lastSuccessAt: ok ? now : prior?.lastSuccessAt ?? null,
      lastErrorAt: ok ? prior?.lastErrorAt ?? null : now,
      lastError: ok ? prior?.lastError ?? null : redact(detail ?? ""),
      consecutiveFailures: consecutive,
    },
  });

  log.info("connector.health", { connectorId, status, consecutive });
}

export async function readHealth(connectorId: string): Promise<HealthSnapshot> {
  const row = await prisma.integrationHealth.findUnique({ where: { connectorId } });
  if (!row) {
    return {
      status: "NOT_CONFIGURED", checkedAt: new Date(0).toISOString(),
      lastSuccessAt: null, lastErrorAt: null, lastError: null, consecutiveFailures: 0,
    };
  }
  return {
    status: row.status as ConnectorStatus,
    checkedAt: row.checkedAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
  };
}

/** Turn a thrown ConnectorError into the standard test result shape. */
export function failedTest(e: unknown, latencyMs: number): ConnectionTestResult {
  if (e instanceof ConnectorError) {
    return {
      status: statusForError(e.errorClass),
      ok: false,
      latencyMs,
      detail: e.message,
      evidence: "live_api",
      errorClass: e.errorClass,
    };
  }
  return {
    status: "ERROR", ok: false, latencyMs,
    detail: redact((e as Error)?.message ?? "Unknown error"),
    evidence: "not_attempted",
    errorClass: "PERMANENT",
  };
}
