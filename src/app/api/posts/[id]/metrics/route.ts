import { handler, ok, ApiError } from "@/lib/api";
import { getConnection } from "@/lib/services/publishing/connection";
import { captureMetrics } from "@/lib/services/publishing/service";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const conn = await getConnection();
  if (!conn) throw new ApiError("Threads belum terhubung.", 409, "NOT_CONNECTED");
  return ok(await captureMetrics(id, conn));
});
