import { handler, ok } from "@/lib/api";
import { buildAudienceBrief, briefToPromptText } from "@/lib/services/analytics/learning";

export const GET = handler(async () => {
  const brief = await buildAudienceBrief();
  return ok({ ...brief, promptText: briefToPromptText(brief) });
});
