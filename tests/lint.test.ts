// Unit tests for the anti-slop linter — the guard that stops fake experience and hype.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintStory, hasBlockingIssue } from "@/lib/services/stories/lint";

test("blocks first-person usage claims outside REAL_EXPERIENCE", () => {
  const issues = lintStory("Aku sudah pakai stand ini seminggu.", { truthMode: "HYPOTHETICAL" });
  assert.ok(hasBlockingIssue(issues), "should block");
  assert.ok(issues.some((i) => i.code === "FAKE_EXPERIENCE"));
});

test("allows first-person usage claims in REAL_EXPERIENCE", () => {
  const issues = lintStory("Aku sudah pakai stand ini seminggu.", { truthMode: "REAL_EXPERIENCE" });
  assert.equal(hasBlockingIssue(issues), false);
});

test("blocks hype words", () => {
  const issues = lintStory("Produk ini wajib punya.", { truthMode: "OPINION" });
  assert.ok(issues.some((i) => i.code === "HYPE_CLAIM" && i.severity === "block"));
});

test("blocks fabricated social proof numbers", () => {
  const issues = lintStory("Sudah 10.000 terjual.", { truthMode: "PRODUCT_EXPLAINER" });
  assert.ok(issues.some((i) => i.code === "FABRICATED_PROOF"));
});

test("allows social proof when caller marks it source-backed", () => {
  const issues = lintStory("Sudah 10.000 terjual.", { truthMode: "PRODUCT_EXPLAINER", allowSocialProof: true });
  assert.ok(!issues.some((i) => i.code === "FABRICATED_PROOF"));
});

test("flags cliché opener as warn, not block", () => {
  const issues = lintStory("Jujurly, meja saya berantakan.", { truthMode: "HYPOTHETICAL" });
  const c = issues.find((i) => i.code === "CLICHE_OPENER");
  assert.ok(c);
  assert.equal(c.severity, "warn");
});

test("clean text produces no blocking issues", () => {
  const issues = lintStory("Meja saya sempit. HP tidak punya tempat tetap.\n\nAkhirnya saya beli stand kecil.", { truthMode: "HYPOTHETICAL" });
  assert.equal(hasBlockingIssue(issues), false);
});

test("detects monotone sentence rhythm", () => {
  const t = "Saya punya meja kerja yang kecil sekali sekarang ini. Saya juga punya banyak barang yang berserakan di sana. Saya mencoba menata semuanya dengan cara yang berbeda. Saya membeli beberapa tempat penyimpanan yang murah. Saya menyusun ulang semua barang dari awal lagi. Saya merasa hasilnya masih kurang memuaskan juga.";
  const issues = lintStory(t, { truthMode: "HYPOTHETICAL" });
  assert.ok(issues.some((i) => i.code === "MONOTONE_RHYTHM"));
});
