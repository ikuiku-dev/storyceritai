// src/lib/connectors/shopee/index.ts — affiliate connector.
//
// PRD Phase 3 is blunt about the risk here: do not pretend to have catalog, sales or
// commission access. I cannot verify from this machine whether the user's affiliate account
// has search/commission API access, so the implementation:
//
//   • defaults to MANUAL_IMPORT, which works end-to-end with no credentials
//   • declares API capabilities as UNSUPPORTED with an explicit reason until credentials
//     are present AND a live call succeeds
//   • never invents commission, sales indicators or sub-IDs
//
// Adapter priority from the PRD is encoded in `resolveMode()`.
import "server-only";
import { prisma } from "@/lib/db";
import { requestWithRetry, ConnectorError, failedTest, recordHealth, readHealth, redact } from "../base";
import type { Capabilities, ConfigValidation, ConnectionTestResult, Connector, ConnectorStatus } from "../types";

export type ShopeeMode = "OFFICIAL_API" | "MANUAL_IMPORT" | "DISABLED";

export interface ShopeeConfig {
  appId?: string;
  appSecret?: string;
  /** Set by the user only after they have confirmed access in the affiliate dashboard. */
  apiAccessConfirmed?: boolean;
  baseUrlOverride?: string;
}

export const SHOPEE_API = () => process.env.SHOPEE_API_BASE || "https://partner.shopeemobile.com";

/**
 * Capabilities are declared independently of config so the UI can always show an honest
 * matrix. `available` flips only when the prerequisite is actually satisfied.
 */
export function capabilities(cfg: ShopeeConfig | null): Capabilities {
  const hasCreds = Boolean(cfg?.appId && cfg?.appSecret);
  const confirmed = Boolean(cfg?.apiAccessConfirmed);

  const unsupported: { name: string; reason: string }[] = [];
  if (!hasCreds) {
    unsupported.push({ name: "shopee.product.search", reason: "Butuh App ID & App Secret dari Shopee Affiliate/Open Platform." });
    unsupported.push({ name: "shopee.commission.report", reason: "Butuh kredensial API dan laporan komisi resmi." });
  } else if (!confirmed) {
    unsupported.push({ name: "shopee.product.search", reason: "Kredensial ada, tetapi akses API belum dikonfirmasi aktif untuk akun ini." });
    unsupported.push({ name: "shopee.commission.report", reason: "Akses laporan komisi belum dikonfirmasi." });
  }

  return {
    supported: [
      "shopee.product.import_url",     // manual URL entry
      "shopee.product.import_csv",     // CSV from official report export
      "shopee.affiliate.link.store",   // store & validate a link the user created
      "shopee.affiliate.link.validate",
      "shopee.product.snapshot",       // timestamped record of what the user supplied
    ],
    unsupported,
  };
}

export function validateConfig(cfg: ShopeeConfig | null): ConfigValidation {
  const missing: string[] = [];
  const notes: string[] = [];
  if (!cfg?.appId) missing.push("appId");
  if (!cfg?.appSecret) missing.push("appSecret");
  if (missing.length) {
    notes.push("Tanpa kredensial, konektor berjalan dalam mode Impor Manual — semua fitur inti tetap bisa dipakai.");
  }
  notes.push("Jangan menempelkan secret ke percakapan; simpan lewat halaman Settings (.env).");
  return { ok: missing.length === 0, missing, notes };
}

/**
 * Connection test. Reaches a live endpoint only when credentials exist; otherwise it returns
 * LIMITED_ACCESS with evidence "local_check" so the UI cannot imply an API was verified.
 */
export async function testConnection(cfg: ShopeeConfig | null): Promise<ConnectionTestResult> {
  const started = Date.now();
  const v = validateConfig(cfg);

  if (!v.ok) {
    await recordHealth("shopee", "NOT_CONFIGURED", "Kredensial belum diisi — mode impor manual aktif.");
    return {
      status: "NOT_CONFIGURED",
      ok: false,
      latencyMs: Date.now() - started,
      detail: "Mode Impor Manual aktif. Impor produk lewat CSV atau tempel URL produk — tidak perlu kredensial.",
      evidence: "local_check",
      errorClass: "CONFIG",
    };
  }

  if (!cfg?.apiAccessConfirmed) {
    await recordHealth("shopee", "NEEDS_AUTHORIZATION", "Akses API belum dikonfirmasi pengguna.");
    return {
      status: "NEEDS_AUTHORIZATION",
      ok: false,
      latencyMs: Date.now() - started,
      detail: "Kredensial tersimpan, tetapi akses API belum dikonfirmasi. Konfirmasi di dashboard Shopee Affiliate, lalu tandai di halaman konektor.",
      evidence: "local_check",
      errorClass: "PERMISSION",
    };
  }

  // Live reachability probe only. This proves the host answers — NOT that the account has
  // search or commission rights, which is a separate, documented limitation.
  try {
    const res = await requestWithRetry(`${SHOPEE_API()}/api/v2/shop/auth_partner`, {
      method: "GET",
    }, { timeoutMs: 8_000, maxAttempts: 2 });
    const status: ConnectorStatus = res.ok ? "CONNECTED" : "LIMITED_ACCESS";
    await recordHealth("shopee", status, null);
    return {
      status,
      ok: res.ok,
      latencyMs: res.latencyMs,
      detail: res.ok
        ? "Host API Shopee merespons. Catatan: ini hanya membuktikan konektivitas, bukan hak akses pencarian/komisi."
        : `Host merespons HTTP ${res.status}; hak akses fitur belum terbukti.`,
      evidence: "live_api",
    };
  } catch (e) {
    const r = failedTest(e, Date.now() - started);
    await recordHealth("shopee", r.status, r.detail);
    return r;
  }
}

/** Decide which adapter path is actually usable right now (PRD §3.2 ordering). */
export async function resolveMode(): Promise<{ mode: ShopeeMode; reason: string }> {
  const cfg: ShopeeConfig = {
    appId: process.env.SHOPEE_APP_ID,
    appSecret: process.env.SHOPEE_APP_SECRET,
    apiAccessConfirmed: process.env.SHOPEE_API_CONFIRMED === "true",
  };
  const row = await prisma.productConnector.findUnique({ where: { provider: "shopee" } });

  if (row?.mode === "DISABLED") return { mode: "DISABLED", reason: "Konektor dinonaktifkan pengguna." };

  if (cfg.appId && cfg.appSecret && cfg.apiAccessConfirmed) {
    return { mode: "OFFICIAL_API", reason: "Kredensial lengkap dan akses dikonfirmasi — API resmi dipakai lebih dulu." };
  }
  return {
    mode: "MANUAL_IMPORT",
    reason: "API resmi belum tersedia untuk akun ini. Mode Impor Manual aktif: CSV resmi atau URL produk.",
  };
}

/** Persist the resolved mode so the UI reflects reality rather than a default. */
export async function syncConnectorState() {
  const { mode, reason } = await resolveMode();
  const cfg: ShopeeConfig = {
    appId: process.env.SHOPEE_APP_ID,
    appSecret: process.env.SHOPEE_APP_SECRET,
    apiAccessConfirmed: process.env.SHOPEE_API_CONFIRMED === "true",
  };
  const caps = capabilities(cfg);
  const status: ConnectorStatus =
    mode === "DISABLED" ? "ERROR" : mode === "OFFICIAL_API" ? "CONNECTED" : "LIMITED_ACCESS";

  return prisma.productConnector.upsert({
    where: { provider: "shopee" },
    create: {
      provider: "shopee", mode, status,
      capabilitiesJson: JSON.stringify(caps),
      note: reason, lastCheckedAt: new Date(),
    },
    update: {
      mode, status,
      capabilitiesJson: JSON.stringify(caps),
      note: reason, lastCheckedAt: new Date(),
    },
  });
}

export const shopeeConnector: Connector<ShopeeConfig> = {
  id: "shopee",
  name: "Shopee Affiliate",
  kind: "affiliate",
  domain: "shopee.co.id",
  accessMethod: "official_api",
  docsUrl: "https://affiliate.shopee.co.id/",
  attribution: "Shopee Affiliate Program",
  capabilities,
  validateConfig,
  testConnection,
  health: () => readHealth("shopee"),
};

export { redact, ConnectorError };
