// src/lib/services/analytics/learning.ts — close the loop.
//
// Takes concluded experiments + their measured outcomes and produces a *brief* that the
// story generator can actually use. Deliberately conservative:
//   - only CONCLUDED experiments with a SUPPORTED confidence influence generation
//   - everything weaker is listed as "hypothesis" and never presented as fact
//   - the brief is plain text, injected as guidance, never as a factual claim
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export interface LearnedPattern {
  insight: string;
  evidence: string;
  confidence: "SUPPORTED" | "INDICATIVE";
  experimentId: string;
  sampleSize: number;
}

export interface AudienceBrief {
  patterns: LearnedPattern[];
  hypotheses: { text: string; experimentName: string }[];
  restrictions: string[];
  emptyReason: string | null;
}

/** Gather what the data actually supports. Never invents a pattern from one post. */
export async function buildAudienceBrief(): Promise<AudienceBrief> {
  const exps = await prisma.storyExperiment.findMany({
    where: { status: "CONCLUDED" },
    include: { variants: { include: { posts: { include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } } } } } },
  });

  const patterns: LearnedPattern[] = [];
  const hypotheses: { text: string; experimentName: string }[] = [];

  for (const e of exps) {
    if (e.confidence === "SUPPORTED" && e.conclusion) {
      const snaps = e.variants.flatMap((v) => v.posts.flatMap((p) => p.metrics));
      const totalViews = snaps.reduce((a, m) => a + (m.views ?? 0), 0);
      patterns.push({
        insight: e.conclusion,
        evidence: `${e.name}${e.recommendation ? ` → ${e.recommendation}` : ""}`,
        confidence: "SUPPORTED",
        experimentId: e.id,
        sampleSize: e.sampleSize || totalViews,
      });
    } else if (e.confidence === "INDICATIVE" && e.conclusion) {
      hypotheses.push({ text: e.conclusion, experimentName: e.name });
    }
  }

  const restrictions: string[] = [];
  if (patterns.length === 0) {
    restrictions.push("Belum ada pola yang terbukti. Tulis tanpa mengklaim 'sudah terbukti berhasil'.");
  }

  return {
    patterns,
    hypotheses,
    restrictions,
    emptyReason: patterns.length === 0 && hypotheses.length === 0
      ? "Belum ada eksperimen yang disimpulkan. Jalankan Story Arena, publikasikan, ukur, lalu simpulkan."
      : null,
  };
}

/** Mark an experiment concluded from real measured numbers. Refuses if sample is too thin. */
export async function concludeExperiment(id: string) {
  const exp = await prisma.storyExperiment.findUnique({
    where: { id },
    include: { variants: { include: { posts: { include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } } } } } },
  });
  if (!exp) return null;

  const snaps = exp.variants.flatMap((v) => v.posts.flatMap((p) => p.metrics));
  const totalViews = snaps.reduce((a, m) => a + (m.views ?? 0), 0);

  // Import here to avoid a module cycle with the analytics service.
  const { minSamplesNeeded, compareVariants } = await import("./stats");
  const required = minSamplesNeeded();
  const perVariant = exp.variants.map((v) => {
    const m = v.posts[0]?.metrics[0];
    return { label: v.label, successes: m?.replies ?? null, total: m?.views ?? null };
  });
  const verdicts = compareVariants(perVariant, required);
  const leader = verdicts.find((v) => v.verdict === "CLEAR_LEADER");

  let conclusion: string;
  let confidence: string;
  if (snaps.length === 0) {
    conclusion = "Tidak ada metrik tercatat. Eksperimen ditutup tanpa kesimpulan.";
    confidence = "INSUFFICIENT";
  } else if (verdicts.some((v) => v.verdict === "UNDERPOWERED")) {
    conclusion = `Sampel belum cukup (butuh ~${required} views/varian). Tidak ada pemenang yang bisa diklaim.`;
    confidence = "INSUFFICIENT";
  } else if (leader) {
    conclusion = `Varian ${leader.label} unggul pada rasio balasan/views dengan selang kepercayaan 95% yang tidak tumpang tindih.`;
    confidence = "SUPPORTED";
  } else {
    conclusion = "Perbedaan antar varian belum bisa dibedakan dari kebetulan pada sampel ini.";
    confidence = "INDICATIVE";
  }

  const updated = await prisma.storyExperiment.update({
    where: { id },
    data: {
      status: "CONCLUDED", concludedAt: new Date(), confidence,
      sampleSize: totalViews, conclusion,
      recommendation: confidence === "SUPPORTED"
        ? `Ulangi sudut "${leader?.label}" pada produk lain sebelum menjadikannya default.`
        : "Kumpulkan lebih banyak data atau uji ulang dengan jumlah sampel lebih besar.",
    },
  });
  await audit({
    action: "experiment.concluded",
    summary: `Eksperimen disimpulkan (${confidence}): ${conclusion.slice(0, 80)}`,
    entityType: "StoryExperiment", entityId: id,
  });
  return updated;
}

/** Render the brief for injection into a generation prompt. */
export function briefToPromptText(brief: AudienceBrief): string {
  if (!brief.patterns.length && !brief.hypotheses.length) return "";
  const lines: string[] = ["Pelajaran dari eksperimen nyata sebelumnya:"];
  for (const p of brief.patterns) {
    lines.push(`- [TERBUKTI, n=${p.sampleSize}] ${p.insight}`);
  }
  for (const h of brief.hypotheses) {
    lines.push(`- [HIPOTESIS, belum terbukti] ${h.text}`);
  }
  lines.push("Gunakan sebagai panduan arah, bukan sebagai klaim yang boleh ditulis di cerita.");
  return lines.join("\n");
}
