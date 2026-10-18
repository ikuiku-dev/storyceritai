// src/lib/jobs/queue.ts — persistent SQLite-backed job queue with leases, retry and backoff.
// No Redis. Crash-safe: stale RUNNING leases are reclaimed after LOCK_TTL_MS.
import "server-only";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { audit } from "@/lib/audit";

const LOCK_TTL_MS = 5 * 60 * 1000;
const OWNER = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

export type JobHandler = (payload: Record<string, unknown>, ctx: { jobId: string; attempt: number }) => Promise<unknown>;

const registry = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler) {
  registry.set(type, handler);
}

export async function enqueue(input: {
  type: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
  providerId?: string;
}) {
  // dedupeKey has a unique index: a duplicate enqueue is a no-op that returns the existing job.
  if (input.dedupeKey) {
    const existing = await prisma.job.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return existing;
  }
  return prisma.job.create({
    data: {
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
      runAt: input.runAt ?? new Date(),
      dedupeKey: input.dedupeKey,
      maxAttempts: input.maxAttempts ?? 3,
      providerId: input.providerId,
    },
  });
}

/** Reclaim jobs whose worker died mid-run. */
async function reclaimStale() {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS);
  await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "QUEUED", lockedAt: null, lockOwner: null, lastError: "Reclaimed after stale lease" },
  });
}

async function claimOne() {
  const now = new Date();
  const candidate = await prisma.job.findFirst({
    where: { status: "QUEUED", runAt: { lte: now } },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  // Optimistic claim: only succeeds if nobody else took it.
  const res = await prisma.job.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "RUNNING", lockedAt: new Date(), lockOwner: OWNER, attempts: { increment: 1 } },
  });
  if (res.count === 0) return null;
  return prisma.job.findUnique({ where: { id: candidate.id } });
}

export async function runDueJobs(limit = 5): Promise<number> {
  await reclaimStale();
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await claimOne();
    if (!job) break;
    processed++;
    const handler = registry.get(job.type);
    if (!handler) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: `No handler registered for "${job.type}"`, lockedAt: null },
      });
      continue;
    }
    try {
      const payload = JSON.parse(job.payloadJson) as Record<string, unknown>;
      const result = await handler(payload, { jobId: job.id, attempt: job.attempts });
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          resultJson: JSON.stringify(result ?? null).slice(0, 20_000),
          lockedAt: null,
          lockOwner: null,
        },
      });
      log.info("job.succeeded", { jobId: job.id, type: job.type, attempt: job.attempts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const willRetry = job.attempts < job.maxAttempts;
      const backoffMs = Math.min(60_000, 2 ** job.attempts * 2_000);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: willRetry ? "QUEUED" : "FAILED",
          lastError: message.slice(0, 2000),
          runAt: new Date(Date.now() + backoffMs),
          lockedAt: null,
          lockOwner: null,
        },
      });
      log.warn("job.failed", { jobId: job.id, type: job.type, attempt: job.attempts, willRetry, error: message });
      if (!willRetry) {
        await audit({
          action: "job.failed_permanently",
          summary: `Job ${job.type} gagal setelah ${job.attempts} percobaan: ${message}`.slice(0, 500),
          entityType: "Job",
          entityId: job.id,
          actor: "worker",
        });
      }
    }
  }
  return processed;
}

export function hasHandler(type: string) {
  return registry.has(type);
}
