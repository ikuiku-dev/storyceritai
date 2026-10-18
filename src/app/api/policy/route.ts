import { handler, ok, parseBody, fail } from "@/lib/api";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { loadPolicy, canEnableAutoPublish } from "@/lib/policies/publishing";
import { audit } from "@/lib/audit";

export const GET = handler(async () => {
  const policy = await loadPolicy();
  const auto = await canEnableAutoPublish();
  return ok({ policy, autoPublishReady: auto.ok, autoPublishMissing: auto.missing });
});

export const PATCH = handler(async (req) => {
  const input = await parseBody(req, z.object({
    maxPostsPerDay: z.number().int().min(1).max(10).optional(),
    minGapMinutes: z.number().int().min(60).max(1440).optional(),
    maxQueuedPosts: z.number().int().min(1).max(20).optional(),
    requireFactCheck: z.boolean().optional(),
    requireValidLink: z.boolean().optional(),
    budgetLimitUsd: z.number().min(0).nullable().optional(),
    killSwitch: z.boolean().optional(),
    autoPublishEnabled: z.boolean().optional(),
    confirm: z.boolean().optional(),
  }));

  // Enabling auto-publish requires explicit confirmation AND passing preconditions.
  if (input.autoPublishEnabled === true) {
    if (!input.confirm) {
      return fail("Aktifkan auto-publish memerlukan konfirmasi eksplisit.", 409, "CONFIRM_REQUIRED");
    }
    const gate = await canEnableAutoPublish();
    if (!gate.ok) {
      return fail(`Prasyarat belum terpenuhi: ${gate.missing.join(" ")}`, 409, "PRECONDITIONS_MISSING", { missing: gate.missing });
    }
  }

  const data = {
    ...(input.maxPostsPerDay !== undefined ? { maxPostsPerDay: input.maxPostsPerDay } : {}),
    ...(input.minGapMinutes !== undefined ? { minGapMinutes: input.minGapMinutes } : {}),
    ...(input.maxQueuedPosts !== undefined ? { maxQueuedPosts: input.maxQueuedPosts } : {}),
    ...(input.requireFactCheck !== undefined ? { requireFactCheck: input.requireFactCheck } : {}),
    ...(input.requireValidLink !== undefined ? { requireValidLink: input.requireValidLink } : {}),
    ...(input.budgetLimitUsd !== undefined ? { budgetLimitUsd: input.budgetLimitUsd } : {}),
    ...(input.killSwitch !== undefined ? { killSwitch: input.killSwitch } : {}),
    ...(input.autoPublishEnabled !== undefined ? { autoPublishEnabled: input.autoPublishEnabled } : {}),
    ...(input.autoPublishEnabled === true ? { confirmedAt: new Date() } : {}),
  };

  const row = await prisma.publishingPolicy.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  await audit({ action: "policy.updated", summary: `Kebijakan publikasi diperbarui`, entityType: "PublishingPolicy", entityId: "singleton" });
  return ok(row);
});
