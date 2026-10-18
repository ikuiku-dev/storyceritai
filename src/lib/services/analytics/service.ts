// src/lib/services/analytics/service.ts — reads only real recorded data.
import "server-only";
import { prisma } from "@/lib/db";
import { summarize, compareVariants, minSamplesNeeded, wilson } from "./stats";

export async function overview() {
  const [posts, snaps, costs, settings] = await Promise.all([
    prisma.publishedPost.findMany({ select: { id: true, status: true, publishedAt: true, containerId: true } }),
    prisma.postMetricSnapshot.findMany({ select: { views: true, likes: true, replies: true, reposts: true, shares: true, capturedAt: true } }),
    prisma.costRecord.findMany({ select: { costUsd: true, inputTokens: true, outputTokens: true, ok: true, createdAt: true, task: true } }),
    prisma.userSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const published = posts.filter((p) => p.status === "PUBLISHED").length;
  const pricedCosts = costs.filter((c) => c.costUsd != null && c.ok);
  const totalCost = pricedCosts.length ? pricedCosts.reduce((a, c) => a + (c.costUsd ?? 0), 0) : null;

  const byTask = new Map<string, number>();
  for (const c of pricedCosts) byTask.set(c.task, (byTask.get(c.task) ?? 0) + (c.costUsd ?? 0));

  return {
    posts: { total: posts.length, published, draftQueue: posts.filter((p) => ["DRAFT", "WAITING_APPROVAL", "APPROVED", "SCHEDULED"].includes(p.status)).length },
    metrics: {
      snapshots: snaps.length,
      views: summarize(snaps.map((s) => s.views)),
      likes: summarize(snaps.map((s) => s.likes)),
      replies: summarize(snaps.map((s) => s.replies)),
    },
    cost: {
      totalUsd: totalCost,
      pricedCalls: pricedCosts.length,
      unpricedCalls: costs.filter((c) => c.ok && c.costUsd == null).length,
      failedCalls: costs.filter((c) => !c.ok).length,
      tokensIn: costs.reduce((a, c) => a + (c.inputTokens ?? 0), 0),
      tokensOut: costs.reduce((a, c) => a + (c.outputTokens ?? 0), 0),
      byTask: [...byTask.entries()].map(([task, usd]) => ({ task, usd })).sort((a, b) => b.usd - a.usd),
      dailyCap: settings?.dailyBudgetUsd ?? null,
      monthlyCap: settings?.monthlyBudgetUsd ?? null,
    },
  };
}

export async function analyzeExperiment(experimentId: string) {
  const exp = await prisma.storyExperiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: {
        include: {
          draft: { select: { title: true, text: true, truthMode: true, factCheckStatus: true } },
          posts: { include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } } },
        },
      },
    },
  });
  if (!exp) return null;

  const required = minSamplesNeeded();
  const rows = exp.variants.map((v) => {
    const snap = v.posts[0]?.metrics[0];
    return { label: v.label, successes: snap?.replies ?? null, total: snap?.views ?? null, snap, postId: v.posts[0]?.id ?? null };
  });

  const verdicts = compareVariants(rows.map((r) => ({ label: r.label, successes: r.successes, total: r.total })), required);

  const withCi = rows.map((r) => {
    const ci = r.total && r.total > 0 && r.successes != null ? wilson(r.successes, r.total) : null;
    return {
      ...r,
      rate: r.total && r.total > 0 && r.successes != null ? r.successes / r.total : null,
      ci,
      verdict: verdicts.find((v) => v.label === r.label)!,
    };
  });

  // Honest conclusion text: determined by the data, not written by AI.
  let conclusion: string;
  const leader = withCi.find((r) => r.verdict.verdict === "CLEAR_LEADER");
  if (rows.every((r) => r.total == null)) {
    conclusion = "Belum ada metrik untuk varian mana pun. Eksperimen tidak bisa disimpulkan.";
  } else if (withCi.some((r) => (r.total ?? 0) < required)) {
    conclusion = `Data belum cukup. Butuh sekitar ${required} views per varian; sample terkecil saat ini ${Math.min(...withCi.map((r) => r.total ?? 0))}. Menyimpulkan pemenang sekarang akan menyesatkan.`;
  } else if (leader) {
    conclusion = `Varian ${leader.label} unggul secara interval kepercayaan 95% pada rasio balasan/views. Ini bukti moderat, bukan kepastian.`;
  } else {
    conclusion = "Perbedaan antar varian belum bisa dibedakan dari kebetulan pada ukuran sampel ini.";
  }

  return { experiment: { id: exp.id, name: exp.name, hypothesis: exp.hypothesis, status: exp.status, observationDays: exp.observationDays, startedAt: exp.startedAt }, required, variants: withCi, conclusion };
}
