import { handler, ok, ApiError } from "@/lib/api";
import { importProducts, parseCsv, type ImportRow } from "@/lib/services/products/service";
import { z } from "zod";

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v == null || String(v).trim() === "" ? null : String(v).trim());

const rowSchema = z.object({
  name: z.string().min(1),
  shopName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  buyerProblem: z.string().nullable().optional(),
  priceIdr: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().nullable().optional(),
  commissionPerOrderIdr: z.number().nullable().optional(),
});

function normalize(raw: Record<string, unknown>): ImportRow {
  return {
    name: str(raw.name) ?? "",
    shopName: str(raw.shopName),
    category: str(raw.category),
    url: str(raw.url),
    targetAudience: str(raw.targetAudience),
    buyerProblem: str(raw.buyerProblem),
    priceIdr: num(raw.priceIdr),
    rating: num(raw.rating),
    reviewCount: num(raw.reviewCount),
    commissionPerOrderIdr: num(raw.commissionPerOrderIdr),
  };
}

// Body: raw text, auto-detected as CSV or JSON. Keeps the UI simple.
export const POST = handler(async (req) => {
  const contentType = req.headers.get("content-type") ?? "";
  let rows: ImportRow[] = [];

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as { csv?: string; json?: unknown };
    if (body.json != null) {
      const arr = Array.isArray(body.json) ? body.json : [body.json];
      rows = arr.map((r) => rowSchema.parse(normalize(r as Record<string, unknown>)));
      const res = await importProducts(rows, "JSON_IMPORT");
      return ok(res, { status: 201 });
    }
    if (typeof body.csv === "string") {
      rows = parseCsv(body.csv).map(normalize);
    }
  }
  if (!rows.length) throw new ApiError("Tidak ada baris untuk diimpor. Kirim CSV atau JSON dengan kolom name.", 422, "EMPTY_IMPORT");

  const res = await importProducts(rows, "CSV_IMPORT");
  return ok(res, { status: 201 });
});
