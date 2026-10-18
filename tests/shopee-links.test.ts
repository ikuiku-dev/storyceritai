// Affiliate link validation (PRD Phase 9 — Shopee).
// The dangerous failure here is claiming a normal product URL is an affiliate link,
// or "repairing" one by inventing parameters. Both are tested explicitly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLink } from "@/lib/connectors/shopee/links";

test("a normal product URL is NOT treated as an affiliate link", () => {
  const v = classifyLink("https://shopee.co.id/Stand-HP-i.123456.789");
  assert.equal(v.verdict, "PRODUCT_URL_NOT_AFFILIATE");
  assert.equal(v.valid, false);
  assert.match(v.reason, /tidak akan mengarang parameter/i);
});

test("a URL with a recognised affiliate parameter is accepted as-is", () => {
  const v = classifyLink("https://shopee.co.id/product-i.1.2?affiliate_id=998877&utm_content=sub1");
  assert.equal(v.verdict, "VALID_AFFILIATE");
  assert.equal(v.valid, true);
  assert.match(v.reason, /tidak diubah/i);
});

test("short links are reported unverified, never valid", () => {
  const v = classifyLink("https://shp.ee/abc123");
  assert.equal(v.verdict, "SHORT_LINK_UNVERIFIED");
  assert.equal(v.valid, false);
  assert.match(v.reason, /belum dapat diverifikasi/i);
});

test("a non-Shopee domain is rejected", () => {
  const v = classifyLink("https://tokopedia.com/x?affiliate_id=1");
  assert.equal(v.verdict, "NOT_SHOPEE");
  assert.equal(v.valid, false);
});

test("malformed input and non-http schemes are rejected safely", () => {
  assert.equal(classifyLink("bukan url").verdict, "MALFORMED");
  assert.equal(classifyLink("javascript:alert(1)").verdict, "MALFORMED");
  assert.equal(classifyLink("file:///etc/passwd").verdict, "MALFORMED");
});

test("classification never mutates the URL", () => {
  const url = "https://shopee.co.id/product-i.1.2";
  const v = classifyLink(url);
  // The whole point: no parameters added, nothing rewritten.
  assert.equal(url, "https://shopee.co.id/product-i.1.2");
  assert.ok(!("url" in v), "classifyLink must not return a rewritten URL");
});
