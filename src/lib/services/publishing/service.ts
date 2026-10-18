// src/lib/services/publishing/service.ts — publish pipeline with idempotency + guardrails.
//
// Duplicate-prevention contract:
//  1. A PublishedPost row is created with a UNIQUE dedupeKey BEFORE any API call.
//  2. The Threads container id is persisted immediately after creation.
//  3. publishContainer() is only called when containerId exists AND publishedAt is null.
//  4. If a request times out after threads_publish was sent, we mark the row UNKNOWN_AFTER_SEND
//     and require the user to confirm manually instead of blindly retrying.
import "server-only";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { getSettings } from "@/lib/db";
import { lintStory, hasBlockingIssue } from "@/lib/services/stories/lint";
import {
  ThreadsError, createTextContainer, publishContainer, flattenInsights, getPostInsights,
} from "./threads";
import type { ThreadsConnection } from "./connection";

export function buildDedupeKey(text: string, affiliateUrl: string | null) {
  return sha256(`${text.trim()}||${affiliateUrl ?? ""}`);
}

export function normalizeForDuplicateCheck(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

export interface GuardrailResult { ok: boolean; blocks: string[]; warnings: string[] }

/** Pre-flight checks. Runs on the server every time; the UI copy is not the enforcement. */
export async function checkGuardrails(input: {
  text: string;
  truthMode: string;
  factCheckStatus: string;
  affiliateUrl: string | null;
  /** Exclude this post from the duplicate scan (a post is not a duplicate of itself). */
  ignorePostId?: string;
}): Promise<GuardrailResult> {
  const settings = await getSettings();
  const blocks: string[] = [];
  const warnings: string[] = [];

  if (!input.text.trim()) blocks.push("Teks kosong.");
  if (input.factCheckStatus === "FAILED") blocks.push("Fact-check gagal — perbaiki klaim dulu.");
  if (settings.requireFactCheckPass && !["PASSED", "WARNINGS"].includes(input.factCheckStatus)) {
    blocks.push("Fact-check belum dijalankan.");
  }
  if (settings.requireAffiliateLink && !input.affiliateUrl) blocks.push("Tautan affiliate wajib tetapi belum ada.");

  const lint = lintStory(input.text, { truthMode: input.truthMode });
  if (hasBlockingIssue(lint)) {
    for (const i of lint.filter((x) => x.severity === "block")) blocks.push(i.message);
  }
  for (const i of lint.filter((x) => x.severity === "warn")) warnings.push(i.message);

  // Exact duplicate within the last 30 days (normalized) — separate from dedupeKey.
  const norm = normalizeForDuplicateCheck(input.text);
  const recent = await prisma.publishedPost.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 30 * 864e5) },
      ...(input.ignorePostId ? { id: { not: input.ignorePostId } } : {}),
    },
    select: { id: true, finalText: true },
  });
  if (recent.some((p) => normalizeForDuplicateCheck(p.finalText) === norm)) {
    blocks.push("Postingan dengan teks yang sama sudah ada dalam 30 hari terakhir.");
  }

  return { ok: blocks.length === 0, blocks, warnings };
}

/** Create (or reuse) the post row. Idempotent by dedupeKey. */
export async function queuePost(input: {
  draftId?: string | null;
  finalText: string;
  affiliateUrl: string | null;
  disclosureIncluded: boolean;
  scheduledAt?: Date | null;
}) {
  const key = buildDedupeKey(input.finalText, input.affiliateUrl);
  const existing = await prisma.publishedPost.findUnique({ where: { dedupeKey: key } });
  if (existing) return { post: existing, created: false };

  const post = await prisma.publishedPost.create({
    data: {
      draftId: input.draftId ?? null,
      finalText: input.finalText,
      affiliateUrl: input.affiliateUrl,
      disclosureIncluded: input.disclosureIncluded,
      dedupeKey: key,
      status: "WAITING_APPROVAL",
      scheduledAt: input.scheduledAt ?? null,
    },
  });
  await audit({ action: "post.queued", summary: `Postingan disiapkan (${post.status})`, entityType: "PublishedPost", entityId: post.id });
  return { post, created: true };
}

export async function approvePost(postId: string) {
  const post = await prisma.publishedPost.findUnique({
    where: { id: postId },
    include: { draft: { select: { truthMode: true, factCheckStatus: true } } },
  });
  if (!post) throw new ThreadsError("Postingan tidak ditemukan", 404, "NOT_FOUND");
  if (post.status === "PUBLISHED") throw new ThreadsError("Sudah terbit.", 409, "ALREADY_PUBLISHED");
  if (post.status === "CANCELLED") throw new ThreadsError("Postingan dibatalkan.", 409, "CANCELLED");

  // Guardrails were checked at prepare time, but the draft may have been edited, the
  // settings may have changed, or the row may predate a rule. Re-check at the moment of
  // approval — this is the gate that actually matters.
  const guard = await checkGuardrails({
    text: post.finalText,
    truthMode: post.draft?.truthMode ?? "HYPOTHETICAL",
    factCheckStatus: post.draft?.factCheckStatus ?? "NOT_RUN",
    affiliateUrl: post.affiliateUrl,
    ignorePostId: postId, // a post is not its own duplicate
  });
  if (!guard.ok) {
    throw new ThreadsError(
      `Tidak bisa disetujui: ${guard.blocks.join(" · ")}`,
      409,
      "GUARDRAIL_BLOCKED",
    );
  }

  const updated = await prisma.publishedPost.update({
    where: { id: postId },
    data: { status: "APPROVED", approvedAt: new Date(), failedReason: null },
  });
  await audit({ action: "post.approved", summary: `Postingan disetujui`, entityType: "PublishedPost", entityId: postId });
  return updated;
}

export async function schedulePost(postId: string, when: Date) {
  if (when.getTime() < Date.now() - 60_000) throw new ThreadsError("Jadwal harus di masa depan.", 422, "BAD_SCHEDULE");
  return prisma.publishedPost.update({ where: { id: postId }, data: { status: "SCHEDULED", scheduledAt: when } });
}

/** Enforce max posts/day and minimum gap. Returns blocks. */
export async function rateLimitCheck(settings: { maxPostsPerDay: number; minGapMinutes: number }) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.publishedPost.count({
    where: { status: "PUBLISHED", publishedAt: { gte: dayStart } },
  });
  if (todayCount >= settings.maxPostsPerDay) {
    return { ok: false, reason: `Batas ${settings.maxPostsPerDay} postingan/hari tercapai (${todayCount}).` };
  }
  const last = await prisma.publishedPost.findFirst({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
  });
  if (last?.publishedAt) {
    const gapMin = (Date.now() - last.publishedAt.getTime()) / 60000;
    if (gapMin < settings.minGapMinutes) {
      return { ok: false, reason: `Jarak minimal ${settings.minGapMinutes} menit belum terlewati (baru ${Math.round(gapMin)} menit).` };
    }
  }
  return { ok: true as const, reason: "" };
}

/**
 * Publish a post to Threads. Safe to call twice: the second call is a no-op if already published.
 */
export async function publishPost(postId: string, conn: ThreadsConnection) {
  const post = await prisma.publishedPost.findUnique({ where: { id: postId } });
  if (!post) throw new ThreadsError("Postingan tidak ditemukan", 404, "NOT_FOUND");

  // ── Idempotency guard #1: already published ──
  if (post.publishedAt || post.status === "PUBLISHED") {
    return { ok: true as const, alreadyPublished: true, post };
  }
  if (!["APPROVED", "SCHEDULED", "FAILED"].includes(post.status)) {
    throw new ThreadsError(`Status ${post.status} tidak bisa dipublikasikan. Setujui dulu.`, 409, "NOT_APPROVED");
  }
  // ── Idempotency guard #2: previous attempt may have gone through ──
  if (post.status === "FAILED" && post.containerId && post.attempts > 0 && /UNKNOWN_AFTER_SEND/.test(post.failedReason ?? "")) {
    throw new ThreadsError(
      "Percobaan sebelumnya mungkin sudah terkirim. Periksa akun Threads Anda dulu, lalu tandai manual — tidak diulang otomatis untuk mencegah posting ganda.",
      409, "UNCERTAIN_STATE"
    );
  }

  const settings = await getSettings();
  const rl = await rateLimitCheck(settings);
  if (!rl.ok) {
    await prisma.publishedPost.update({ where: { id: postId }, data: { status: "FAILED", failedReason: rl.reason } });
    throw new ThreadsError(rl.reason, 429, "RATE_LIMITED");
  }

  // Re-run guardrails immediately before publishing. A post can reach FAILED for an
  // unrelated reason (network, rate limit) while its text still violates policy, and
  // settings may have tightened since it was approved. Approving is not the last word.
  const postWithDraft = await prisma.publishedPost.findUnique({
    where: { id: postId },
    include: { draft: { select: { truthMode: true, factCheckStatus: true } } },
  });
  const guard = await checkGuardrails({
    text: post.finalText,
    truthMode: postWithDraft?.draft?.truthMode ?? "HYPOTHETICAL",
    factCheckStatus: postWithDraft?.draft?.factCheckStatus ?? "NOT_RUN",
    affiliateUrl: post.affiliateUrl,
    ignorePostId: postId,
  });
  if (!guard.ok) {
    await prisma.publishedPost.update({
      where: { id: postId },
      data: { status: "FAILED", failedReason: `GUARDRAIL_BLOCKED: ${guard.blocks.join(" · ")}`.slice(0, 500) },
    });
    throw new ThreadsError(`Publikasi diblokir: ${guard.blocks.join(" · ")}`, 409, "GUARDRAIL_BLOCKED");
  }

  try {
    let containerId = post.containerId;
    // Step 1 — create container only if we don't already have one.
    if (!containerId) {
      const c = await createTextContainer(conn.token, conn.userId, post.finalText);
      containerId = String(c.id);
      // Persist immediately: if publishing fails later, we resume from this container.
      await prisma.publishedPost.update({ where: { id: postId }, data: { containerId, status: "PUBLISHING", attempts: { increment: 1 } } });
      // Meta recommends ~30s processing wait for media; text is faster but not instant.
      await new Promise((r) => setTimeout(r, 3_000));
    } else {
      await prisma.publishedPost.update({ where: { id: postId }, data: { status: "PUBLISHING", attempts: { increment: 1 } } });
    }

    // Step 2 — publish.
    let result: Record<string, unknown>;
    try {
      result = await publishContainer(conn.token, conn.userId, containerId);
    } catch (e) {
      const err = e as ThreadsError;
      if (err.code === "TIMEOUT") {
        // We do not know whether it landed. Never auto-retry.
        await prisma.publishedPost.update({
          where: { id: postId },
          data: { status: "FAILED", failedReason: `UNKNOWN_AFTER_SEND: timeout saat publish, container ${containerId}. Periksa akun sebelum retry.` },
        });
        throw new ThreadsError("Timeout setelah publish dikirim — status tidak pasti. Periksa akun Threads Anda.", 504, "UNCERTAIN_STATE");
      }
      throw err;
    }

    const remoteId = String(result.id);
    const updated = await prisma.publishedPost.update({
      where: { id: postId },
      data: { status: "PUBLISHED", remotePostId: remoteId, publishedAt: new Date(), failedReason: null },
    });
    await audit({ action: "post.published", summary: `Postingan terbit ke Threads (${remoteId})`, entityType: "PublishedPost", entityId: postId });
    return { ok: true as const, alreadyPublished: false, post: updated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!(e instanceof ThreadsError && e.code === "UNCERTAIN_STATE")) {
      await prisma.publishedPost.update({ where: { id: postId }, data: { status: "FAILED", failedReason: msg.slice(0, 500) } }).catch(() => {});
    }
    log.error("publish.failed", { postId, error: msg });
    throw e;
  }
}

/** Fetch insights for a published post and store a snapshot. */
export async function captureMetrics(postId: string, conn: ThreadsConnection) {
  const post = await prisma.publishedPost.findUnique({ where: { id: postId } });
  if (!post?.remotePostId) throw new ThreadsError("Postingan belum punya ID Threads.", 400, "NOT_PUBLISHED");
  const raw = await getPostInsights(conn.token, post.remotePostId);
  const m = flattenInsights(raw);
  const hasAny = ["views", "likes", "replies", "reposts", "quotes", "shares"].some((k) => m[k] != null);
  if (!hasAny) throw new ThreadsError("Threads tidak mengembalikan metrik apa pun untuk post ini.", 502, "NO_METRICS");

  return prisma.postMetricSnapshot.create({
    data: {
      postId,
      views: m.views ?? null, likes: m.likes ?? null, replies: m.replies ?? null,
      reposts: m.reposts ?? null, quotes: m.quotes ?? null, shares: m.shares ?? null,
      source: "THREADS_API",
    },
  });
}
