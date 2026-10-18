import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { buildExport, restoreBundle, validateBundle } from "@/lib/services/export/service";

// Restore used to drop the nested affiliateLinks and snapshots with `void snapshots`, so a
// backup brought back products with no affiliate URL at all — and the first attempt to fix it
// failed with "Unknown argument productId" because a nested create implies the parent key.
// This is a real round trip against the database, not a shape check.

const created: string[] = [];
const MARK = "ZZ_RT_" + Date.now();

after(async () => {
  const prods = await prisma.product.findMany({ where: { name: { startsWith: MARK } }, select: { id: true } });
  const ids = prods.map((p) => p.id);
  if (ids.length) {
    await prisma.affiliateLink.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productSnapshot.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

test("a product restored from a bundle keeps its affiliate link and snapshots", async () => {
  const product = await prisma.product.create({
    data: {
      name: MARK,
      shopName: "RT Shop",
      url: "https://shopee.co.id/rt",
      sourceOrigin: "MANUAL",
      verificationStatus: "UNVERIFIED",
      affiliateLinks: {
        create: [{ affiliateUrl: `https://shope.ee/${MARK}?mmp_pid=an_11111111111`, urlSource: "MANUAL" }],
      },
      snapshots: {
        create: [{ priceIdr: 25000, sourceOrigin: "MANUAL" } as never],
      },
    } as never,
    include: { affiliateLinks: true, snapshots: true },
  });
  created.push(product.id);
  assert.equal(product.affiliateLinks.length, 1, "fixture must have a link");
  assert.equal(product.snapshots.length, 1, "fixture must have a snapshot");

  const bundle = await buildExport("content");
  const mine = (bundle.data.products as Record<string, unknown>[]).find((p) => p.id === product.id);
  assert.ok(mine, "the bundle must contain the product");
  assert.equal((mine.affiliateLinks as unknown[]).length, 1, "the bundle must carry the link");

  // Remove the source rows so the restore has to recreate them.
  await prisma.affiliateLink.deleteMany({ where: { productId: product.id } });
  await prisma.productSnapshot.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  const result = await restoreBundle(validateBundle(JSON.parse(JSON.stringify(bundle))));
  assert.deepEqual(result.errors ?? [], [], `restore must not error: ${(result.errors ?? []).join(" · ")}`);

  const restored = await prisma.product.findUnique({
    where: { id: product.id },
    include: { affiliateLinks: true, snapshots: true },
  });
  assert.ok(restored, "the product must exist again");
  assert.equal(restored.affiliateLinks.length, 1, "the affiliate link must come back");
  assert.match(restored.affiliateLinks[0].affiliateUrl, /mmp_pid/);
  assert.equal(restored.snapshots.length, 1, "the snapshot must come back");
});

test("the bundle never carries a secret field", async () => {
  const bundle = await buildExport("full");
  const text = JSON.stringify(bundle);
  for (const bad of ["apiKeyCipher", "tokenCipher", "accessToken", "appSecret"]) {
    assert.ok(!text.includes(bad), `bundle must not contain ${bad}`);
  }
});
