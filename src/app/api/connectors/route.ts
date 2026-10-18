import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { readHealth } from "@/lib/connectors/base";
import { capabilities as shopeeCaps, validateConfig as shopeeValidate, resolveMode } from "@/lib/connectors/shopee";

export const GET = handler(async () => {
  const threadConn = await prisma.integrationConnection.findFirst({ where: { provider: "threads" } });
  const shopeeMode = await resolveMode();
  const shopeeCfg = {
    appId: process.env.SHOPEE_APP_ID,
    appSecret: process.env.SHOPEE_APP_SECRET,
    apiAccessConfirmed: process.env.SHOPEE_API_CONFIRMED === "true",
  };
  const rows = await prisma.integrationHealth.findMany();

  const connectors = [
    {
      id: "threads",
      name: "Threads (Meta)",
      kind: "publishing",
      accessMethod: "oauth",
      status: threadConn?.status ?? "NOT_CONFIGURED",
      configured: Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET),
      account: threadConn?.accountName ?? null,
      tokenExpiresAt: threadConn?.tokenExpiresAt?.toISOString() ?? null,
      health: rows.find((r) => r.connectorId === "threads") ?? null,
      note: "OAuth resmi Meta. Kredensial hanya di server (.env).",
    },
    {
      id: "shopee",
      name: "Shopee Affiliate",
      kind: "affiliate",
      accessMethod: "official_api",
      status: shopeeMode.mode === "OFFICIAL_API" ? "CONNECTED" : shopeeMode.mode === "DISABLED" ? "ERROR" : "LIMITED_ACCESS",
      configured: shopeeValidate(shopeeCfg).ok,
      mode: shopeeMode.mode,
      modeReason: shopeeMode.reason,
      capabilities: shopeeCaps(shopeeCfg),
      health: rows.find((r) => r.connectorId === "shopee") ?? null,
    },
    {
      id: "sources",
      name: "Source Collector",
      kind: "sources",
      accessMethod: "rss",
      status: "LIMITED_ACCESS",
      configured: true,
      health: rows.find((r) => r.connectorId === "sources") ?? null,
      note: "RSS, API publik, dan impor pengguna. Halaman biasa hanya jika robots.txt mengizinkan.",
    },
    {
      id: "ai",
      name: "AI Provider",
      kind: "ai",
      accessMethod: "official_api",
      status: (await prisma.aIProvider.count()) > 0 ? "CONNECTED" : "NOT_CONFIGURED",
      configured: true,
      health: null,
    },
  ];

  const healths = await Promise.all(["threads", "shopee", "sources"].map(readHealth));
  return ok({ connectors, healths });
});
