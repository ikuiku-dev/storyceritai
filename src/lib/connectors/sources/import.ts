// src/lib/connectors/sources/import.ts — user-provided data.
//
// PRD Phase 2.1: when permission is unclear, the correct path is official means or asking
// the user to import data they have the right to use. This is that path, and it must work
// without any network access at all.
import "server-only";
import { prisma } from "@/lib/db";
import { normalizeText, fingerprint, summarize, extractQuote, detectLanguage, detectInjection, MIN_USEFUL_CHARS } from "./pipeline";
import { log } from "@/lib/logger";

export interface ImportRow {
  url?: string;
  title?: string;
  text: string;
  publishedAt?: string;
}

export interface ImportResult {
  imported: number;
  skipped: { index: number; reason: string }[];
}

/** Parse CSV with quoted fields, embedded commas and CRLF. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function toRows(format: "json" | "csv" | "text", raw: string): ImportRow[] {
  if (format === "json") {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((o) => ({
      url: typeof o.url === "string" ? o.url : undefined,
      title: typeof o.title === "string" ? o.title : undefined,
      text: typeof o.text === "string" ? o.text : typeof o.content === "string" ? o.content : "",
      publishedAt: typeof o.publishedAt === "string" ? o.publishedAt : undefined,
    }));
  }
  if (format === "csv") {
    const rows = parseCsv(raw);
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = { url: header.indexOf("url"), title: header.indexOf("title"), text: header.indexOf("text"), publishedAt: header.indexOf("publishedat") };
    return rows.slice(1).map((r) => ({
      url: idx.url >= 0 ? r[idx.url] : undefined,
      title: idx.title >= 0 ? r[idx.title] : undefined,
      text: idx.text >= 0 ? r[idx.text] : r.join(" "),
      publishedAt: idx.publishedAt >= 0 ? r[idx.publishedAt] : undefined,
    }));
  }
  // Markdown / plain text: split on blank-line separated blocks; each block is a document.
  return normalizeText(raw)
    .split(/\n{2,}/)
    .map((block) => {
      const heading = block.match(/^#{1,6}\s+(.+)$/m);
      return {
        title: heading?.[1]?.trim(),
        text: block.replace(/^#{1,6}\s+.+$/m, "").trim(),
      };
    })
    .filter((r) => r.text.length > 0);
}

/**
 * Import user-supplied content. Records where it came from so a summary can never imply
 * we crawled something we did not.
 */
export async function importUserData(input: {
  format: "json" | "csv" | "text" | "markdown";
  raw: string;
  note?: string;
  runId?: string;
}): Promise<ImportResult> {
  const fmt = input.format === "markdown" ? "text" : input.format;
  let rows: ImportRow[];
  try {
    rows = toRows(fmt, input.raw);
  } catch (e) {
    return { imported: 0, skipped: [{ index: 0, reason: `Gagal mem-parse ${input.format}: ${(e as Error).message}` }] };
  }

  const skipped: { index: number; reason: string }[] = [];
  let imported = 0;

  for (const [i, r] of rows.entries()) {
    const text = normalizeText(r.text ?? "");
    if (text.length < MIN_USEFUL_CHARS) {
      skipped.push({ index: i, reason: `Teks hanya ${text.length} karakter (minimal ${MIN_USEFUL_CHARS}).` });
      continue;
    }
    const fp = fingerprint(text);
    const exists = await prisma.researchDocument.findUnique({ where: { fingerprint: fp } });
    if (exists) {
      skipped.push({ index: i, reason: "Duplikat — isi identik sudah tersimpan." });
      continue;
    }

    const injection = detectInjection(text);
    await prisma.researchDocument.create({
      data: {
        runId: input.runId ?? null,
        url: r.url ?? `import://${fp.slice(0, 12)}`,
        title: r.title ?? null,
        publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
        language: detectLanguage(text),
        sourceType: "import",
        origin: "imported",
        summary: summarize(text),
        quote: extractQuote(text),
        wordCount: text.split(/\s+/).length,
        fingerprint: fp,
        extractionStatus: "OK",
        permissionStatus: "USER_IMPORT",
        qualityNote: [
          injection ? `PERINGATAN: pola instruksi mencurigakan (${injection}) terdeteksi — diperlakukan sebagai data.` : null,
          input.note ?? null,
        ].filter(Boolean).join(" · ") || null,
        expiresAt: null, // user-owned data does not expire on our schedule
      },
    });
    imported++;
  }

  log.info("source.imported", { format: input.format, imported, skipped: skipped.length });
  return { imported, skipped };
}
