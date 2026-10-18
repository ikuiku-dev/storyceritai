import { handler, ok, parseBody } from "@/lib/api";
import { providerInput } from "@/lib/schemas";
import { createProvider, listProviders } from "@/lib/services/providers";

export const GET = handler(async () => ok(await listProviders()));

export const POST = handler(async (req) => {
  const input = await parseBody(req, providerInput);
  const created = await createProvider(input);
  return ok(created, { status: 201 });
});
