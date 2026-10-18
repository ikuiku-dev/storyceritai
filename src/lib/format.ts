export const IDR = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export const USD = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(4)}`);

export const NUM = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("id-ID").format(n));

export const DT = (d: Date | string | null | undefined) =>
  d == null ? "—" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(d));

export const D = (d: Date | string | null | undefined) =>
  d == null ? "—" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(d));

export const ago = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};

/** Threads counts emoji as UTF-8 bytes; 500 is the cap. */
export function threadsLength(text: string): number {
  const segmenter = new Intl.Segmenter("id", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text)).reduce((n, seg) => n + (seg.segment.length > 1 ? new TextEncoder().encode(seg.segment).length : 1), 0);
}
