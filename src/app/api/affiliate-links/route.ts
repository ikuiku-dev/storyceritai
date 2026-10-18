import { handler, ok, parseBody } from "@/lib/api";
import { affiliateLinkInput } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const GET = handler(async () => ok(await prisma.affiliateLink.findMany({ orderBy: { createdAt: "desc" }, include: { product: { select: { name: true } } } })));

export const POST = handler(async (req) => {
  const input = await parseBody(req, affiliateLinkInput.extend({ productId: z.string().min(1) }));
  const { productId, ...rest } = input;
  const link = await prisma.affiliateLink.create({ data: { ...rest, productId } });
  await audit({ action: "affiliate.created", summary: `Tautan affiliate ditambahkan`, entityType: "AffiliateLink", entityId: link.id });
  return ok(link, { status: 201 });
});
