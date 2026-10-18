import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async () => {
  const documents = await prisma.researchDocument.findMany({
    orderBy: { fetchedAt: "desc" },
    take: 200,
    select: {
      id: true, url: true, title: true, sourceType: true, origin: true,
      extractionStatus: true, permissionStatus: true, qualityNote: true,
      fetchedAt: true, expiresAt: true,
    },
  });
  const now = new Date();
  const summary = {
    total: documents.length,
    fetched: documents.filter((d) => d.origin === "fetched").length,
    imported: documents.filter((d) => d.origin === "imported").length,
    flagged: documents.filter((d) => Boolean(d.qualityNote)).length,
    stale: documents.filter((d) => d.expiresAt && d.expiresAt < now).length,
  };
  return ok({ documents, summary });
});
