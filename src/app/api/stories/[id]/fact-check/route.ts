import { handler, ok } from "@/lib/api";
import { factCheckDraft } from "@/lib/services/stories/service";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await factCheckDraft(id));
});
