// src/lib/services/analytics/stats.ts — honest statistics helpers.
// Rule: never present a difference as meaningful when the sample is too small.
// These are descriptive summaries, not significance tests, unless stated.

export interface Summary { n: number; mean: number | null; median: number | null; min: number | null; max: number | null }

export function summarize(values: (number | null | undefined)[]): Summary {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, median: null, min: null, max: null };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, mean, median, min: v[0], max: v[v.length - 1] };
}

/**
 * Minimum-sample gate. Computed from a two-proportion rule of thumb, NOT a real power
 * analysis. It exists so the UI refuses to declare a winner from 3 views.
 */
export function minSamplesNeeded(baselineRate = 0.05, minimumDetectableEffect = 0.5, alpha = 0.05, power = 0.8): number {
  // p1, p2 with p2 = p1 * (1 + mde)
  const p1 = baselineRate;
  const p2 = Math.min(0.99, p1 * (1 + minimumDetectableEffect));
  const pBar = (p1 + p2) / 2;
  const za = alpha === 0.05 ? 1.96 : 2.58;
  const zb = power === 0.8 ? 0.842 : 1.282;
  if (p2 <= p1) return Infinity;
  const n = Math.pow(za * Math.sqrt(2 * pBar * (1 - pBar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

export type Verdict = "UNDERPOWERED" | "CLEAR_LEADER" | "INCONCLUSIVE";

export interface VariantVerdict {
  label: string;
  n: number;
  rate: number | null;
  mean: number | null;
  verdict: Verdict;
  note: string;
}

/**
 * Compare variants on a rate metric (replies per view, etc.).
 * Deliberately conservative: a leader is only declared when every variant has
 * enough samples AND the leader's 95% Wilson interval clears the runner-up's.
 */
export function compareVariants(rows: { label: string; successes: number | null; total: number | null }[], requiredPerVariant: number): VariantVerdict[] {
  const prepared = rows.map((r) => {
    const n = r.total ?? 0;
    const s = r.successes ?? 0;
    return { label: r.label, n, k: s, rate: n > 0 ? s / n : null };
  });

  const underpowered = prepared.some((p) => p.n < requiredPerVariant);
  const sorted = [...prepared].filter((p) => p.rate != null).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  return prepared.map((p) => {
    const base = { label: p.label, n: p.n, rate: p.rate, mean: p.rate, verdict: "UNDERPOWERED" as Verdict };
    if (underpowered) {
      return { ...base, note: `Butuh ≥${requiredPerVariant} sampel per varian; baru ${p.n}. Jangan simpulkan pemenang.` };
    }
    if (p.rate == null) return { ...base, note: "Tidak ada data views." };

    const top = sorted[0];
    const second = sorted[1];
    if (!second) return { ...base, verdict: "INCONCLUSIVE" as Verdict, note: "Hanya satu varian dengan data." };

    const ciTop = wilson(top.k, top.n);
    const ciSecond = wilson(second.k, second.n);
    const overlapping = ciTop[0] <= ciSecond[1] && ciSecond[0] <= ciTop[1];
    const isTop = p.label === top.label;

    if (!overlapping) {
      // Only the top performer is a "leader". Others are simply behind — labelling them
      // CLEAR_LEADER too would be actively misleading.
      return isTop
        ? { ...base, verdict: "CLEAR_LEADER" as Verdict, note: "Interval kepercayaan 95% tidak tumpang tindih dengan runner-up." }
        : { ...base, verdict: "INCONCLUSIVE" as Verdict, note: "Tertinggal dari pemimpin dengan interval yang tidak tumpang tindih." };
    }
    return { ...base, verdict: "INCONCLUSIVE" as Verdict, note: "Interval kepercayaan 95% tumpang tindih — belum bisa dibedakan." };
  });
}

/** Wilson score interval — better than normal approximation for small n / small rates. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
