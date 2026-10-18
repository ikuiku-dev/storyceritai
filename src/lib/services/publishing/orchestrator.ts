// src/lib/services/publishing/orchestrator.ts — the gated path automation must use.
//
// The existing publishPost() protects against duplicates. This adds the policy gate in
// front of it so that nothing — manual or automated — can skip the checks in PRD §5.4.
import "server-only";
import { prisma } from "@/lib/db";
import { evaluatePublishPolicy, loadPolicy } from "@/lib/policies/publishing";
import { publishPost } from "./service";
import { getConnection } from "./connection";
import { fromLegacyStatus, assertTransition, type PublishState } from "./state-machine";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { ThreadsError } from "./threads";

export interface GatedPublishResult {
  ok: boolean;
  blocked?: boolean;
  reason?: string;
  blockers?: string[];
  state?: PublishState;
  remoteId?: string;
}

/** Persist the explicit state alongside the legacy status column. */
async function setState(postId: string, state: PublishState, errorClass?: string) {
  const post = await prisma.publishedPost.findUnique({ where: { id: postId }, select: { status: true, failedReason: true } });
  if (post) {
    const current = fromLegacyStatus(post.status, post.failedReason);
    assertTransition(current, state); // throws on an illegal move — never silently corrupt
  }
  const legacy = state === "PUBLISHED" ? "PUBLISHED"
    : state === "CANCELLED" ? "CANCELLED"
    : state === "FAILED_RETRYABLE" || state === "FAILED_FINAL" ? "FAILED"
    : ["APPROVED", "SCHEDULED", "CLAIMED", "PUBLISHING"].includes(state) ? "APPROVED"
    : "WAITING_APPROVAL";

  await prisma.publishedPost.update({
    where: { id: postId },
    data: { status: legacy, ...(errorClass ? { failedReason: errorClass } : {}) },
  });
  await prisma.publishingJob.create({ data: { postId, state, errorClass: errorClass ?? null } }).catch(() => {});
}

/**
 * Publish with every gate applied. Returns `blocked` instead of throwing when policy
 * refuses — a refusal is a normal outcome, not an error.
 */
export async function publishWithPolicy(postId: string): Promise<GatedPublishResult> {
  const policy = await loadPolicy();

  // ── Kill switch is checked before anything else touches the network ──
  if (policy.killSwitch) {
    await audit({
      action: "publishing.blocked.kill_switch",
      summary: "Publikasi diblokir: PAUSE ALL AUTOMATION aktif",
      entityType: "PublishedPost", entityId: postId,
    });
    return { ok: false, blocked: true, reason: "PAUSE ALL AUTOMATION aktif — tidak ada publikasi baru.", state: "BLOCKED" };
  }

  const verdict = await evaluatePublishPolicy(postId);
  if (!verdict.allowed) {
    await setState(postId, "BLOCKED", `POLICY: ${verdict.blockers.join(" · ")}`.slice(0, 500));
    await audit({
      action: "publishing.blocked.policy",
      summary: `Publikasi diblokir oleh kebijakan: ${verdict.blockers.length} hambatan`,
      entityType: "PublishedPost", entityId: postId,
    });
    return { ok: false, blocked: true, reason: "Kebijakan publikasi menolak.", blockers: verdict.blockers, state: "BLOCKED" };
  }

  const conn = await getConnection();
  if (!conn) {
    return { ok: false, blocked: true, reason: "Akun Threads belum terhubung.", state: "BLOCKED" };
  }

  // ── Claim the post so two workers cannot publish it at once ──
  const claimed = await prisma.publishedPost.updateMany({
    where: { id: postId, status: { in: ["APPROVED", "SCHEDULED", "FAILED"] } },
    data: { status: "APPROVED", failedReason: null },
  });
  if (claimed.count === 0) {
    return { ok: false, blocked: true, reason: "Postingan sedang diproses worker lain atau sudah terbit." };
  }
  await setState(postId, "CLAIMED");

  try {
    await setState(postId, "PUBLISHING");
    const res = await publishPost(postId, conn);
    const remoteId = (res as { post?: { remotePostId?: string | null } }).post?.remotePostId ?? undefined;
    await setState(postId, "PUBLISHED");
    log.info("publishing.gated.ok", { postId, remoteId });
    return { ok: true, state: "PUBLISHED", remoteId };
  } catch (e) {
    const msg = (e as Error).message;
    // Ambiguity is never auto-retried: a resend could duplicate a real post.
    const ambiguous = /UNKNOWN_AFTER_SEND|UNCERTAIN_STATE/.test(msg);
    const state: PublishState = ambiguous ? "UNKNOWN_OUTCOME" : "FAILED_RETRYABLE";
    await setState(postId, state, msg.slice(0, 500));
    if (e instanceof ThreadsError && e.status === 409) {
      return { ok: false, blocked: true, reason: msg, state };
    }
    return { ok: false, reason: msg, state };
  }
}

/** Resume automation only after integrations are actually healthy (PRD §5.7). */
export async function resumeAutomation(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  const conn = await getConnection();
  if (!conn) missing.push("Akun Threads belum terhubung.");

  const row = await prisma.publishingPolicy.findUnique({ where: { id: "singleton" } });
  if (!row?.confirmedAt) missing.push("Auto-publish belum pernah dikonfirmasi.");

  if (missing.length) return { ok: false, missing };

  await prisma.publishingPolicy.update({ where: { id: "singleton" }, data: { killSwitch: false } });
  await audit({ action: "automation.resumed", summary: "Automation dilanjutkan setelah pemeriksaan integrasi", entityType: "PublishingPolicy", entityId: "singleton" });
  return { ok: true, missing: [] };
}
