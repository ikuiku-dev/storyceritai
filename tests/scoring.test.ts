// Opportunity scoring: the critical property is that missing data is NOT treated as zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOpportunity, DEFAULT_WEIGHTS } from "@/lib/services/products/scoring";
import { parseCsv } from "@/lib/services/products/service";

test("no data at all yields null score, never 0", () => {
  const r = computeOpportunity({ problemFitScore: null, demandEvidenceScore: null, dataQualityScore: null, demonstrabilityScore: null, commissionScore: null, riskScore: null });
  assert.equal(r.score, null);
  assert.equal(r.coverage, 0);
  assert.equal(r.unknown.length, 6);
});

test("partial data: score computed only from known dimensions, unknown reported", () => {
  const r = computeOpportunity({ problemFitScore: 80, demandEvidenceScore: null, dataQualityScore: null, demonstrabilityScore: null, commissionScore: null, riskScore: null });
  assert.equal(r.score, 80);
  assert.equal(r.known.length, 1);
  assert.equal(r.unknown.length, 5);
  assert.ok(r.explanation.includes("tidak diisi angka rekaan"));
});

test("unknown dimensions do not dilute the score", () => {
  const full = computeOpportunity({ problemFitScore: 80, demandEvidenceScore: 80, dataQualityScore: 80, demonstrabilityScore: 80, commissionScore: 80, riskScore: 20 });
  const partial = computeOpportunity({ problemFitScore: 80, demandEvidenceScore: null, dataQualityScore: null, demonstrabilityScore: null, commissionScore: null, riskScore: 20 });
  // Both express the same quality; partial just has less coverage.
  assert.equal(full.score, partial.score);
  assert.ok(full.coverage > partial.coverage);
});

test("risk is inverted: high risk lowers the opportunity", () => {
  const low = computeOpportunity({ problemFitScore: 70, demandEvidenceScore: 70, dataQualityScore: 70, demonstrabilityScore: 70, commissionScore: 70, riskScore: 10 });
  const high = computeOpportunity({ problemFitScore: 70, demandEvidenceScore: 70, dataQualityScore: 70, demonstrabilityScore: 70, commissionScore: 70, riskScore: 90 });
  assert.ok(low.score! > high.score!);
});

test("weights are respected", () => {
  const w = { ...DEFAULT_WEIGHTS, problemFit: 100, demandEvidence: 0, dataQuality: 0, demonstrability: 0, commission: 0, risk: 0 };
  const r = computeOpportunity({ problemFitScore: 90, demandEvidenceScore: 10, dataQualityScore: 10, demonstrabilityScore: 10, commissionScore: 10, riskScore: 50 }, w);
  assert.equal(r.score, 90);
});

test("csv parser handles quotes, commas and CRLF", () => {
  const csv = 'name,shopName,buyerProblem\r\n"Stand HP, lipat","Toko A","Meja ""sempit"""\r\nOrganizer Kabel,Toko B,Kabel kusut\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Stand HP, lipat");
  assert.equal(rows[0].buyerProblem, 'Meja "sempit"');
  assert.equal(rows[1].name, "Organizer Kabel");
});
