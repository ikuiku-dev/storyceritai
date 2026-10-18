// Publishing guardrails + duplicate-prevention. These run WITHOUT network calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDedupeKey, normalizeForDuplicateCheck } from "@/lib/services/publishing/service";
import { flattenInsights } from "@/lib/services/publishing/threads";
import { threadsLength } from "@/lib/format";

test("dedupeKey is stable for identical content", () => {
  assert.equal(buildDedupeKey("halo dunia", "https://shope.ee/x"), buildDedupeKey("halo dunia", "https://shope.ee/x"));
});

test("dedupeKey differs when only the affiliate link changes", () => {
  assert.notEqual(buildDedupeKey("halo dunia", "https://shope.ee/x"), buildDedupeKey("halo dunia", "https://shope.ee/y"));
});

test("dedupeKey differs for different text", () => {
  assert.notEqual(buildDedupeKey("halo dunia", null), buildDedupeKey("halo bumi", null));
});

test("normalizeForDuplicateCheck ignores punctuation, case and whitespace", () => {
  assert.equal(normalizeForDuplicateCheck("Halo,   Dunia!"), normalizeForDuplicateCheck("halo dunia"));
});

test("normalizeForDuplicateCheck still separates different sentences", () => {
  assert.notEqual(normalizeForDuplicateCheck("halo dunia"), normalizeForDuplicateCheck("halo semesta"));
});

test("flattenInsights parses Meta's values[] shape", () => {
  const raw = { data: [{ name: "views", values: [{ value: 120 }] }, { name: "likes", value: 8 }] };
  const m = flattenInsights(raw);
  assert.equal(m.views, 120);
  assert.equal(m.likes, 8);
});

test("flattenInsights returns null for missing metrics, not zero", () => {
  const m = flattenInsights({ data: [{ name: "views", values: [{ value: 5 }] }] });
  assert.equal(m.likes, undefined);
  assert.notEqual(m.likes, 0 as unknown);
});

test("threadsLength counts emoji by UTF-8 bytes", () => {
  // Base characters count normally; a multi-byte emoji counts as its byte length.
  assert.equal(threadsLength("abc"), 3);
  assert.ok(threadsLength("🔥") > 1, "emoji should count as multiple units");
});

test("500-char limit boundary is measured with threadsLength", () => {
  const text = "a".repeat(500);
  assert.equal(threadsLength(text), 500);
  assert.ok(threadsLength(text + "b") > 500);
});
