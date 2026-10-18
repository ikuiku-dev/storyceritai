import { handler, ok, ApiError } from "@/lib/api";
import { z } from "zod";
import { getConnection } from "@/lib/services/publishing/connection";
import { publishPost } from "@/lib/services/publishing/service";
import { getSettings } from "@/lib/db";

// Publishes ONE approved post. Requires explicit confirmation from the client.
export const POST = handler(async (req) => {
  const input = await (async () => {
    const body = await req.json().catch(() => ({}));
    const p = z.object({ postId: z.string().min(1), confirm: z.literal(true) }).safeParse(body);
    if (!p.success) throw new ApiError("Konfirmasi eksplisit diperlukan (confirm: true).", 422, "CONFIRM_REQUIRED");
    return p.data;
  })();

  const settings = await getSettings();
  if (settings.publishingMode === "DRAFT_ONLY") {
    throw new ApiError("Mode DRAFT_ONLY aktif — publikasi diblokir.", 409, "DRAFT_ONLY");
  }

  const conn = await getConnection();
  if (!conn) throw new ApiError("Threads belum terhubung.", 409, "NOT_CONNECTED");

  const result = await publishPost(input.postId, conn);
  return ok(result);
});
