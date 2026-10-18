// Regression tests for the guardrail bypass found during the full audit.
//
// Bug: approvePost() wrote APPROVED without re-checking policy, so a post whose text
// contained a fabricated experience + hype words reached the approval state. Guardrails
// must hold at approve time AND again immediately before publish.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL }) });

const BAD_TEXT = "Aku sudah pakai seminggu dan ini wajib punya banget!";
const created: string[] = [];

before(async () => {
  await prisma.userSettings.upsert({
    where: { id: "singleton" },
    update: { publishingMode: "MANUAL_APPROVAL", autoPublishEnabled: false },
    create: {
      id: "singleton", publishingMode: "MANUAL_APPROVAL", autoPublishEnabled: false,
      maxPostsPerDay: 3, minGapMinutes: 60, requireAffiliateLink: false,
      requireFactCheckPass: true, disclosureText: "affiliate", disclosureEnabled: true,
      aiContentLabelEnabled: false, timezone: "Asia/Jakarta",
    },
  });
});

async function makePost(text: string) {
  const p = await prisma.publishedPost.create({
    data: { finalText: text, status: "WAITING_APPROVAL", dedupeKey: `reg-${Date.now()}-${Math.random()}`, disclosureIncluded: true },
  });
  created.push(p.id);
  return p;
}

test("approvePost refuses a post whose text violates truth/hype guardrails", async () => {
  const post = await makePost(BAD_TEXT);
  const { approvePost } = await import("@/lib/services/publishing/service");

  await assert.rejects(
    () => approvePost(post.id),
    (e: Error & { code?: string }) => {
      assert.equal(e.code, "GUARDRAIL_BLOCKED", `expected GUARDRAIL_BLOCKED, got ${e.code}: ${e.message}`);
      return true;
    },
  );

  const after = await prisma.publishedPost.findUnique({ where: { id: post.id } });
  assert.notEqual(after?.status, "APPROVED", "post must NOT be approved");
  assert.equal(after?.status, "WAITING_APPROVAL", "status must be unchanged after a blocked approve");
});

test("approvePost refuses when fact-check has not run and settings require it", async () => {
  // Clean text that passes the text linter but has no fact-check.
  const post = await makePost("Meja kerja saya sempit. Kabel berserakan di dekat keyboard setiap pagi.");
  const { approvePost } = await import("@/lib/services/publishing/service");
  await assert.rejects(
    () => approvePost(post.id),
    (e: Error & { code?: string }) => {
      assert.equal(e.code, "GUARDRAIL_BLOCKED");
      assert.match(e.message, /[Ff]act-check/);
      return true;
    },
  );
});

test("a post cannot be its own duplicate blocker (ignorePostId works)", async () => {
  const { checkGuardrails } = await import("@/lib/services/publishing/service");
  const post = await makePost("Meja kerja saya sempit dan kabel berserakan setiap pagi tanpa henti.");
  // With ignorePostId the post must not match itself; without it, it would.
  const guard = await checkGuardrails({
    text: "Meja kerja saya sempit dan kabel berserakan setiap pagi tanpa henti.",
    truthMode: "HYPOTHETICAL",
    factCheckStatus: "PASSED",
    affiliateUrl: null,
    ignorePostId: post.id,
  });
  const dupBlock = guard.blocks.find((b) => /duplikat|duplicate/i.test(b));
  assert.equal(dupBlock, undefined, `post must not be blocked as its own duplicate: ${guard.blocks.join(" · ")}`);
});

test("cleanup", async () => {
  if (created.length) await prisma.publishedPost.deleteMany({ where: { id: { in: created } } });
  assert.ok(true);
});
