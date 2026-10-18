import { handler, ok, parseBody } from "@/lib/api";
import { textImportInput } from "@/lib/schemas";
import { createTextSource } from "@/lib/services/sources/service";

export const POST = handler(async (req) => {
  const input = await parseBody(req, textImportInput);
  const result = await createTextSource(input);
  return ok(result, { status: result.duplicate ? 200 : 201 });
});
