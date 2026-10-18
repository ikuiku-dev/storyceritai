import { prisma } from "@/lib/db";
import { StudioClient } from "@/components/studio/StudioClient";
import { connection } from "next/server";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; problem?: string }>;
}) {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const { product, problem } = await searchParams;
  const products = await prisma.product.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 50 });
  // Product Research and Story Studio were separate islands: the user had to re-pick the
  // product here. Accepting ?product= lets the research step hand its context over.
  return <StudioClient products={products} initialProductId={product ?? ""} initialProblem={problem ?? ""} />;
}
