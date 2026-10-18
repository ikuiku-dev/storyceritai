// Publishing state machine (PRD §4.4) — illegal transitions must fail loudly.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition, assertTransition, isAutoRetryable, fromLegacyStatus, toLegacyStatus,
  TERMINAL, AMBIGUOUS, type PublishState,
} from "@/lib/services/publishing/state-machine";

test("the happy path is fully connected", () => {
  const path: PublishState[] = ["DRAFT", "VALIDATING", "APPROVED", "SCHEDULED", "CLAIMED", "PUBLISHING", "PUBLISHED"];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]} must be allowed`);
  }
});

test("PUBLISHED is immutable", () => {
  for (const to of ["PUBLISHING", "APPROVED", "DRAFT", "FAILED_RETRYABLE"] as PublishState[]) {
    assert.equal(canTransition("PUBLISHED", to), false, `PUBLISHED → ${to} must be refused`);
  }
});

test("an illegal jump throws instead of corrupting state", () => {
  assert.throws(() => assertTransition("PUBLISHING", "DRAFT"), /tidak sah/);
  assert.throws(() => assertTransition("DRAFT", "PUBLISHED"), /tidak sah/);
});

test("only FAILED_RETRYABLE is auto-retryable", () => {
  assert.equal(isAutoRetryable("FAILED_RETRYABLE"), true);
  for (const s of ["FAILED_FINAL", "UNKNOWN_OUTCOME", "PUBLISHED", "CANCELLED"] as PublishState[]) {
    assert.equal(isAutoRetryable(s), false, `${s} must not be auto-retried`);
  }
});

test("UNKNOWN_OUTCOME cannot go back to PUBLISHING silently", () => {
  // The whole point: a resend could duplicate. It may only be resolved, not retried blindly.
  assert.equal(canTransition("UNKNOWN_OUTCOME", "PUBLISHING"), false);
  assert.equal(canTransition("UNKNOWN_OUTCOME", "PUBLISHED"), true);
});

test("terminal states are truly terminal", () => {
  for (const t of TERMINAL) {
    for (const to of ["DRAFT", "PUBLISHING", "APPROVED"] as PublishState[]) {
      assert.equal(canTransition(t, to), false, `${t} → ${to} must be refused`);
    }
  }
});

test("UNKNOWN_OUTCOME is flagged ambiguous", () => {
  assert.ok(AMBIGUOUS.includes("UNKNOWN_OUTCOME"));
});

test("legacy UNKNOWN_AFTER_SEND maps to UNKNOWN_OUTCOME", () => {
  assert.equal(fromLegacyStatus("FAILED", "UNKNOWN_AFTER_SEND: timeout"), "UNKNOWN_OUTCOME");
});

test("legacy statuses round-trip without losing meaning", () => {
  assert.equal(fromLegacyStatus("WAITING_APPROVAL"), "VALIDATING");
  assert.equal(fromLegacyStatus("APPROVED"), "APPROVED");
  assert.equal(fromLegacyStatus("PUBLISHED"), "PUBLISHED");
  assert.equal(toLegacyStatus("PUBLISHED"), "PUBLISHED");
  assert.equal(toLegacyStatus("UNKNOWN_OUTCOME"), "WAITING_APPROVAL", "ambiguous must not look published");
});

// Regression: policy can reject a post AFTER approval (settings tightened, link went stale,
// account disconnected). The state machine used to forbid APPROVED → BLOCKED, so the
// orchestrator threw instead of blocking cleanly.
test("an approved post can still be blocked by policy later", () => {
  assert.equal(canTransition("APPROVED", "BLOCKED"), true);
  assert.doesNotThrow(() => assertTransition("APPROVED", "BLOCKED"));
});

test("a scheduled post can be blocked before it is claimed", () => {
  assert.equal(canTransition("SCHEDULED", "BLOCKED"), true);
});
