import { handler, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(async (req) => {
  const u = new URL(req.url);
  const q = u.searchParams.get("q");
  const rows = await prisma.source.findMany({
    where: q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { insights: true, excerpts: true } } },
  });
  return ok(rows.map((r) => ({ ...r, rawText: r.rawText ? r.rawText.slice(0, 400) + (r.rawText.length > 400 ? "…" : "") : null })));
});
