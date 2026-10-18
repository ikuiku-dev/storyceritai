// Kill switch and policy gating (PRD §5.7, Phase 9 — automation).
// The core promise: when automation is paused, nothing publishes — no exceptions.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { publishWithPolicy } from "@/lib/services/publishing/orchestrator";
import { evaluatePublishPolicy } from "@/lib/policies/publishing";

let postId: string;

before(async () => {
  await prisma.publishingPolicy.upsert({
    where: { id: "singleton" },
    update: { killSwitch: false, autoPublishEnabled: false, maxPostsPerDay: 2, minGapMinutes: 240, maxQueuedPosts: 3, requireFactCheck: true, requireValidLink: true },
    create: { id: "singleton", killSwitch: false, autoPublishEnabled: false },
  });

  const post = await prisma.publishedPost.create({
    data: {
      finalText: "Meja kerja saya sempit. Kabel berserakan setiap pagi.",
      status: "APPROVED",
      dedupeKey: `kill-${Date.now()}`,
      disclosureIncluded: true,
    },
  });
  postId = post.id;
});

test("kill switch blocks publishing before any policy check runs", async () => {
  await prisma.publishingPolicy.update({ where: { id: "singleton" }, data: { killSwitch: true } });

  const r = await publishWithPolicy(postId);
  assert.equal(r.ok, false);
  assert.equal(r.blocked, true);
  assert.match(r.reason ?? "", /PAUSE ALL AUTOMATION/);

  const after = await prisma.publishedPost.findUnique({ where: { id: postId } });
  assert.notEqual(after?.status, "PUBLISHED", "nothing may publish while paused");

  await prisma.publishingPolicy.update({ where: { id: "singleton" }, data: { killSwitch: false } });
});

test("with the kill switch off, policy still blocks an unconnected account", async () => {
  const r = await publishWithPolicy(postId);
  assert.equal(r.ok, false);
  assert.equal(r.blocked, true, "no Threads connection must block publishing");
});

test("the policy lists every blocker at once, not one at a time", async () => {
  const v = await evaluatePublishPolicy(postId);
  assert.equal(v.allowed, false);
  assert.ok(v.blockers.length >= 3, `expected several blockers, got ${v.blockers.length}: ${v.blockers.join(" | ")}`);
  const ids = v.checks.map((c) => c.id);
  for (const required of ["kill_switch", "fact_check", "disclosure", "guardrails", "daily_quota", "min_gap", "account"]) {
    assert.ok(ids.includes(required), `missing check: ${required}`);
  }
});

test("an unknown post id is handled, not crashed", async () => {
  const v = await evaluatePublishPolicy("does-not-exist");
  assert.equal(v.allowed, false);
  assert.match(v.blockers[0], /tidak ditemukan/i);
});

test("cleanup", async () => {
  await prisma.publishedPost.deleteMany({ where: { dedupeKey: { startsWith: "kill-" } } });
  assert.ok(true);
});
