// src/app/api/publishing/pause/route.ts — PRD §13 emergency controls.
//
// "Pause All": stops autonomous publishing immediately. It does NOT touch posts that are
// already PUBLISHED (nothing to undo) and does NOT silently cancel scheduled posts — it
// disables auto-publish and cancels SCHEDULED rows, which is the safe interpretation:
// a human must re-approve to resume.
import { handler, ok, parseBody } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = handler(async (req) => {
  const input = await parseBody(req, z.object({
    action: z.enum(["pause_all", "resume", "cancel_scheduled"]),
  }));

  await getSettings();

  if (input.action === "pause_all") {
    const [settings, cancelled] = await prisma.$transaction([
      prisma.userSettings.update({
        where: { id: "singleton" },
        data: { autoPublishEnabled: false, publishingMode: "MANUAL_APPROVAL" },
      }),
      prisma.publishedPost.updateMany({
        where: { status: "SCHEDULED" },
        data: { status: "WAITING_APPROVAL" },
      }),
    ]);
    await audit({
      action: "publishing.pause_all",
      summary: `PAUSE ALL: auto-publish dimatikan, ${cancelled.count} jadwal dikembalikan ke menunggu persetujuan`,
      entityType: "UserSettings", entityId: "singleton",
    });
    return ok({
      mode: settings.publishingMode,
      autoPublishEnabled: settings.autoPublishEnabled,
      unscheduled: cancelled.count,
      message: "Semua publikasi otomatis dihentikan. Postingan terjadwal dikembalikan ke antrean persetujuan.",
    });
  }

  if (input.action === "cancel_scheduled") {
    const cancelled = await prisma.publishedPost.updateMany({
      where: { status: { in: ["SCHEDULED", "APPROVED"] } },
      data: { status: "CANCELLED" },
    });
    await audit({
      action: "publishing.cancel_scheduled",
      summary: `${cancelled.count} postingan terjadwal dibatalkan`,
      entityType: "PublishedPost",
    });
    return ok({ cancelled: cancelled.count });
  }

  // resume: re-enable manual approval explicitly. Never re-enables AUTO_PUBLISH.
  const settings = await prisma.userSettings.update({
    where: { id: "singleton" },
    data: { publishingMode: "MANUAL_APPROVAL", autoPublishEnabled: false },
  });
  await audit({ action: "publishing.resume", summary: "Publikasi dilanjutkan dalam mode persetujuan manual", entityType: "UserSettings", entityId: "singleton" });
  return ok({ mode: settings.publishingMode, autoPublishEnabled: settings.autoPublishEnabled });
});
