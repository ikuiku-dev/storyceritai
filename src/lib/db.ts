// src/lib/db.ts — single Prisma client.
//
// Two databases, one API: SQLite (libsql driver) for local development, Postgres for
// deployment, where Netlify's serverless filesystem cannot hold a database file. The adapter
// must match the provider the client was generated for, so a Postgres URL delivered to a
// SQLite-generated client fails loudly here instead of silently misbehaving.
import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaPg } from "@prisma/adapter-pg";

const dbUrl = process.env.DATABASE_URL || "file:./dev.db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function isPostgres(url: string) {
  return /^postgres(ql)?:\/\//i.test(url);
}

function create(): PrismaClient {
  const log: ["warn", "error"] | ["error"] =
    process.env.LOG_LEVEL === "debug" ? ["warn", "error"] : ["error"];

  if (isPostgres(dbUrl)) {
    // Supabase and most hosted Postgres require TLS; the pooler needs SSL to accept the conn.
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }), log });
  }
  return new PrismaClient({ adapter: new PrismaLibSql({ url: dbUrl }), log });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Settings singleton — created on first access. */
export async function getSettings() {
  const existing = await prisma.userSettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.userSettings.create({ data: { id: "singleton" } });
}
