import { prisma } from "@/lib/db";
import { StudioClient } from "@/components/studio/StudioClient";
import { connection } from "next/server";

export default async function StudioPage() {
  await connection(); // opt into request-time rendering (live DB + Date.now)
  const products = await prisma.product.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 50 });
  return <StudioClient products={products} />;
}
