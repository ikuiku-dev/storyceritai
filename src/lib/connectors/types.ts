// src/lib/connectors/types.ts — the contract every integration implements.
//
// PRD Phase 1 requires each connector to expose capability discovery, config validation,
// connection test, health, rate-limit handling, timeout, error classification, retry,
// structured logging, credential redaction, attribution, fixtures and graceful fallback.
//
// Implementing that per connector means six copies that drift. Instead the contract lives
// here and the mechanics live in ./base.ts, so a new connector only supplies its specifics.
import "server-only";

/**
 * The closed status set from the PRD. `CONNECTED` is deliberately hard to reach: it means
 * an authenticated call actually succeeded, never that a URL or key was merely entered.
 */
export type ConnectorStatus =
  | "NOT_CONFIGURED"
  | "NEEDS_AUTHORIZATION"
  | "CONNECTED"
  | "LIMITED_ACCESS"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "ERROR";

/** How a failure should be handled. Blind retries make rate limits and auth worse. */
export type ErrorClass =
  | "TRANSIENT"      // network blip, 5xx — safe to retry with backoff
  | "RATE_LIMIT"     // 429 — retry only after the stated delay
  | "CONFIG"         // missing/invalid credentials — needs the user
  | "PERMISSION"     // authenticated but not allowed — needs re-consent
  | "PERMANENT";     // 4xx that will never succeed — do not retry

export interface Capability {
  name: string;
  supported: boolean;
  /** Present only when supported === false. Must explain WHY, honestly. */
  reason?: string;
}

export interface Capabilities {
  supported: string[];
  unsupported: { name: string; reason: string }[];
}

export interface ConfigValidation {
  ok: boolean;
  missing: string[];
  /** Non-fatal notes, e.g. "secret must be set in .env, not the UI". */
  notes: string[];
}

export interface ConnectionTestResult {
  status: ConnectorStatus;
  ok: boolean;
  latencyMs: number;
  detail: string;
  /** Where the result came from, so the UI never implies more than was tested. */
  evidence: "live_api" | "local_check" | "not_attempted";
  errorClass?: ErrorClass;
}

export interface HealthSnapshot {
  status: ConnectorStatus;
  checkedAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface ConnectorMeta {
  id: string;
  name: string;
  kind: "sources" | "affiliate" | "publishing" | "ai";
  /** Domain or platform this connector talks to. */
  domain: string;
  accessMethod: "official_api" | "rss" | "import" | "public_page" | "oauth";
  docsUrl: string;
  /** Attribution shown with any collected data. */
  attribution: string;
}

export interface Connector<TCfg = unknown> extends ConnectorMeta {
  capabilities(cfg: TCfg | null): Capabilities;
  validateConfig(cfg: TCfg | null): ConfigValidation;
  testConnection(cfg: TCfg | null): Promise<ConnectionTestResult>;
  health(): Promise<HealthSnapshot>;
}

/** Classify an HTTP status into the retry semantics above. */
export function classifyHttpStatus(status: number): ErrorClass {
  if (status === 429) return "RATE_LIMIT";
  if (status === 401) return "CONFIG";
  if (status === 403) return "PERMISSION";
  if (status >= 500) return "TRANSIENT";
  if (status >= 400) return "PERMANENT";
  return "PERMANENT";
}

/** Should this failure be retried automatically? Only transient and rate-limit. */
export function isRetryable(cls: ErrorClass): boolean {
  return cls === "TRANSIENT" || cls === "RATE_LIMIT";
}

/** Map an error class onto the user-facing connector status. */
export function statusForError(cls: ErrorClass): ConnectorStatus {
  switch (cls) {
    case "RATE_LIMIT": return "RATE_LIMITED";
    case "CONFIG": return "NOT_CONFIGURED";
    case "PERMISSION": return "PERMISSION_DENIED";
    case "TRANSIENT": return "TEMPORARILY_UNAVAILABLE";
    default: return "ERROR";
  }
}
