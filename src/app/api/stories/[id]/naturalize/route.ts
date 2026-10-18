import { handler, ok } from "@/lib/api";
import { naturalizeDraft } from "@/lib/services/stories/service";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await naturalizeDraft(id));
});
