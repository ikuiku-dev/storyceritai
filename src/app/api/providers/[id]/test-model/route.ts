import { handler, ok } from "@/lib/api";
import { testModel } from "@/lib/services/providers";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const result = await testModel(id);
  return ok(result, { status: result.ok ? 200 : 502 });
});
