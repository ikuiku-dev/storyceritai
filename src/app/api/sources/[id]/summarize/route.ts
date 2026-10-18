import { handler, ok } from "@/lib/api";
import { summarizeSource } from "@/lib/services/sources/service";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await summarizeSource(id));
});
