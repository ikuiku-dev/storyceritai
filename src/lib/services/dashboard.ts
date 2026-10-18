// src/lib/services/dashboard.ts — aggregates ONLY real recorded data. Missing data → null, never 0.
import "server-only";
import { prisma } from "@/lib/db";
import { spentUsd } from "@/lib/services/ai/runtime";

export interface OverviewData {
  counts: {
    drafts: number;
    waitingApproval: number;
    scheduled: number;
    published: number;
    failed: number;
    experimentsActive: number;
    sources: number;
    sourcesStale: number;
    products: number;
    storiesTotal: number;
  };
  providers: { total: number; active: number; lastError: string | null };
  threads: { status: string; accountName: string | null; expiresAt: Date | null } | null;
  shopee: { status: string } | null;
  cost: { today: number | null; month: number | null; dailyCap: number | null; monthlyCap: number | null; pricedCalls: number; unpricedCalls: number };
  metrics: { views: number | null; replies: number | null; likes: number | null; postsMeasured: number };
  warnings: string[];
}

export async function getOverview(): Promise<OverviewData> {
  const now = new Date();
  const [drafts, waitingApproval, scheduled, published, failed, experimentsActive, sources, sourcesStale, products, storiesTotal] = await Promise.all([
    prisma.storyDraft.count({ where: { status: "DRAFT" } }),
    prisma.storyDraft.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.publishedPost.count({ where: { status: { in: ["SCHEDULED", "APPROVED"] } } }),
    prisma.publishedPost.count({ where: { status: "PUBLISHED" } }),
    prisma.publishedPost.count({ where: { status: "FAILED" } }),
    prisma.storyExperiment.count({ where: { status: { in: ["RUNNING", "AWAITING_DATA"] } } }),
    prisma.source.count(),
    prisma.source.count({ where: { staleAfter: { lt: now } } }),
    prisma.product.count(),
    prisma.storyDraft.count(),
  ]);

  const providers = await prisma.aIProvider.findMany({ select: { active: true, lastTestError: true, lastTestOk: true } });
  const threads = await prisma.integrationConnection.findUnique({ where: { provider: "threads" } });
  const shopee = await prisma.integrationConnection.findUnique({ where: { provider: "shopee_open_api" } });
  const settings = await prisma.userSettings.findUnique({ where: { id: "singleton" } });

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [today, month, priced, unpriced] = await Promise.all([
    spentUsd(dayStart),
    spentUsd(monthStart),
    prisma.costRecord.count({ where: { costUsd: { not: null }, ok: true } }),
    prisma.costRecord.count({ where: { costUsd: null, ok: true } }),
  ]);

  // Metrics are only "measured" if a snapshot exists. Otherwise null (unknown), not 0.
  const snaps = await prisma.postMetricSnapshot.findMany({ select: { views: true, replies: true, likes: true } });
  const sum = (k: "views" | "replies" | "likes") => {
    const vals = snaps.map((s) => s[k]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const warnings: string[] = [];
  if (!providers.some((p) => p.active)) warnings.push("Belum ada provider AI aktif. Story Studio tidak bisa membuat cerita.");
  if (providers.some((p) => p.active && p.lastTestOk === false)) warnings.push("Ada provider AI yang gagal pada tes koneksi terakhir.");
  if (threads?.status !== "CONNECTED") warnings.push("Threads belum terhubung — publikasi otomatis tidak akan berjalan.");
  if (threads?.status === "CONNECTED" && threads.tokenExpiresAt && threads.tokenExpiresAt.getTime() - now.getTime() < 7 * 864e5) {
    warnings.push("Token Threads akan kedaluwarsa dalam <7 hari. Refresh sekarang.");
  }
  if (sourcesStale > 0) warnings.push(`${sourcesStale} sumber sudah kedaluwarsa dan sebaiknya diverifikasi ulang.`);
  if (unpriced > 0) warnings.push(`${unpriced} panggilan AI tanpa harga model — estimasi biaya tidak lengkap.`);
  if (settings?.publishingMode === "AUTO_PUBLISH" && !settings.autoPublishEnabled) warnings.push("Mode AUTO_PUBLISH dipilih tetapi auto-publish dimatikan (ini perilaku aman).");

  return {
    counts: { drafts, waitingApproval, scheduled, published, failed, experimentsActive, sources, sourcesStale, products, storiesTotal },
    providers: { total: providers.length, active: providers.filter((p) => p.active).length, lastError: providers.find((p) => p.lastTestOk === false)?.lastTestError ?? null },
    threads: threads ? { status: threads.status, accountName: threads.accountName, expiresAt: threads.tokenExpiresAt } : null,
    shopee: shopee ? { status: shopee.status } : null,
    cost: { today, month, dailyCap: settings?.dailyBudgetUsd ?? null, monthlyCap: settings?.monthlyBudgetUsd ?? null, pricedCalls: priced, unpricedCalls: unpriced },
    metrics: { views: sum("views"), replies: sum("replies"), likes: sum("likes"), postsMeasured: snaps.length },
    warnings,
  };
}
