// src/lib/policies/publishing.ts — the policy engine (PRD §5.4).
//
// Every check runs before a post may leave the system. The PRD is explicit: do not skip
// checks because auto-publish is enabled. So this module has no "fast path" — the same
// function gates manual publish and automation alike.
import "server-only";
import { prisma } from "@/lib/db";
import { checkGuardrails } from "@/lib/services/publishing/service";
import { getSettings } from "@/lib/db";

export type Severity = "critical" | "warning";

export interface PolicyCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: Severity;
  detail: string;
}

export interface PolicyResult {
  allowed: boolean;
  checks: PolicyCheck[];
  blockers: string[];
  warnings: string[];
}

export interface PolicyPolicy {
  maxPostsPerDay: number;
  minGapMinutes: number;
  maxQueuedPosts: number;
  requireFactCheck: boolean;
  requireValidLink: boolean;
  budgetLimitUsd: number | null;
  killSwitch: boolean;
  autoPublishEnabled: boolean;
}

export async function loadPolicy(): Promise<PolicyPolicy> {
  const row = await prisma.publishingPolicy.findUnique({ where: { id: "singleton" } });
  const s = await getSettings();
  if (!row) {
    // Conservative defaults from PRD §5.6 — deliberately stricter than the old settings.
    return {
      maxPostsPerDay: Math.min(s.maxPostsPerDay ?? 2, 2),
      minGapMinutes: Math.max(s.minGapMinutes ?? 240, 240),
      maxQueuedPosts: 3,
      requireFactCheck: true,
      requireValidLink: true,
      budgetLimitUsd: null,
      killSwitch: false,
      autoPublishEnabled: false,
    };
  }
  return {
    maxPostsPerDay: row.maxPostsPerDay,
    minGapMinutes: row.minGapMinutes,
    maxQueuedPosts: row.maxQueuedPosts,
    requireFactCheck: row.requireFactCheck,
    requireValidLink: row.requireValidLink,
    budgetLimitUsd: row.budgetLimitUsd,
    killSwitch: row.killSwitch,
    autoPublishEnabled: row.autoPublishEnabled,
  };
}

const DAY_MS = 86_400_000;

/**
 * Evaluate every gate. Returns the full list, not just the first failure, so the user sees
 * everything that is wrong at once instead of fixing one thing per attempt.
 */
export async function evaluatePublishPolicy(postId: string): Promise<PolicyResult> {
  const checks: PolicyCheck[] = [];
  const post = await prisma.publishedPost.findUnique({
    where: { id: postId },
    include: { draft: { select: { truthMode: true, factCheckStatus: true, text: true } } },
  });

  if (!post) {
    return {
      allowed: false,
      checks: [{ id: "exists", label: "Postingan ada", passed: false, severity: "critical", detail: "Tidak ditemukan." }],
      blockers: ["Postingan tidak ditemukan."],
      warnings: [],
    };
  }

  const policy = await loadPolicy();

  // ── Kill switch (highest priority) ──
  checks.push({
    id: "kill_switch", label: "Kill switch nonaktif", passed: !policy.killSwitch, severity: "critical",
    detail: policy.killSwitch ? "PAUSE ALL AUTOMATION aktif — tidak ada publikasi." : "Tidak aktif.",
  });

  // ── Fact-check ──
  const fc = post.draft?.factCheckStatus ?? "NOT_RUN";
  const fcOk = fc === "PASSED" || fc === "WARNINGS";
  checks.push({
    id: "fact_check", label: "Fact-check lulus", passed: fcOk, severity: policy.requireFactCheck ? "critical" : "warning",
    detail: fcOk ? `Status: ${fc}.` : `Status: ${fc}. Jalankan fact-check dulu.`,
  });

  // ── Affiliate link ──
  const hasLink = Boolean(post.affiliateUrl);
  checks.push({
    id: "affiliate_link", label: "Tautan afiliasi valid", passed: hasLink || !policy.requireValidLink,
    severity: policy.requireValidLink ? "critical" : "warning",
    detail: hasLink ? "Tautan terpasang." : "Belum ada tautan afiliasi untuk postingan ini.",
  });

  // ── Disclosure ──
  checks.push({
    id: "disclosure", label: "Disclosure afiliasi disertakan", passed: Boolean(post.disclosureIncluded), severity: "critical",
    detail: post.disclosureIncluded ? "Disclosure ada." : "Disclosure afiliasi wajib ada sebelum terbit.",
  });

  // ── Guardrails (truth mode, hype, duplicate) ──
  const guard = await checkGuardrails({
    text: post.finalText,
    truthMode: post.draft?.truthMode ?? "HYPOTHETICAL",
    factCheckStatus: fc,
    affiliateUrl: post.affiliateUrl,
    ignorePostId: postId,
  });
  checks.push({
    id: "guardrails", label: "Lolos guardrail kebenaran & klaim", passed: guard.ok, severity: "critical",
    detail: guard.ok ? "Tidak ada pelanggaran." : guard.blocks.join(" · "),
  });

  // ── Text length ──
  const len = Array.from(post.finalText).length;
  checks.push({
    id: "length", label: "Panjang teks ≤ 500 karakter", passed: len <= 500, severity: "critical",
    detail: `${len} karakter.`,
  });

  // ── Daily quota ──
  const todayCount = await prisma.publishedPost.count({
    where: { publishedAt: { gte: new Date(Date.now() - DAY_MS) }, status: "PUBLISHED" },
  });
  checks.push({
    id: "daily_quota", label: `Kuota harian (${policy.maxPostsPerDay}/hari)`,
    passed: todayCount < policy.maxPostsPerDay, severity: "critical",
    detail: `${todayCount} terbit dalam 24 jam terakhir.`,
  });

  // ── Minimum gap ──
  const last = await prisma.publishedPost.findFirst({
    where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" },
    select: { publishedAt: true },
  });
  const gapMin = last?.publishedAt ? (Date.now() - last.publishedAt.getTime()) / 60000 : Number.POSITIVE_INFINITY;
  checks.push({
    id: "min_gap", label: `Jarak minimum ${policy.minGapMinutes} menit`,
    passed: gapMin >= policy.minGapMinutes, severity: "critical",
    detail: Number.isFinite(gapMin) ? `${Math.round(gapMin)} menit sejak postingan terakhir.` : "Belum ada postingan sebelumnya.",
  });

  // ── Queue depth ──
  const queued = await prisma.publishedPost.count({ where: { status: { in: ["APPROVED", "SCHEDULED"] } } });
  checks.push({
    id: "queue_depth", label: `Antrean ≤ ${policy.maxQueuedPosts}`,
    passed: queued <= policy.maxQueuedPosts, severity: "warning",
    detail: `${queued} postingan menunggu.`,
  });

  // ── Budget ──
  if (policy.budgetLimitUsd != null) {
    const agg = await prisma.costRecord.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: new Date(Date.now() - DAY_MS) }, ok: true },
    });
    const spent = agg._sum.costUsd ?? 0;
    checks.push({
      id: "budget", label: `Budget harian ($${policy.budgetLimitUsd})`,
      passed: spent < policy.budgetLimitUsd, severity: "critical",
      detail: `Terpakai $${spent.toFixed(4)} dalam 24 jam.`,
    });
  }

  // ── Threads connection ──
  const conn = await prisma.integrationConnection.findFirst({ where: { provider: "threads" } });
  const connected = conn?.status === "CONNECTED" && Boolean(conn?.tokenCipher);
  checks.push({
    id: "account", label: "Akun Threads terhubung", passed: connected, severity: "critical",
    detail: connected ? `Terhubung sebagai ${conn?.accountName ?? conn?.accountId}.` : "Belum terhubung.",
  });

  const blockers = checks.filter((c) => !c.passed && c.severity === "critical").map((c) => `${c.label}: ${c.detail}`);
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning").map((c) => `${c.label}: ${c.detail}`);

  return { allowed: blockers.length === 0, checks, blockers, warnings };
}

/** Guard used before enabling auto-publish (PRD §5.5 requires explicit configuration). */
export async function canEnableAutoPublish(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  const conn = await prisma.integrationConnection.findFirst({ where: { provider: "threads" } });
  if (!conn || conn.status !== "CONNECTED" || !conn.tokenCipher) missing.push("Akun Threads belum terhubung.");

  const row = await prisma.publishingPolicy.findUnique({ where: { id: "singleton" } });
  if (!row) missing.push("Kebijakan publikasi belum disimpan.");
  else {
    if (row.maxPostsPerDay < 1) missing.push("Kuota harian belum diatur.");
    if (row.minGapMinutes < 60) missing.push("Jarak minimum minimal 60 menit.");
    if (!row.confirmedAt) missing.push("Konfirmasi eksplisit belum diberikan.");
    if (row.killSwitch) missing.push("Kill switch masih aktif.");
  }
  return { ok: missing.length === 0, missing };
}
