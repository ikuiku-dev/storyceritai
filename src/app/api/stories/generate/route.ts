import { handler, ok, parseBody } from "@/lib/api";
import { storyGenerateInput } from "@/lib/schemas";
import { generateDrafts } from "@/lib/services/stories/service";

export const POST = handler(async (req) => {
  const input = await parseBody(req, storyGenerateInput);
  const result = await generateDrafts(input);
  return ok({
    provider: result.providerId,
    model: result.model,
    usedFallback: result.usedFallback,
    drafts: result.drafts.map((d) => ({ ...d.draft, lintIssues: d.issues, duplicates: d.duplicates })),
  });
});
