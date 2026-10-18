// src/lib/services/sources/extract.ts — HTML → readable text, no DOM library needed.
// Deliberately conservative: we keep paragraph structure and drop navigation/script noise.

const BLOCK_TAGS = /<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi;

export function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
    hellip: "…", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: "©", deg: "°",
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

export function htmlToText(html: string): { text: string; title: string | null } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim()) : null;

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(BLOCK_TAGS, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  body = decodeEntities(body)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: body, title };
}

/** Strip likely site chrome by dropping very short leading/trailing lines. */
export function cleanArticleText(text: string): string {
  const lines = text.split("\n").map((l) => l.trim());
  const keep: string[] = [];
  for (const l of lines) {
    if (l.length === 0) { keep.push(""); continue; }
    keep.push(l);
  }
  return keep.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Very small extractive summary used as a fallback when AI extraction is unavailable. */
export function fallbackSummary(text: string, maxChars = 400): string {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s.length > 30);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).length > maxChars) break;
    out += (out ? " " : "") + s;
  }
  return out || text.slice(0, maxChars);
}
