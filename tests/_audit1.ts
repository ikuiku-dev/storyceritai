// Can an unapproved/invalid post reach APPROVED and then PUBLISH?
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL || "file:./dev.db" }) });

void (async () => {
  // Insert a post directly with text that would FAIL guardrails (fake experience + hype).
  const bad = await prisma.publishedPost.create({
    data: {
      finalText: "Aku sudah pakai seminggu dan ini wajib punya banget!",
      status: "WAITING_APPROVAL", dedupeKey: "audit-bad-" + Date.now(),
      disclosureIncluded: false,
    },
  });
  console.log("created BAD post:", bad.id);
  console.log("text:", JSON.stringify(bad.finalText));
})();
