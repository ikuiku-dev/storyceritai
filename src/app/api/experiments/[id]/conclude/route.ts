import { handler, ok, ApiError } from "@/lib/api";
import { concludeExperiment } from "@/lib/services/analytics/learning";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const r = await concludeExperiment(id);
  if (!r) throw new ApiError("Eksperimen tidak ditemukan", 404, "NOT_FOUND");
  return ok(r);
});
