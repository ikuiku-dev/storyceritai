import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { saveRevision } from "@/lib/services/stories/service";

export const POST = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const { text, changeNote } = await parseBody(req, z.object({ text: z.string().min(1).max(5000), changeNote: z.string().max(500).optional() }));
  return ok(await saveRevision(id, text, changeNote));
});
