// src/lib/logger.ts — structured JSON logs with recursive secret scrubbing.
const SECRET_KEYS = /^(api_?key|apikey|token|access_?token|refresh_?token|secret|password|authorization|client_secret|cookie)$/i;
const SECRET_VALUE = /\b(sk-[A-Za-z0-9_-]{8,}|THQVJ[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (value == null) return value;
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[REDACTED]");
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : scrub(v, depth + 1);
  }
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(scrub(fields ?? {}) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => process.env.LOG_LEVEL === "debug" && emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};

/** Safe error message for API responses: strips anything that smells like a secret or a stack trace. */
export function publicError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return String(scrub(msg)).slice(0, 400);
}
