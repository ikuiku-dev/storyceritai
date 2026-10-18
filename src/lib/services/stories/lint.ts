// src/lib/services/stories/lint.ts — deterministic (no AI) style checks.
// Cliché phrases are NOT forbidden — they are context-dependent. We flag them so the
// writer can vary. Hard rules (fake experience without REAL_EXPERIENCE) DO block publishing.

export interface LintIssue {
  code: string;
  severity: "info" | "warn" | "block";
  message: string;
  match?: string;
}

const CLICHE_OPENERS = [
  "pernah nggak sih", "jujurly", "aku baru sadar", "pov:", "pov ",
  "ternyata selama ini", "ini bukan sekadar", "siapa sangka", "guys,", "hay guys", "hello guys",
];

const HYPE_WORDS = ["viral", "wajib punya", "wajib beli", "terbaik", "nomor 1", "paling laris", "termurah", "auto viral", "ga ada obat"];

/** First-person purchase/usage claims. Only legal for REAL_EXPERIENCE. */
const FAKE_EXPERIENCE: { re: RegExp; label: string }[] = [
  { re: /\b(aku|saya|gue|gua|gw)\s+(sudah|udah)\s+(pakai|pake|beli|coba|gunakan)\b/i, label: "klaim pemakaian lampau (sudah pakai/beli)" },
  { re: /\b(aku|saya|gue|gua|gw)\s+(beli|coba)\s+(kemarin|minggu lalu|bulan lalu|sebulan)\b/i, label: "klaim waktu pembelian" },
  { re: /\b(pengalaman|rekomendasi)\s+(aku|saya)\s+(setelah|selama)\s+\w+\s+(hari|minggu|bulan)\b/i, label: "testimoni durasi pemakaian" },
  { re: /\b(aku|saya)\s+packing\s+\w+/i, label: "klaim transaksi" },
];

/** Fabricated social proof / numbers. Blocked unless the caller marks them source-backed. */
const FAKE_SOCIAL_PROOF = [
  /\b\d{2,}(?:\.\d{3})+\s*(?:terjual|sold)\b/i,
  /\b\d+(?:[.,]\d+)?\s*(?:ribu|rb|k)\s*(?:terjual|sold|ulasan|review)\b/i,
  /\brating\s*[45](?:[.,]\d)?\s*(?:dari|\/)\s*5\b/i,
  /\bdiskon\s*\d{1,2}\s*%/i,
];

export interface LintOptions {
  truthMode: string;
  allowSocialProof?: boolean;
}

export function lintStory(text: string, opts: LintOptions): LintIssue[] {
  const issues: LintIssue[] = [];
  const lower = text.toLowerCase().trim();
  const firstLine = lower.split("\n").find((l) => l.trim().length > 0) ?? "";

  for (const phrase of CLICHE_OPENERS) {
    if (firstLine.includes(phrase)) {
      issues.push({ code: "CLICHE_OPENER", severity: "warn", message: `Pembukaan "${phrase}" terasa template. Variasikan.`, match: phrase });
      break;
    }
  }

  for (const w of HYPE_WORDS) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) issues.push({ code: "HYPE_CLAIM", severity: "block", message: `Kata hype tanpa dasar: "${w}". Hapus atau beri bukti.`, match: w });
  }

  if (opts.truthMode !== "REAL_EXPERIENCE") {
    for (const { re, label } of FAKE_EXPERIENCE) {
      const m = text.match(re);
      if (m) issues.push({ code: "FAKE_EXPERIENCE", severity: "block", message: `Mode ${opts.truthMode} tidak boleh memuat ${label}: "${m[0]}".`, match: m[0] });
    }
  }

  if (!opts.allowSocialProof) {
    for (const re of FAKE_SOCIAL_PROOF) {
      const m = text.match(re);
      if (m) issues.push({ code: "FABRICATED_PROOF", severity: "block", message: `Angka/sosial proof tanpa sumber: "${m[0]}".`, match: m[0] });
    }
  }

  const sentences = text.split(/[.!?…]+/).map((s) => s.trim()).filter((s) => s.length > 3);
  const exclam = (text.match(/!/g) ?? []).length;
  if (exclam > 2) issues.push({ code: "TOO_MANY_EXCLAMATIONS", severity: "warn", message: `${exclam} tanda seru — kurangi agar tidak terasa iklan.` });
  const emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;
  if (emoji > 3) issues.push({ code: "EMOJI_OVERLOAD", severity: "warn", message: `${emoji} emoji — berlebihan.` });

  if (sentences.length > 0) {
    const lens = sentences.map((s) => s.split(/\s+/).length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length;
    if (lens.length >= 6 && Math.sqrt(variance) < 2 && avg >= 8) {
      issues.push({ code: "MONOTONE_RHYTHM", severity: "warn", message: "Panjang kalimat terlalu seragam — variasikan ritme." });
    }
  }
  if (!/\n\n/.test(text) && text.length > 320) {
    issues.push({ code: "NO_PARAGRAPHS", severity: "info", message: "Belum ada jeda paragraf — pecah agar mudah dibaca." });
  }
  return issues;
}

export function hasBlockingIssue(issues: LintIssue[]): boolean {
  return issues.some((i) => i.severity === "block");
}
