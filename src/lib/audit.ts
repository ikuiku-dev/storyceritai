// src/lib/audit.ts — durable, append-only action log.
import "server-only";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

export async function audit(input: {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  actor?: "user" | "system" | "worker";
  meta?: Record<string, unknown>;
}) {
  log.info("audit", { action: input.action, entityId: input.entityId });
  return prisma.auditLog.create({
    data: {
      action: input.action,
      summary: input.summary.slice(0, 1000),
      entityType: input.entityType,
      entityId: input.entityId,
      actor: input.actor ?? "user",
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
}
