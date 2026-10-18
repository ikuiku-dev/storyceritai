// src/lib/services/products/scoring.ts — opportunity score with explicit "unknown" handling.
// A missing dimension is NOT zero: it narrows the weight base and is reported as unknown.

export interface Weights {
  problemFit: number; demandEvidence: number; dataQuality: number;
  demonstrability: number; commission: number; risk: number;
}

export const DEFAULT_WEIGHTS: Weights = { problemFit: 25, demandEvidence: 20, dataQuality: 15, demonstrability: 15, commission: 15, risk: 10 };

export interface ScoreInput {
  problemFitScore: number | null;
  demandEvidenceScore: number | null;
  dataQualityScore: number | null;
  demonstrabilityScore: number | null;
  commissionScore: number | null;
  riskScore: number | null;
}

export interface ScoreResult {
  score: number | null;
  coverage: number; // 0-100: share of weight that had real data
  known: string[];
  unknown: string[];
  explanation: string;
}

const KEYS: (keyof Weights)[] = ["problemFit", "demandEvidence", "dataQuality", "demonstrability", "commission", "risk"];
const FIELD: Record<keyof Weights, keyof ScoreInput> = {
  problemFit: "problemFitScore",
  demandEvidence: "demandEvidenceScore",
  dataQuality: "dataQualityScore",
  demonstrability: "demonstrabilityScore",
  commission: "commissionScore",
  risk: "riskScore",
};

export function computeOpportunity(input: ScoreInput, weights: Weights = DEFAULT_WEIGHTS): ScoreResult {
  let weightedSum = 0;
  let usedWeight = 0;
  let totalWeight = 0;
  const known: string[] = [];
  const unknown: string[] = [];

  for (const k of KEYS) {
    const w = Math.max(0, weights[k] ?? 0);
    totalWeight += w;
    const v = input[FIELD[k]];
    if (v == null) { unknown.push(k); continue; }
    known.push(k);
    // Risk is inverted: high risk lowers the opportunity.
    const effective = k === "risk" ? 100 - Math.max(0, Math.min(100, v)) : Math.max(0, Math.min(100, v));
    weightedSum += effective * w;
    usedWeight += w;
  }

  if (usedWeight === 0) {
    return {
      score: null,
      coverage: 0,
      known,
      unknown,
      explanation: "Belum ada dimensi yang punya data. Skor tidak dihitung — bukan nol.",
    };
  }

  const score = Math.round((weightedSum / usedWeight) * 10) / 10;
  const coverage = totalWeight > 0 ? Math.round((usedWeight / totalWeight) * 100) : 0;
  const explanation =
    `Skor ${score}/100 dari ${known.length}/${KEYS.length} dimensi (cakupan ${coverage}% bobot). ` +
    (unknown.length ? `Belum diketahui: ${unknown.join(", ")} — tidak diisi angka rekaan.` : "Semua dimensi memiliki data.");

  return { score, coverage, known, unknown, explanation };
}
