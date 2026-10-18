import "server-only";

/**
 * Whether a post text actually carries an affiliate disclosure.
 *
 * Callers used to send `disclosureIncluded` themselves (default false), so a post could be
 * queued and published as "no disclosure" even when the text had one — or worse, claim true
 * when it did not. The flag is derived here from the text itself instead of trusted.
 */
const MARKERS = [
  "tautan affiliate",
  "tautan afiliasi",
  "link affiliate",
  "link afiliasi",
  "komisi",
  "affiliate",
  "afiliasi",
  "#ad",
  "#ads",
  "#aff",
  "sponsored",
  "berbayar",
];

export function detectDisclosure(text: string): boolean {
  const t = text.toLowerCase();
  return MARKERS.some((m) => t.includes(m));
}

/** True when a link is promoted but the text gives the reader no disclosure. */
export function missingDisclosure(text: string, affiliateUrl: string | null): boolean {
  return Boolean(affiliateUrl) && !detectDisclosure(text);
}
