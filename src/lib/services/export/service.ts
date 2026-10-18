// src/lib/services/export/service.ts — data export/import.
//
// SECURITY CONTRACT: exported bundles never contain secrets. API keys and OAuth tokens
// live in encrypted columns that are explicitly excluded here. A bundle is safe to share,
// archive, or commit to a private repo.
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";

export const BUNDLE_VERSION = 1;

export type BundleScope = "full" | "content" | "settings";

/** Fields that must never leave the server, even encrypted. */
const FORBIDDEN_KEYS = ["apiKeyCipher", "tokenCipher", "apiKey", "accessToken", "refreshToken", "clientSecret", "appSecret"];

function assertNoSecrets(value: unknown, path = "$"): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(k)) {
        throw new ApiError(`Ekspor dibatalkan: field rahasia "${k}" ditemukan di ${path}. Ini bug, bukan kesalahan Anda.`, 500, "SECRET_LEAK_BLOCKED");
      }
      assertNoSecrets(v, `${path}.${k}`);
    }
  }
}

export interface ExportBundle {
  version: number;
  exportedAt: string;
  scope: BundleScope;
  data: Record<string, unknown[]>;
  counts: Record<string, number>;
  notes: string[];
}

export async function buildExport(scope: BundleScope = "full"): Promise<ExportBundle> {
  const data: Record<string, unknown[]> = {};
  const notes: string[] = [];

  // Content: the actual work product.
  if (scope === "full" || scope === "content") {
    data.products = await prisma.product.findMany({ include: { snapshots: true, affiliateLinks: true } });
    data.sources = await prisma.source.findMany({ include: { excerpts: true, insights: true } });
    data.storyConcepts = await prisma.storyConcept.findMany();
    data.storyDrafts = await prisma.storyDraft.findMany({
      select: {
        id: true, conceptId: true, title: true, text: true, truthMode: true, status: true,
        factCheckStatus: true, stylePreset: true, createdAt: true, updatedAt: true,
        // revisions and scores carry the audit trail of how the draft evolved
        revisions: { select: { id: true, revision: true, text: true, changeNote: true, actor: true, createdAt: true } },
        scores: { select: { id: true, rubricVersion: true, naturalness: true, relevance: true, clarity: true, originality: true, trustTransparency: true, productFit: true, endingQuality: true, weightedScore: true, penaltiesJson: true, reasonsJson: true, scoredBy: true, createdAt: true } },
      },
    });
    data.experiments = await prisma.storyExperiment.findMany({ include: { variants: true } });
    data.publishedPosts = await prisma.publishedPost.findMany({
      select: {
        id: true, draftId: true, variantId: true, platform: true, finalText: true, affiliateUrl: true,
        disclosureIncluded: true, status: true, publishedAt: true, scheduledAt: true, createdAt: true,
        metrics: true,
      },
    });
  }

  // Settings: preferences only. No provider rows, no tokens.
  if (scope === "full" || scope === "settings") {
    const s = await prisma.userSettings.findUnique({ where: { id: "singleton" } });
    data.userSettings = s ? [s] : [];
    // Providers are exported WITHOUT keys so the bundle stays portable and safe.
    data.aiProviders = await prisma.aIProvider.findMany({
      select: {
        id: true, name: true, protocol: true, baseUrl: true, model: true, active: true,
        isFallback: true, timeoutMs: true, maxOutputTokens: true, maxRetries: true,
        priceInputPer1M: true, priceOutputPer1M: true, contextWindow: true,
      },
    });
    data.aiModelConfigurations = await prisma.aIModelConfiguration.findMany();
    data.auditLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" }, take: 1000,
      select: { id: true, action: true, summary: true, actor: true, entityType: true, entityId: true, createdAt: true },
    });
  }

  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) counts[k] = v.length;

  if (data.aiProviders?.length) {
    notes.push("Kunci API TIDAK disertakan. Setelah impor, masukkan ulang kunci di halaman AI Providers.");
  }
  notes.push("Tautan affiliate disertakan apa adanya; tidak ada yang dibuat ulang.");

  const bundle: ExportBundle = { version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), scope, data, counts, notes };

  // Belt-and-braces: verify no secret field slipped into the payload.
  assertNoSecrets(bundle);

  await audit({ action: "data.exported", summary: `Ekspor data (${scope}): ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}`, entityType: "System" });
  return bundle;
}

export function validateBundle(raw: unknown): ExportBundle {
  const b = raw as Partial<ExportBundle>;
  if (!b || typeof b !== "object") throw new ApiError("Berkas bukan JSON objek.", 422, "BAD_BUNDLE");
  if (b.version !== BUNDLE_VERSION) throw new ApiError(`Versi bundle ${String(b.version)} tidak didukung (harus ${BUNDLE_VERSION}).`, 422, "BAD_VERSION");
  if (!b.data || typeof b.data !== "object") throw new ApiError("Bundle tidak berisi 'data'.", 422, "BAD_BUNDLE");
  assertNoSecrets(b);
  return b as ExportBundle;
}

/**
 * Restore content by id. Existing rows are skipped, never overwritten — an import must not
 * silently destroy work the user has done since the export.
 */
export async function restoreBundle(bundle: ExportBundle) {
  const created: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const errors: string[] = [];

  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

  for (const p of (bundle.data.products as Record<string, unknown>[]) ?? []) {
    try {
      const id = String(p.id);
      const exists = await prisma.product.findUnique({ where: { id } });
      if (exists) { bump(skipped, "products"); continue; }
      const { snapshots, affiliateLinks, ...rest } = p as Record<string, unknown>;
      await prisma.product.create({ data: rest as never });
      bump(created, "products");
      void snapshots; void affiliateLinks;
    } catch (e) { errors.push(`product: ${(e as Error).message.slice(0, 100)}`); }
  }

  for (const s of (bundle.data.sources as Record<string, unknown>[]) ?? []) {
    try {
      const id = String(s.id);
      const exists = await prisma.source.findUnique({ where: { id } });
      if (exists) { bump(skipped, "sources"); continue; }
      const { excerpts, insights, ...rest } = s as Record<string, unknown>;
      await prisma.source.create({ data: rest as never });
      bump(created, "sources");
      void excerpts; void insights;
    } catch (e) { errors.push(`source: ${(e as Error).message.slice(0, 100)}`); }
  }

  await audit({
    action: "data.imported",
    summary: `Impor data: dibuat ${Object.entries(created).map(([k, v]) => `${k}=${v}`).join(", ") || "tidak ada"}`,
    entityType: "System",
    meta: { created, skipped, errorCount: errors.length },
  });

  return { created, skipped, errors, total: Object.values(created).reduce((a, b) => a + b, 0) };
}
