import { handler, ok } from "@/lib/api";
import { scoreDraft } from "@/lib/services/stories/service";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await scoreDraft(id));
});
