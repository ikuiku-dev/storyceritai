// src/lib/crypto.ts — AES-256-GCM secret box.
// Key derived from CERITALAB_SECRET (env only). Never stored in the DB or repo.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.CERITALAB_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "CERITALAB_SECRET is missing or too short (min 16 chars). Add it to .env — secrets are never stored unencrypted."
    );
  }
  return scryptSync(secret, "ceritalab-v1", 32);
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`;
}

export function openSecret(sealed: string): string {
  const [ver, ivB, tagB, ctB] = sealed.split(":");
  if (ver !== VERSION || !ivB || !tagB || !ctB) throw new Error("Malformed sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}

/** Display-only mask, e.g. sk-proj-…9f3a. Never reversible. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 8) return "…" + plain.slice(-2);
  return `${plain.slice(0, Math.min(6, plain.length - 4))}…${plain.slice(-4)}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Normalized text hash used for dedupe (lowercase, collapse whitespace, strip punctuation runs). */
export function contentHash(text: string): string {
  const norm = text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sha256(norm);
}

/** Jaccard similarity on word shingles — cheap duplicate detector, no embeddings needed. */
export function similarity(a: string, b: string): number {
  const toks = (s: string) => {
    const w = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i < Math.max(1, w.length - 2); i++) set.add(w.slice(i, i + 3).join(" "));
    return set;
  };
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
