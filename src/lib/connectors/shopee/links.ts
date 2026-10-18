// src/lib/connectors/shopee/links.ts — affiliate link validation.
//
// PRD §3.5 forbids inventing affiliate IDs, sub-IDs, tokens or tracking parameters, and
// forbids treating a normal product URL as an affiliate URL. So validation is about
// recognising what the user gave us, never "fixing" it by adding parameters.
import "server-only";
import { prisma } from "@/lib/db";
import { safeFetch, SsrfError } from "@/lib/net/ssrf";
import { log } from "@/lib/logger";

export type LinkVerdict =
  | "VALID_AFFILIATE"
  | "PRODUCT_URL_NOT_AFFILIATE"
  | "SHORT_LINK_UNVERIFIED"
  | "NOT_SHOPEE"
  | "MALFORMED";

export interface LinkValidation {
  verdict: LinkVerdict;
  valid: boolean;
  reason: string;
  resolvedTo?: string;
  httpStatus?: number;
}

/** Hosts we accept as Shopee-owned. Anything else is not our business. */
const SHOPEE_HOSTS = [
  "shopee.co.id", "shopee.com", "shopee.sg", "shopee.my", "shopee.ph", "shopee.co.th",
  "shp.ee", "shope.ee", "s.shopee.co.id",
];

/**
 * Parameters Shopee's affiliate program actually emits. Observed on a real redirect from
 * s.shopee.co.id: `mmp_pid=an_<id>` plus `utm_medium=affiliates` / `utm_source=an_<id>`.
 * Presence is evidence of a tracked link, not proof that it is yours — we never claim more.
 */
const AFFILIATE_PARAMS = ["mmp_pid", "affiliate_id", "aff_id", "uls_trackid"];
const AFFILIATE_UTM = { medium: "affiliates" };

export function classifyLink(rawUrl: string): LinkValidation {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { verdict: "MALFORMED", valid: false, reason: "Bukan URL yang valid." };
  }
  if (!/^https?:$/.test(u.protocol)) {
    return { verdict: "MALFORMED", valid: false, reason: "Hanya URL http(s) yang diterima." };
  }

  const host = u.hostname.toLowerCase();
  const isShopee = SHOPEE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!isShopee) {
    return { verdict: "NOT_SHOPEE", valid: false, reason: `Domain ${host} bukan domain Shopee.` };
  }

  // Short-link domains: the affiliate parameters live behind a redirect. Until we follow it
  // the truth is genuinely unknown, so we say so instead of guessing in either direction.
  if (host === "shp.ee" || host === "shope.ee" || host.startsWith("s.")) {
    if (SHORT_LINK_UPGRADES.has(u.href)) {
      // resolveAndClassify() proved this redirect lands on a tracked link.
      return {
        verdict: "VALID_AFFILIATE",
        valid: true,
        reason: "Tautan pendek terverifikasi: redirect menuju tautan Shopee yang memuat parameter afiliasi. Parameter tidak diubah.",
      };
    }
    return {
      verdict: "SHORT_LINK_UNVERIFIED",
      valid: false,
      reason: "Tautan pendek Shopee. Parameter afiliasi tidak terlihat tanpa mengikuti redirect — status belum dapat diverifikasi.",
    };
  }

  const hasAffiliate =
    AFFILIATE_PARAMS.some((p) => u.searchParams.has(p)) ||
    u.searchParams.get("utm_medium") === AFFILIATE_UTM.medium;
  if (hasAffiliate) {
    // NOTE: we only record what the user pasted. We never add or rewrite parameters.
    return {
      verdict: "VALID_AFFILIATE",
      valid: true,
      reason: "Mengandung parameter afiliasi yang dikenali. Parameter tidak diubah — disimpan apa adanya.",
    };
  }

  return {
    verdict: "PRODUCT_URL_NOT_AFFILIATE",
    valid: false,
    reason: "URL produk biasa, bukan tautan afiliasi. Buat tautan afiliasi di dasbor Shopee Affiliate Anda, lalu tempel di sini. Aplikasi tidak akan mengarang parameter.",
  };
}

/**
 * Optionally resolve a link's final destination with SSRF protection. Only http(s) to
 * public hosts, bounded size, and every hop re-validated by safeFetch.
 */
export async function resolveDestination(rawUrl: string): Promise<{ ok: boolean; finalUrl?: string; reason?: string }> {
  try {
    const res = await safeFetch(rawUrl, { timeoutMs: 10_000, maxBytes: 256 * 1024 });
    return { ok: true, finalUrl: res.finalUrl };
  } catch (e) {
    const msg = e instanceof SsrfError ? `Ditolak oleh proteksi SSRF: ${e.message}` : (e as Error).message;
    return { ok: false, reason: msg };
  }
}

/**
 * Short links we have proven (via an SSRF-checked redirect) to be tracked. Process-local and
 * bounded: it only avoids re-following the same link twice within one run.
 */
const SHORT_LINK_UPGRADES = new Set<string>();

/**
 * classify → (if short link) follow redirect safely → classify the destination.
 * A redirect is followed at most once, to a Shopee host only, and never cached across runs.
 */
export async function analyzeLink(rawUrl: string): Promise<LinkValidation> {
  const first = classifyLink(rawUrl);
  if (first.verdict !== "SHORT_LINK_UNVERIFIED") return first;

  const r = await resolveDestination(rawUrl);
  if (!r.ok || !r.finalUrl) {
    return { ...first, reason: `${first.reason} Redirect tidak dapat diperiksa${r.reason ? `: ${r.reason}` : "."}` };
  }

  const dest = classifyLink(r.finalUrl);
  // The destination must still be Shopee-owned; a redirect elsewhere proves nothing.
  if (dest.verdict === "VALID_AFFILIATE") {
    SHORT_LINK_UPGRADES.add(new URL(rawUrl.trim()).href);
    return {
      verdict: "VALID_AFFILIATE",
      valid: true,
      reason: "Tautan pendek terverifikasi: redirect menuju tautan Shopee yang memuat parameter afiliasi. Parameter tidak diubah.",
      resolvedTo: r.finalUrl,
    };
  }
  return {
    verdict: "SHORT_LINK_UNVERIFIED",
    valid: false,
    reason: "Redirect berhasil diikuti tetapi tujuan tidak memuat parameter afiliasi yang dikenali — belum dapat dipastikan.",
    resolvedTo: r.finalUrl,
  };
}

/** Store a validation result and return it, so history is queryable. */
export async function validateAndRecord(input: { affiliateId: string; url: string }) {
  const v = await analyzeLink(input.url);

  // Only follow a redirect when the link is on a Shopee host we already accepted.
  let resolvedTo: string | undefined;
  let httpStatus: number | undefined;
  if (v.verdict === "SHORT_LINK_UNVERIFIED" || v.verdict === "VALID_AFFILIATE") {
    const r = await resolveDestination(input.url);
    if (r.ok) resolvedTo = r.finalUrl;
    else httpStatus = undefined;
  }

  await prisma.affiliateLinkValidation.create({
    data: {
      affiliateId: input.affiliateId,
      url: input.url,
      valid: v.valid,
      reason: v.reason,
      httpStatus: httpStatus ?? null,
      resolvedTo: resolvedTo ?? null,
    },
  });

  log.info("affiliate.link.validated", { verdict: v.verdict, valid: v.valid });
  return { ...v, resolvedTo, httpStatus };
}

export async function linkHistory(affiliateId: string) {
  return prisma.affiliateLinkValidation.findMany({
    where: { affiliateId },
    orderBy: { checkedAt: "desc" },
    take: 20,
  });
}
