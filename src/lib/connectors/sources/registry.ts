// src/lib/connectors/sources/registry.ts — what we are allowed to collect, and from where.
//
// The registry is the single place that decides whether a fetch may proceed. It combines
// three independent signals and never treats any one of them as sufficient on its own:
//
//   1. robots.txt      — explicit machine-readable instruction
//   2. adapter terms   — what the adapter type is designed for (rss/sitemap/api/import)
//   3. user assertion  — the user confirming they may use this source
//
// A DISALLOWED robots.txt is a hard stop regardless of (3). Everything else is recorded
// with its reason so the UI can show why, instead of a bare green tick.
import "server-only";
import { prisma } from "@/lib/db";
import { checkRobots } from "./robots";
import { log } from "@/lib/logger";

export type AdapterType = "rss" | "sitemap" | "public_api" | "import" | "manual_url";
export type PermissionVerdict = "ALLOWED" | "DISALLOWED" | "UNKNOWN" | "USER_IMPORT";

export interface AccessDecision {
  allowed: boolean;
  verdict: PermissionVerdict;
  /** Human-readable justification, always populated. */
  reason: string;
  /** Seconds to wait between requests, from robots.txt or our own floor. */
  minDelayMs: number;
}

/** Adapters that never touch a remote server cannot violate crawl policy. */
const OFFLINE_ADAPTERS: AdapterType[] = ["import"];

/** Our own politeness floor, applied even when robots.txt is silent. */
const DEFAULT_DELAY_MS = 1_500;

export async function decideAccess(url: string, adapterType: AdapterType): Promise<AccessDecision> {
  if (OFFLINE_ADAPTERS.includes(adapterType)) {
    // User-supplied files: the user asserts they have the right to use them.
    return {
      allowed: true,
      verdict: "USER_IMPORT",
      reason: "Data diimpor oleh pengguna, bukan diambil dari server pihak ketiga.",
      minDelayMs: 0,
    };
  }

  const robots = await checkRobots(url);

  if (robots.verdict === "DISALLOWED") {
    // Explicit instruction. Not negotiable, even if the user insists.
    return { allowed: false, verdict: "DISALLOWED", reason: robots.reason, minDelayMs: 0 };
  }

  if (robots.verdict === "UNAVAILABLE") {
    // We cannot prove permission. The PRD says: when unclear, use official means or ask
    // the user to import. So we do not crawl — we report why.
    return {
      allowed: false,
      verdict: "UNKNOWN",
      reason: `${robots.reason} Tanpa kepastian izin, pengambilan tidak dijalankan. Impor data secara manual jika Anda berhak menggunakannya.`,
      minDelayMs: 0,
    };
  }

  // ALLOWED by robots.txt. RSS and public APIs are designed for machine consumption;
  // a generic page is weaker evidence, so it is allowed but recorded as such.
  const delay = Math.max(robots.crawlDelayMs ?? 0, DEFAULT_DELAY_MS);
  const nuance = adapterType === "manual_url"
    ? "robots.txt mengizinkan, namun halaman biasa tidak dirancang untuk pengambilan otomatis."
    : "robots.txt mengizinkan dan jenis adapter ini memang dirancang untuk dibaca mesin.";

  return { allowed: true, verdict: "ALLOWED", reason: `${robots.reason} ${nuance}`, minDelayMs: delay };
}

/** Upsert a registry row keeping the freshest robots/verdict information. */
export async function registerSource(input: {
  name: string;
  domain: string;
  adapterType: AdapterType;
  permissionStatus: PermissionVerdict;
  robotsVerdict?: string;
  crawlDelayMs?: number | null;
  allowedDataTypes?: string;
  attribution?: string;
  siteUrl: string;
}) {
  const row = await prisma.sourceConnector.upsert({
    where: { domain_adapterType: { domain: input.domain, adapterType: input.adapterType } },
    create: {
      name: input.name,
      domain: input.domain,
      adapterType: input.adapterType,
      accessMethod: input.adapterType,
      permissionStatus: input.permissionStatus,
      robotsStatus: input.robotsVerdict ?? null,
      robotsCheckedAt: input.robotsVerdict ? new Date() : null,
      crawlDelayMs: input.crawlDelayMs ?? null,
      allowedDataTypes: input.allowedDataTypes ?? "title,summary,quote",
      attribution: input.attribution ?? input.domain,
    },
    update: {
      permissionStatus: input.permissionStatus,
      robotsStatus: input.robotsVerdict ?? null,
      robotsCheckedAt: input.robotsVerdict ? new Date() : null,
      crawlDelayMs: input.crawlDelayMs ?? null,
    },
  });
  log.info("source.registered", { domain: input.domain, verdict: input.permissionStatus });
  return row;
}

/** Test a source before the user enables it — the "Test access" button. */
export async function testSourceAccess(url: string, adapterType: AdapterType) {
  const decision = await decideAccess(url, adapterType);
  let host = "";
  try { host = new URL(url).hostname; } catch { /* reported by decideAccess */ }

  if (host && decision.verdict !== "USER_IMPORT") {
    await registerSource({
      name: host,
      domain: host,
      adapterType,
      permissionStatus: decision.verdict,
      robotsVerdict: decision.verdict === "UNKNOWN" ? "UNAVAILABLE" : decision.verdict,
      crawlDelayMs: decision.minDelayMs || null,
      siteUrl: url,
    });
  }
  return decision;
}

export async function listSources() {
  return prisma.sourceConnector.findMany({ orderBy: { createdAt: "desc" } });
}
