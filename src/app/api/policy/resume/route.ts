import { handler, ok } from "@/lib/api";
import { resumeAutomation } from "@/lib/services/publishing/orchestrator";

export const POST = handler(async () => {
  const r = await resumeAutomation();
  return ok(r);
});
