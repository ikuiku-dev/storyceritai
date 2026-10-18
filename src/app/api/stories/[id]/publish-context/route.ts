import { handler, ok, ApiError } from "@/lib/api";
import { prisma, getSettings } from "@/lib/db";

/**
 * Everything the publish step needs for one draft, assembled from the records that already
 * exist: the story text, the product it came from, that product's affiliate link, and the
 * disclosure the user configured. Without this the Studio could not hand a story to the
 * queue, because the affiliate URL lived only on the Product/AffiliateLink rows.
 */
export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const draft = await prisma.storyDraft.findUnique({
    where: { id },
    select: {
      id: true,
      text: true,
      title: true,
      truthMode: true,
      factCheckStatus: true,
      status: true,
      concept: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              affiliateLinks: {
                where: { active: true },
                orderBy: [{ validationStatus: "asc" }, { checkedAt: "desc" }],
                select: { affiliateUrl: true, validationStatus: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!draft) throw new ApiError("Draft tidak ditemukan.", 404, "NOT_FOUND");

  const settings = await getSettings();
  // Prefer a link that was actually validated; surface its status so the UI can warn.
  const link = draft.concept?.product?.affiliateLinks[0] ?? null;

  return ok({
    draftId: draft.id,
    finalText: draft.text,
    title: draft.title,
    truthMode: draft.truthMode,
    factCheckStatus: draft.factCheckStatus,
    draftStatus: draft.status,
    product: draft.concept?.product
      ? { id: draft.concept.product.id, name: draft.concept.product.name }
      : null,
    affiliateUrl: link?.affiliateUrl ?? null,
    affiliateStatus: link?.validationStatus ?? null,
    disclosureText: settings.disclosureText ?? null,
    requireAffiliateLink: settings.requireAffiliateLink,
  });
});
