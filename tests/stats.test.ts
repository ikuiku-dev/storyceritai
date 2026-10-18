// Analytics honesty: small samples must never produce a declared winner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, minSamplesNeeded, compareVariants, wilson } from "@/lib/services/analytics/stats";

test("summarize ignores nulls and returns nulls when empty (never 0)", () => {
  const s = summarize([null, undefined]);
  assert.equal(s.n, 0);
  assert.equal(s.mean, null);
});

test("summarize computes mean and median correctly", () => {
  const s = summarize([10, 20, 30]);
  assert.equal(s.mean, 20);
  assert.equal(s.median, 20);
  assert.equal(s.min, 10);
  assert.equal(s.max, 30);
});

test("summarize handles even-length median", () => {
  assert.equal(summarize([1, 2, 3, 4]).median, 2.5);
});

test("minSamplesNeeded returns a finite positive number", () => {
  const n = minSamplesNeeded();
  assert.ok(Number.isFinite(n) && n > 0);
  assert.ok(n > 100, "should demand a meaningful sample, got " + n);
});

test("underpowered samples never declare a leader", () => {
  const v = compareVariants([
    { label: "A", successes: 5, total: 10 },
    { label: "B", successes: 1, total: 10 },
  ], 1000);
  assert.ok(v.every((x) => x.verdict === "UNDERPOWERED"), "10 vs 10 must not conclude anything");
  assert.ok(v[0].note.includes("1000"));
});

test("overlapping confidence intervals stay inconclusive even with decent n", () => {
  const v = compareVariants([
    { label: "A", successes: 110, total: 1000 },
    { label: "B", successes: 100, total: 1000 },
  ], 500);
  assert.ok(v.some((x) => x.verdict === "INCONCLUSIVE"));
  assert.ok(!v.some((x) => x.verdict === "CLEAR_LEADER"));
});

test("a large, non-overlapping difference can be declared a leader", () => {
  const v = compareVariants([
    { label: "A", successes: 200, total: 1000 },
    { label: "B", successes: 50, total: 1000 },
  ], 500);
  assert.equal(v.find((x) => x.label === "A")?.verdict, "CLEAR_LEADER");
});

test("wilson interval is bounded and widens with small n", () => {
  const small = wilson(1, 5);
  const large = wilson(200, 1000);
  assert.ok(small[0] >= 0 && small[1] <= 1);
  assert.ok(small[1] - small[0] > large[1] - large[0], "small sample must have wider interval");
});

test("wilson handles zero denominators", () => {
  assert.deepEqual(wilson(0, 0), [0, 1]);
});

test("a variant with no views is not treated as a zero-rate winner", () => {
  const v = compareVariants([
    { label: "A", successes: 0, total: 0 },
    { label: "B", successes: 5, total: 1000 },
  ], 500);
  const a = v.find((x) => x.label === "A")!;
  assert.notEqual(a.verdict, "CLEAR_LEADER");
});

test("only ONE variant can be labelled CLEAR_LEADER", () => {
  const v = compareVariants([
    { label: "A", successes: 300, total: 2000 },
    { label: "B", successes: 150, total: 2000 },
    { label: "C", successes: 100, total: 2000 },
  ], 1400);
  const leaders = v.filter((x) => x.verdict === "CLEAR_LEADER");
  assert.equal(leaders.length, 1, "expected exactly one leader, got " + leaders.map((l) => l.label).join(","));
  assert.equal(leaders[0].label, "A");
});
