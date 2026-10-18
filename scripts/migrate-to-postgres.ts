// Copies every row from the local SQLite database into Postgres, preserving ids and relations.
//
// Read-only against SQLite: the local database is never modified, so this is safe to re-run.
// Rows that already exist in Postgres are skipped, so an interrupted run can simply be repeated.
//
// Usage:
//   DATABASE_URL="<supabase url>" npx tsx --conditions=react-server scripts/migrate-to-postgres.ts
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

// Importing @prisma/client twice with different adapters is not supported, so the SQLite side is
// read through libSQL's own client and handed over as plain JSON.
async function sqliteRows(table: string): Promise<Record<string, unknown>[]> {
  const { createClient } = await import("@libsql/client");
  const db = createClient({ url: process.env.SQLITE_URL ?? "file:./dev.db" });
  const res = await db.execute(`SELECT * FROM "${table}"`);
  db.close();
  return res.rows as unknown as Record<string, unknown>[];
}

const pgUrl = process.env.DATABASE_URL;
if (!pgUrl || !/^postgres(ql)?:\/\//i.test(pgUrl)) {
  throw new Error("DATABASE_URL must be a postgres:// URL (this script only writes to Postgres)");
}
const pg = new PrismaClient({ adapter: new PrismaPg({ connectionString: pgUrl }) });

// Parents first: a child row must never be written before the row it references.
// Parents first: every table appears after all the tables it references. Derived from the
// foreign keys in the schema (StoryDraft -> StoryConcept -> Product, and so on); copying in any
// other order violates a constraint and silently loses the child rows.
const ORDER = [
  "UserSettings",
  "AIProvider",
  "IntegrationConnection",
  "PromptTemplate",
  "PublishingPolicy",
  "ProductConnector",
  "Product",
  "SourceConnector",
  "Source",
  "ResearchRun",
  "ResearchDocument",
  "SourceEvidence",
  "SourceExcerpt",
  "AudienceInsight",
  "StoryConcept",
  "StoryDraft",
  "StoryScore",
  "StoryRevision",
  "StoryExperiment",
  "ExperimentVariant",
  "PublishedPost",
  "PostMetricSnapshot",
  "AffiliateLink",
  "AffiliateLinkValidation",
  "PublishingJob",
  "PublishingSchedule",
  "AutomationSchedule",
  "CostRecord",
  "Job",
  "IntegrationHealth",
  "AuditLog",
  "AIModelConfiguration",
  "ProductSnapshot",
];

// SQLite has no boolean type (0/1) and stores dates as text, while Postgres rejects both.
// The column types come from the Prisma schema rather than guessing at values, so a text
// column that happens to contain "1" is not silently turned into a boolean.
type ModelTypes = Record<string, { bool: string[]; date: string[] }>;

function loadTypes(): ModelTypes {
  const schema = readFileSync("prisma/schema.postgres.prisma", "utf8");
  const types: ModelTypes = {};
  let cur: string | null = null;
  for (const raw of schema.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^model +([A-Za-z0-9_]+) *\{$/);
    if (m) {
      cur = m[1];
      types[cur] = { bool: [], date: [] };
      continue;
    }
    if (cur && line.startsWith("}")) {
      cur = null;
      continue;
    }
    if (!cur || line.startsWith("//") || line.startsWith("@@")) continue;
    const parts = line.split(" ").filter(Boolean);
    if (parts.length < 2) continue;
    if (parts[1].replace("?", "") === "Boolean") types[cur].bool.push(parts[0]);
    if (parts[1].replace("?", "") === "DateTime") types[cur].date.push(parts[0]);
  }
  return types;
}

const TYPES = loadTypes();

function coerceRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const t = TYPES[table] ?? { bool: [], date: [] };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    if (t.bool.includes(k)) {
      out[k] = typeof v === "bigint" ? Number(v) === 1 : Boolean(v);
      continue;
    }
    if (t.date.includes(k) && typeof v === "string") {
      const iso = v.includes("T") ? v : v.replace(" ", "T");
      const d = new Date(/[Z+]/.test(iso) ? iso : iso + "Z");
      out[k] = Number.isNaN(d.getTime()) ? null : d;
      continue;
    }
    out[k] = typeof v === "bigint" ? Number(v) : v instanceof Uint8Array ? Buffer.from(v) : v;
  }
  return out;
}

async function main() {
  let total = 0;
  for (const table of ORDER) {
    let rows: Record<string, unknown>[];
    try {
      rows = await sqliteRows(table);
    } catch {
      console.log(`${table.padEnd(24)} skipped (not present locally)`);
      continue;
    }
    if (rows.length === 0) {
      console.log(`${table.padEnd(24)} 0`);
      continue;
    }
    const data = rows.map((r) => coerceRow(table, r));
    // skipDuplicates keeps this idempotent and never overwrites rows edited on the server.
    const res = await (pg as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>)[
      table[0].toLowerCase() + table.slice(1)
    ].createMany({ data, skipDuplicates: true });
    total += res.count;
    console.log(`${table.padEnd(24)} ${res.count}/${rows.length}`);
  }

  console.log(`\nDone. ${total} rows copied into Postgres.`);

  await pg.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
