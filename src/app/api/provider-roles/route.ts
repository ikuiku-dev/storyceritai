import { handler, ok, parseBody } from "@/lib/api";
import { roleAssignment } from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = handler(async () => {
  const rows = await prisma.aIModelConfiguration.findMany({ include: { provider: { select: { id: true, name: true, model: true, protocol: true } } } });
  return ok(rows);
});

export const POST = handler(async (req) => {
  const input = await parseBody(req, roleAssignment);
  const row = await prisma.aIModelConfiguration.upsert({
    where: { role: input.role },
    create: { role: input.role, providerId: input.providerId, modelOverride: input.modelOverride ?? null, temperatureOverride: input.temperatureOverride ?? null },
    update: { providerId: input.providerId, modelOverride: input.modelOverride ?? null, temperatureOverride: input.temperatureOverride ?? null, active: true },
  });
  await audit({ action: "provider.role_assigned", summary: `Model untuk peran ${input.role} diatur`, entityType: "AIModelConfiguration", entityId: row.id });
  return ok(row);
});

export const DELETE = handler(async (req) => {
  const role = new URL(req.url).searchParams.get("role");
  if (!role) return ok({ deleted: 0 });
  const r = await prisma.aIModelConfiguration.deleteMany({ where: { role } });
  return ok({ deleted: r.count });
});
