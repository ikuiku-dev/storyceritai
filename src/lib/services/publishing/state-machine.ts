// src/lib/services/publishing/state-machine.ts — explicit publishing states (PRD §4.4).
//
// The existing service already prevents double-publishing; what was missing is an explicit,
// enforced state graph. Transitions are validated here so an illegal move (e.g. PUBLISHING →
// DRAFT) fails loudly instead of silently corrupting the queue.
import "server-only";

export const PUBLISH_STATES = [
  "DRAFT", "VALIDATING", "APPROVED", "SCHEDULED",
  "CLAIMED", "PUBLISHING", "PUBLISHED",
  // alternative states
  "NEEDS_REVIEW", "BLOCKED", "FAILED_RETRYABLE", "FAILED_FINAL", "CANCELLED", "UNKNOWN_OUTCOME",
] as const;

export type PublishState = (typeof PUBLISH_STATES)[number];

/** Terminal states never transition again on their own. */
export const TERMINAL: PublishState[] = ["PUBLISHED", "FAILED_FINAL", "CANCELLED"];

/** States where a resend could create a duplicate. Never auto-retried. */
export const AMBIGUOUS: PublishState[] = ["UNKNOWN_OUTCOME"];

const ALLOWED: Record<PublishState, PublishState[]> = {
  DRAFT: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["APPROVED", "NEEDS_REVIEW", "BLOCKED", "FAILED_FINAL", "CANCELLED"],
  APPROVED: ["SCHEDULED", "CLAIMED", "NEEDS_REVIEW", "BLOCKED", "CANCELLED"],
  SCHEDULED: ["CLAIMED", "BLOCKED", "CANCELLED", "FAILED_FINAL"],
  CLAIMED: ["PUBLISHING", "FAILED_RETRYABLE", "CANCELLED"],
  PUBLISHING: ["PUBLISHED", "FAILED_RETRYABLE", "UNKNOWN_OUTCOME", "FAILED_FINAL"],
  PUBLISHED: [], // immutable
  NEEDS_REVIEW: ["VALIDATING", "APPROVED", "CANCELLED"],
  BLOCKED: ["VALIDATING", "CANCELLED"],
  FAILED_RETRYABLE: ["CLAIMED", "VALIDATING", "FAILED_FINAL", "CANCELLED"],
  FAILED_FINAL: [],
  CANCELLED: [],
  UNKNOWN_OUTCOME: ["PUBLISHED", "FAILED_RETRYABLE", "FAILED_FINAL"], // resolved by a human after checking the account
};

export function canTransition(from: PublishState, to: PublishState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: PublishState, to: PublishState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transisi status tidak sah: ${from} → ${to}`);
  }
}

/** Is an automatic retry permitted from this state? */
export function isAutoRetryable(state: PublishState): boolean {
  return state === "FAILED_RETRYABLE";
}

/** Human-readable explanation shown next to a blocked post. */
export function explainState(state: PublishState): string {
  switch (state) {
    case "DRAFT": return "Belum divalidasi.";
    case "VALIDATING": return "Sedang diperiksa kebijakan.";
    case "APPROVED": return "Disetujui, menunggu antrean.";
    case "SCHEDULED": return "Terjadwal pada waktu tertentu.";
    case "CLAIMED": return "Sedang diambil satu worker — mencegah proses ganda.";
    case "PUBLISHING": return "Permintaan sedang dikirim ke API.";
    case "PUBLISHED": return "Terbit dan terverifikasi oleh respons API.";
    case "NEEDS_REVIEW": return "Butuh keputusan manusia.";
    case "BLOCKED": return "Diblokir oleh aturan kebijakan.";
    case "FAILED_RETRYABLE": return "Gagal sementara — aman untuk dicoba ulang.";
    case "FAILED_FINAL": return "Gagal permanen — tidak akan dicoba ulang.";
    case "CANCELLED": return "Dibatalkan.";
    case "UNKNOWN_OUTCOME": return "Hasil tidak pasti: permintaan mungkin sudah terkirim. Periksa akun Threads sebelum mengulang.";
  }
}

/**
 * Map the legacy statuses used by the existing service onto the explicit state machine,
 * so old rows keep working without a destructive migration.
 */
export function fromLegacyStatus(status: string, failedReason?: string | null): PublishState {
  if (/UNKNOWN_AFTER_SEND/.test(failedReason ?? "")) return "UNKNOWN_OUTCOME";
  switch (status) {
    case "WAITING_APPROVAL": return "VALIDATING";
    case "APPROVED": return "APPROVED";
    case "SCHEDULED": return "SCHEDULED";
    case "PUBLISHED": return "PUBLISHED";
    case "CANCELLED": return "CANCELLED";
    case "FAILED": return "FAILED_RETRYABLE";
    default: return "DRAFT";
  }
}

export function toLegacyStatus(state: PublishState): string {
  switch (state) {
    case "PUBLISHED": return "PUBLISHED";
    case "APPROVED": case "SCHEDULED": case "CLAIMED": case "PUBLISHING": return "APPROVED";
    case "CANCELLED": return "CANCELLED";
    case "FAILED_RETRYABLE": case "FAILED_FINAL": return "FAILED";
    default: return "WAITING_APPROVAL";
  }
}
