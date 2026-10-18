import { handler, ok } from "@/lib/api";
import { listModels } from "@/lib/services/providers";

export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok({ models: await listModels(id) });
});
