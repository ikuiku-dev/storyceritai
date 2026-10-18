// src/lib/db.ts — single Prisma client (libsql adapter for local SQLite).
import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const dbUrl = process.env.DATABASE_URL || "file:./dev.db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create(): PrismaClient {
  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({
    adapter,
    log: process.env.LOG_LEVEL === "debug" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Settings singleton — created on first access. */
export async function getSettings() {
  const existing = await prisma.userSettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.userSettings.create({ data: { id: "singleton" } });
}
