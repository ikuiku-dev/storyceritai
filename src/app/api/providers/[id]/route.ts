import { handler, ok, parseBody, ApiError } from "@/lib/api";
import { providerInput } from "@/lib/schemas";
import { deleteProvider, updateProvider } from "@/lib/services/providers";
import { z } from "zod";

const patchSchema = providerInput.partial();

export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(req, patchSchema);
  return ok(await updateProvider(id, input));
});

export const DELETE = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!z.string().cuid().safeParse(id).success && id.length < 5) throw new ApiError("ID tidak valid", 400);
  await deleteProvider(id);
  return ok({ deleted: true });
});
