import { handler, ok } from "@/lib/api";
import { validateAffiliateLink } from "@/lib/services/products/service";

export const POST = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await validateAffiliateLink(id));
});
