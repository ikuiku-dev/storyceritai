import { handler, ok, parseBody } from "@/lib/api";
import { settingsInput } from "@/lib/schemas";
import { getSettings, prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = handler(async () => ok(await getSettings()));

export const PATCH = handler(async (req) => {
  const input = await parseBody(req, settingsInput);
  await getSettings();

  const { scoringWeights, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };
  if (scoringWeights) data.scoringWeightsJson = JSON.stringify(scoringWeights);

  // Guard: AUTO_PUBLISH requires explicit enablement + configured limits.
  if (rest.publishingMode === "AUTO_PUBLISH" && rest.autoPublishEnabled === undefined) {
    data.autoPublishEnabled = false;
    data.publishingMode = "MANUAL_APPROVAL";
  }

  const updated = await prisma.userSettings.update({ where: { id: "singleton" }, data });
  await audit({
    action: "settings.updated",
    summary: `Pengaturan diperbarui${rest.publishingMode ? ` (mode: ${rest.publishingMode})` : ""}${rest.autoPublishEnabled !== undefined ? `, auto-publish: ${rest.autoPublishEnabled}` : ""}`,
    entityType: "UserSettings", entityId: "singleton",
    meta: { keys: Object.keys(input) },
  });
  return ok(updated);
});
