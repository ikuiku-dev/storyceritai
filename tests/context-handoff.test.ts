import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The modules were reachable from the menu but shared no data: a product never carried into
// Story Studio, an approved draft never reached the queue, and the affiliate URL lived only
// on Product rows. These tests pin the three handoffs so they cannot silently disappear.

const products = readFileSync("src/components/products/ProductsClient.tsx", "utf8");
const studio = readFileSync("src/components/studio/StudioClient.tsx", "utf8");
const studioPage = readFileSync("src/app/studio/page.tsx", "utf8");
const arena = readFileSync("src/components/arena/ArenaClient.tsx", "utf8");
const send = readFileSync("src/components/publishing/SendToQueue.tsx", "utf8");

test("products can hand a product to Story Studio", () => {
  assert.match(products, /\/studio\?product=\$\{sel\.id\}/);
  assert.match(products, /Buat cerita dari produk ini/);
});

test("Story Studio accepts the handed-over product and problem", () => {
  assert.match(studioPage, /searchParams/);
  assert.match(studioPage, /initialProductId=\{product/);
  assert.match(studio, /initialProductId/);
  assert.match(studio, /useState\(initialProductId\)/);
  assert.match(studio, /useState\(initialProblem\)/);
});

test("an approved draft can reach the queue from Studio", () => {
  assert.match(studio, /SendToQueue/);
  // The handoff must be gated on approval, otherwise a draft could be queued mid-review.
  assert.match(studio, /draft\.status === "APPROVED" &&/);
});

test("Story Arena can send its approved pick to the queue", () => {
  assert.match(arena, /SendToQueue/);
  assert.match(arena, /approved\.has\(c\.draftId\)/);
});

test("the queue handoff carries the affiliate link, not just the text", () => {
  assert.match(send, /publish-context/);
  assert.match(send, /affiliateUrl: ctx\.affiliateUrl/);
});

test("a guardrail block is never reported as a successful queue", () => {
  // The route answers 200 with guard.ok === false; reporting success there is a false claim.
  assert.match(send, /if \(res\.guard && !res\.guard\.ok\)/);
  assert.match(send, /if \(!res\.post\)/);
  assert.ok(
    send.indexOf('"Tidak terkirim"') > 0 || send.indexOf("result.ok ? \"Terkirim\"") > 0,
    "the panel must distinguish sent from blocked",
  );
  const guardIdx = send.indexOf("!res.guard.ok");
  const successIdx = send.indexOf("Masuk antrean (status");
  assert.ok(guardIdx > 0 && successIdx > guardIdx, "success text must come after the guard check");
});

test("publish-context resolves the link from the product, not from user input", () => {
  const route = readFileSync("src/app/api/stories/[id]/publish-context/route.ts", "utf8");
  assert.match(route, /affiliateLinks/);
  assert.match(route, /disclosureText/);
});
