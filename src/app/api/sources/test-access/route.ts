import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { testSourceAccess } from "@/lib/connectors/sources/registry";

const AdapterType = z.enum(["rss", "sitemap", "public_api", "import", "manual_url"]);

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    url: z.string().url(),
    adapterType: AdapterType.default("manual_url"),
  }));
  return ok(await testSourceAccess(input.url, input.adapterType));
});
