import { handler, ok, parseBody } from "@/lib/api";
import { urlInput } from "@/lib/schemas";
import { ingestUrl } from "@/lib/services/sources/service";

export const POST = handler(async (req) => {
  const input = await parseBody(req, urlInput);
  const result = await ingestUrl(input);
  return ok(result, { status: result.ok ? 201 : 422 });
});
