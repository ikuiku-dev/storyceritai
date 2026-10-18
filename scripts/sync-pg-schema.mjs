// Keeps prisma/schema.postgres.prisma in step with prisma/schema.prisma.
// Run: node scripts/sync-pg-schema.mjs   (and commit the result)
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("prisma/schema.prisma", "utf8");
if (!src.includes('provider = "sqlite"')) {
  throw new Error('schema.prisma no longer declares provider "sqlite"; update this script.');
}
const out = src
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace(
    "// prisma/schema.prisma — CeritaLab AI",
    "// prisma/schema.postgres.prisma — CeritaLab AI (deployment)\n" +
      "// Generated from schema.prisma with only the provider changed: every JSON field is already a\n" +
      "// String, so no column types need translating. Regenerate with scripts/sync-pg-schema.mjs\n" +
      "// whenever schema.prisma changes, so the two cannot drift.",
  );
writeFileSync("prisma/schema.postgres.prisma", out);
console.log("prisma/schema.postgres.prisma updated");
