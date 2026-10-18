import { test } from "node:test";
import assert from "node:assert/strict";
import { sealSecret, openSecret, maskSecret, similarity, contentHash } from "@/lib/crypto";

test("seal/open roundtrip", () => {
  const sealed = sealSecret("sk-abc123");
  assert.notEqual(sealed, "sk-abc123");
  assert.equal(openSecret(sealed), "sk-abc123");
});

test("sealed values are non-deterministic (random IV)", () => {
  assert.notEqual(sealSecret("same"), sealSecret("same"));
});

test("tampering is detected (GCM auth tag)", () => {
  const sealed = sealSecret("secret-value");
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => openSecret(parts.join(":")));
});

test("mask never reveals the whole key", () => {
  const m = maskSecret("sk-proj-abcdefgh12345678");
  assert.ok(m.includes("…"));
  assert.ok(!m.includes("abcdefgh12345678"));
});

test("similarity detects near-duplicates", () => {
  const a = "Meja kerja saya sempit jadi HP tidak punya tempat tetap dan kabel berantakan";
  const b = "Meja kerja saya sempit jadi HP tidak punya tempat tetap dan kabel berantakan semua";
  const c = "Resep rendang padang butuh santan kental dan bumbu halus";
  assert.ok(similarity(a, b) > 0.7);
  assert.ok(similarity(a, c) < 0.2);
});

test("contentHash ignores punctuation and case", () => {
  assert.equal(contentHash("Halo, Dunia!"), contentHash("halo dunia"));
});
