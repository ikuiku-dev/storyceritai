import { handler, ok, ApiError } from "@/lib/api";
import { validateBundle, restoreBundle } from "@/lib/services/export/service";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export const POST = handler(async (req) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new ApiError("Berkas terlalu besar (maks 20 MB).", 413, "TOO_LARGE");

  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError("Berkas bukan JSON valid.", 422, "BAD_JSON"); }

  const bundle = validateBundle(raw);
  const result = await restoreBundle(bundle);
  return ok(result);
});
