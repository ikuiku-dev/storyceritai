import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { fetchModelsForCredentials } from "@/lib/services/providers";

const schema = z.object({
  baseUrl: z.string().min(8),
  apiKey: z.string().optional(),
  protocol: z.string().optional(),
});

/**
 * Discover the model catalogue reachable with a *given* base URL + key, before the provider is
 * saved. This is what lets each user see exactly the models their own key can use instead of a
 * hardcoded global list. The key is used for one outbound request and never echoed back.
 */
export const POST = handler(async (req) => {
  const input = await parseBody(req, schema);
  const models = await fetchModelsForCredentials({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey ?? null,
    protocol: input.protocol ?? "openai_compatible",
  });
  return ok({ models });
});
