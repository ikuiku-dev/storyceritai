// src/lib/connectors/sources/robots.ts — robots.txt as ONE permission signal.
//
// PRD Phase 2.1 is explicit: robots.txt is not the only determinant of permission. So this
// module never returns "allowed" as a final verdict — it returns a policy signal that the
// registry combines with the adapter's declared terms and the user's own assertion.
//
// Still, when robots.txt says Disallow we treat it as a hard stop, because ignoring an
// explicit instruction is indefensible regardless of what else says otherwise.
import "server-only";
import { safeFetch } from "@/lib/net/ssrf";
import { log } from "@/lib/logger";

export type RobotsVerdict = "ALLOWED" | "DISALLOWED" | "UNAVAILABLE";

export interface RobotsPolicy {
  verdict: RobotsVerdict;
  crawlDelayMs: number | null;
  /** Why we reached the verdict — shown in the UI so the user can judge. */
  reason: string;
  fetchedAt: string;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h: robots.txt rarely changes, and re-fetching is rude
const cache = new Map<string, RobotsPolicy>();

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
  crawlDelay: number | null;
}

/** Parse the subset of robots.txt that matters for a single-page fetch. */
export function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "disallow") current.disallow.push(value);
    else if (field === "allow") current.allow.push(value);
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = Math.round(n * 1000);
    }
  }
  return groups;
}

/** Pick the group that applies to us: most specific UA match, else `*`. */
function selectGroup(groups: RobotsGroup[], ua: string): RobotsGroup | null {
  const uaLower = ua.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && uaLower.includes(a)));
  if (specific.length) {
    // Longest matching agent wins.
    return specific.sort((a, b) =>
      Math.max(...b.agents.map((x) => x.length)) - Math.max(...a.agents.map((x) => x.length)),
    )[0];
  }
  return groups.find((g) => g.agents.includes("*")) ?? null;
}

/** Longest-match rule wins; Allow beats Disallow on equal length (standard behaviour). */
export function isPathAllowed(group: RobotsGroup, path: string): boolean {
  const match = (pattern: string) => {
    if (!pattern) return -1;
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const re = new RegExp(
      "^" + body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + (anchored ? "$" : ""),
    );
    return re.test(path) ? body.length : -1;
  };

  const dis = group.disallow.map(match).filter((n) => n >= 0);
  const alw = group.allow.map(match).filter((n) => n >= 0);
  const maxDis = dis.length ? Math.max(...dis) : -1;
  const maxAlw = alw.length ? Math.max(...alw) : -1;

  if (maxDis === -1) return true;
  return maxAlw >= maxDis;
}

export interface RobotsCheckOptions {
  userAgent?: string;
  /** Inject for tests. */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; text: string }>;
}

/**
 * Fetch and evaluate robots.txt for a URL. Never throws: an unreachable robots.txt is
 * reported as UNAVAILABLE so the caller can decide, rather than silently assuming consent.
 */
export async function checkRobots(
  targetUrl: string,
  opts: RobotsCheckOptions = {},
): Promise<RobotsPolicy> {
  const ua = opts.userAgent ?? "CeritaLabBot";
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { verdict: "DISALLOWED", crawlDelayMs: null, reason: "URL tidak valid", fetchedAt: new Date().toISOString() };
  }

  const origin = parsed.origin;
  const cached = cache.get(origin);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) return cached;

  const robotsUrl = `${origin}/robots.txt`;
  let body: string;
  try {
    const fetcher = opts.fetchImpl ?? (async (u: string) => {
      const r = await safeFetch(u, { timeoutMs: 8_000, maxBytes: 512 * 1024 });
      return { ok: true, status: 200, text: r.body };
    });
    const res = await fetcher(robotsUrl);
    if (res.status === 404) {
      // No robots.txt = no restrictions stated. This is permission to crawl by convention,
      // not proof of permission from the site owner — the registry records both.
      const policy: RobotsPolicy = {
        verdict: "ALLOWED", crawlDelayMs: null,
        reason: "robots.txt tidak ditemukan (404) — tidak ada larangan eksplisit.",
        fetchedAt: new Date().toISOString(),
      };
      cache.set(origin, policy);
      return policy;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = res.text;
  } catch (e) {
    const policy: RobotsPolicy = {
      verdict: "UNAVAILABLE", crawlDelayMs: null,
      reason: `robots.txt tidak bisa diambil: ${(e as Error).message}. Izin tidak dapat dipastikan.`,
      fetchedAt: new Date().toISOString(),
    };
    cache.set(origin, policy);
    log.warn("robots.unavailable", { origin, detail: (e as Error).message });
    return policy;
  }

  const groups = parseRobots(body);
  const group = selectGroup(groups, ua);

  // A robots.txt that parses to no applicable group imposes no restriction.
  if (!group) {
    const policy: RobotsPolicy = {
      verdict: "ALLOWED", crawlDelayMs: null,
      reason: "Tidak ada aturan yang berlaku untuk user-agent ini.",
      fetchedAt: new Date().toISOString(),
    };
    cache.set(origin, policy);
    return policy;
  }

  const allowed = isPathAllowed(group, parsed.pathname + parsed.search);
  const policy: RobotsPolicy = {
    verdict: allowed ? "ALLOWED" : "DISALLOWED",
    crawlDelayMs: group.crawlDelay,
    reason: allowed
      ? `Diizinkan oleh aturan robots.txt (${group.agents.join(",") || "*"}).`
      : `Larangan eksplisit di robots.txt untuk path ${parsed.pathname} (${group.agents.join(",") || "*"}).`,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(origin, policy);
  return policy;
}

/** Test seam. */
export function clearRobotsCache(): void {
  cache.clear();
}
