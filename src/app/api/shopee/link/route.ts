import { handler, ok, parseBody, ApiError } from "@/lib/api";
import { z } from "zod";
import { analyzeLink, validateAndRecord } from "@/lib/connectors/shopee/links";

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    url: z.string().min(5),
    affiliateId: z.string().optional(),
    record: z.boolean().default(false),
  }));

  // Without an affiliate row we can still classify, we just cannot store history.
  // analyzeLink follows a short link once (SSRF-checked) so a proven affiliate link is not
  // reported as "unverified" to the user.
  if (!input.record) return ok(await analyzeLink(input.url));
  if (!input.affiliateId) throw new ApiError("affiliateId wajib untuk menyimpan validasi", 422, "AFFILIATE_ID_REQUIRED");
  return ok(await validateAndRecord({ affiliateId: input.affiliateId, url: input.url }));
});
