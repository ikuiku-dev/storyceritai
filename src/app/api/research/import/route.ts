import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { importUserData } from "@/lib/connectors/sources/import";

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    format: z.enum(["json", "csv", "text", "markdown"]),
    raw: z.string().min(1).max(10 * 1024 * 1024),
    note: z.string().max(500).optional(),
  }));
  const r = await importUserData(input);
  return ok(r);
});
