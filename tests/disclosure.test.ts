import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDisclosure, missingDisclosure } from "@/lib/services/publishing/disclosure";

// The queue flag was accepted from the client with default false, so a post carrying a link
// could be recorded as undisclosed. It is now derived from the text.

test("Indonesian disclosure phrasings are detected", () => {
  for (const t of [
    "Catatan: tautan ini adalah tautan affiliate.",
    "Aku dapat komisi kalau kamu beli lewat link afiliasi ini.",
    "Ini link affiliate ya.",
  ]) {
    assert.equal(detectDisclosure(t), true, `should detect: ${t}`);
  }
});

test("English and hashtag markers are detected", () => {
  for (const t of ["#ad pick ini murah", "Sponsored by X", "#aff"]) {
    assert.equal(detectDisclosure(t), true, `should detect: ${t}`);
  }
});

test("a plain story with no disclosure is not counted as disclosed", () => {
  const text = "Meja kerja saya sempit. HP tidak punya tempat tetap. Akhirnya beli stand kecil.";
  assert.equal(detectDisclosure(text), false);
});

test("a promoted link without disclosure is flagged", () => {
  assert.equal(missingDisclosure("Cerita biasa tanpa catatan apa pun.", "https://shope.ee/x"), true);
  assert.equal(missingDisclosure("Cerita biasa tanpa catatan apa pun.", null), false);
  assert.equal(
    missingDisclosure("Tautan affiliate: aku dapat komisi.", "https://shope.ee/x"),
    false,
  );
});

test("the route derives the flag instead of trusting the body", () => {
  const route = require("node:fs").readFileSync("src/app/api/posts/route.ts", "utf8") as string;
  assert.match(route, /disclosureIncluded: detectDisclosure\(input\.finalText\)/);
  assert.ok(
    !/disclosureIncluded: input\.disclosureIncluded/.test(route),
    "the client-supplied flag must not reach the database",
  );
});
