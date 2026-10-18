// src/lib/services/products/service.ts — products, snapshots, imports, affiliate link validation.
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { computeOpportunity, DEFAULT_WEIGHTS, type Weights, type ScoreInput } from "./scoring";
import { ApiError } from "@/lib/api";

export async function getWeights(): Promise<Weights> {
  const s = await prisma.userSettings.findUnique({ where: { id: "singleton" } });
  if (!s) return DEFAULT_WEIGHTS;
  try {
    const w = JSON.parse(s.scoringWeightsJson) as Weights;
    return { ...DEFAULT_WEIGHTS, ...w };
  } catch { return DEFAULT_WEIGHTS; }
}

export function scoreInputFrom(p: Record<string, unknown>): ScoreInput {
  const n = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
  return {
    problemFitScore: n("problemFitScore"),
    demandEvidenceScore: n("demandEvidenceScore"),
    dataQualityScore: n("dataQualityScore"),
    demonstrabilityScore: n("demonstrabilityScore"),
    commissionScore: n("commissionScore"),
    riskScore: n("riskScore"),
  };
}

export async function recomputeScore(productId: string) {
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p) throw new ApiError("Produk tidak ditemukan", 404, "NOT_FOUND");
  const weights = await getWeights();
  const result = computeOpportunity(scoreInputFrom(p as unknown as Record<string, unknown>), weights);
  await prisma.product.update({
    where: { id: productId },
    data: { opportunityScore: result.score, opportunityComputedAt: new Date() },
  });
  return result;
}

const CSV_HEADERS = ["name", "shopName", "category", "url", "targetAudience", "buyerProblem", "priceIdr", "rating", "reviewCount", "commissionPerOrderIdr"];

/** Minimal RFC4180-ish CSV parser: handles quotes, escaped quotes, CRLF. */
export function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length));
  if (nonEmpty.length < 2) return [];
  const head = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export interface ImportRow { name: string; shopName?: string | null; category?: string | null; url?: string | null; targetAudience?: string | null; buyerProblem?: string | null; priceIdr?: number | null; rating?: number | null; reviewCount?: number | null; commissionPerOrderIdr?: number | null }

export async function importProducts(rows: ImportRow[], origin: "CSV_IMPORT" | "JSON_IMPORT") {
  const created: string[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.name?.trim()) { errors.push({ row: i + 1, message: "Kolom name kosong" }); continue; }
    try {
      const p = await prisma.product.create({
        data: {
          name: r.name.slice(0, 200),
          shopName: r.shopName?.slice(0, 120) ?? null,
          category: r.category?.slice(0, 80) ?? null,
          url: r.url && /^https?:\/\//i.test(r.url) ? r.url.slice(0, 2000) : null,
          targetAudience: r.targetAudience?.slice(0, 500) ?? null,
          buyerProblem: r.buyerProblem?.slice(0, 1000) ?? null,
          sourceOrigin: origin,
          verificationStatus: "UNVERIFIED",
        },
      });
      if (r.priceIdr != null || r.rating != null || r.reviewCount != null) {
        await prisma.productSnapshot.create({
          data: { productId: p.id, priceIdr: r.priceIdr ?? null, rating: r.rating ?? null, reviewCount: r.reviewCount ?? null, sourceOrigin: origin },
        });
      }
      if (r.commissionPerOrderIdr != null) {
        // Never fabricate an affiliate URL. Keep the commission value on the product as an
        // unverified note until the user pastes a real link from the Shopee affiliate portal.
        await prisma.product.update({
          where: { id: p.id },
          data: {
            notes: `Komisi per pesanan (impor, belum terverifikasi): Rp${r.commissionPerOrderIdr}`,
            commissionScore: null,
          },
        });
      }
      created.push(p.id);
    } catch (e) {
      errors.push({ row: i + 1, message: (e as Error).message.slice(0, 200) });
    }
  }
  await audit({ action: "products.imported", summary: `${created.length} produk diimpor (${origin})`, entityType: "Product", meta: { errors: errors.length } });
  return { created: created.length, errors };
}

/** Affiliate URL validation: format + expected domain. Never fabricates tracking params. */
const ALLOWED_HOSTS = ["shopee.co.id", "shp.ee", "shope.ee", "id.shp.ee", "s.shopee.co.id"];

export async function validateAffiliateLink(linkId: string) {
  const link = await prisma.affiliateLink.findUnique({ where: { id: linkId } });
  if (!link) throw new ApiError("Tautan tidak ditemukan", 404, "NOT_FOUND");

  let status: "VALID" | "INVALID" | "UNREACHABLE" = "VALID";
  let note = "";
  let host = "";
  try {
    const u = new URL(link.affiliateUrl);
    host = u.hostname.toLowerCase();
    if (!/^https?:$/.test(u.protocol)) { status = "INVALID"; note = "Skema bukan http(s)."; }
    else if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      status = "INVALID";
      note = `Domain "${host}" bukan domain Shopee yang dikenal (${ALLOWED_HOSTS.join(", ")}). Periksa apakah ini tautan affiliate yang benar.`;
    } else if (u.hostname.includes("placeholder")) { status = "INVALID"; note = "URL placeholder."; }
    else note = `Format valid · domain ${host}`;
  } catch {
    status = "INVALID"; note = "URL tidak bisa di-parse.";
  }

  await prisma.affiliateLink.update({
    where: { id: linkId },
    data: { validationStatus: status, validationNote: note, checkedAt: new Date() },
  });
  await audit({ action: "affiliate.validated", summary: `Tautan ${host || linkId} → ${status}`, entityType: "AffiliateLink", entityId: linkId });
  return { status, note };
}
