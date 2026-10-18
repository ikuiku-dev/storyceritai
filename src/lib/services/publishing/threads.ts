// src/lib/services/publishing/threads.ts — Threads Graph API client.
// Verified against Meta docs (developers.facebook.com/documentation/threads):
//   POST /{user-id}/threads          → create container   {id}
//   POST /{user-id}/threads_publish  → publish container  {id}
//   GET  /{user-id}/threads_insights → metrics
//   GET  /access_token (th_exchange_token) → long-lived token
//   GET  /refresh_access_token
// Text posts: 500-char cap, emoji counted as UTF-8 bytes.
import "server-only";
import { log } from "@/lib/logger";

// Base URL is overridable so tests can point at a local fake. Production uses the real host.
export const THREADS_API = process.env.THREADS_API_BASE || "https://graph.threads.com";
export const THREADS_OAUTH = "https://threads.com/oauth/authorize";
export const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

export interface ThreadsConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/** Config comes only from server env. Never from the client. */
export function threadsConfig(): ThreadsConfig | null {
  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  const redirectUri = process.env.THREADS_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) return null;
  return { appId, appSecret, redirectUri };
}

export class ThreadsError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "THREADS_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function scrubError(s: string): string {
  return s.replace(/\b(TH[A-Za-z0-9_-]{10,}|[a-f0-9]{32,})\b/g, "[REDACTED]");
}

async function callJson(path: string, init: RequestInit, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* non-JSON */ }
    if (!res.ok) {
      const err = (json.error as { message?: string; code?: number } | undefined);
      const msg = scrubError(err?.message ?? text.slice(0, 200));
      if (res.status === 401) throw new ThreadsError(`Token Threads ditolak/kedaluwarsa: ${msg}`, 401, "TOKEN_INVALID");
      if (res.status === 429) throw new ThreadsError(`Rate limit Threads: ${msg}`, 429, "RATE_LIMITED");
      throw new ThreadsError(`Threads API error (HTTP ${res.status}): ${msg}`, res.status);
    }
    return json;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ThreadsError("Threads API timeout", 504, "TIMEOUT");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function exchangeCodeForToken(cfg: ThreadsConfig, code: string) {
  const body = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
    code,
  });
  return callJson(`${THREADS_API}/oauth/access_token`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
}

export async function exchangeLongLived(cfg: ThreadsConfig, shortToken: string) {
  const u = new URL(`${THREADS_API}/access_token`);
  u.searchParams.set("grant_type", "th_exchange_token");
  u.searchParams.set("client_secret", cfg.appSecret);
  u.searchParams.set("access_token", shortToken);
  return callJson(u.toString(), { method: "GET" });
}

export async function refreshLongLived(longToken: string) {
  const u = new URL(`${THREADS_API}/refresh_access_token`);
  u.searchParams.set("grant_type", "th_refresh_token");
  u.searchParams.set("access_token", longToken);
  return callJson(u.toString(), { method: "GET" });
}

export async function getMe(token: string) {
  const u = new URL(`${THREADS_API}/v1.0/me`);
  u.searchParams.set("fields", "id,username,name,threads_profile_picture_url");
  u.searchParams.set("access_token", token);
  return callJson(u.toString(), { method: "GET" });
}

/** Step 1 of publishing: create the media container. */
export async function createTextContainer(token: string, userId: string, text: string) {
  const u = new URL(`${THREADS_API}/v1.0/${userId}/threads`);
  const body = new URLSearchParams({ media_type: "TEXT", text, access_token: token });
  return callJson(u.toString(), { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
}

/** Step 2: publish the container. Only ever called with a container id. */
export async function publishContainer(token: string, userId: string, creationId: string) {
  const u = new URL(`${THREADS_API}/v1.0/${userId}/threads_publish`);
  const body = new URLSearchParams({ creation_id: creationId, access_token: token });
  return callJson(u.toString(), { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
}

export async function getPostInsights(token: string, mediaId: string) {
  const u = new URL(`${THREADS_API}/v1.0/${mediaId}/insights`);
  u.searchParams.set("metric", "views,likes,replies,reposts,quotes,shares");
  u.searchParams.set("access_token", token);
  return callJson(u.toString(), { method: "GET" });
}

/** Parse Meta's {data:[{name,values|value}]} insights shape into a flat object. */
export function flattenInsights(raw: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const data = (raw.data as { name?: string; values?: { value?: number }[]; value?: number }[] | undefined) ?? [];
  for (const m of data) {
    if (!m.name) continue;
    const v = m.values?.[0]?.value ?? m.value;
    out[m.name] = typeof v === "number" ? v : null;
  }
  return out;
}

export { log };
