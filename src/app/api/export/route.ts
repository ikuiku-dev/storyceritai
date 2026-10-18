import { handler, ApiError } from "@/lib/api";
import { buildExport, type BundleScope } from "@/lib/services/export/service";

export const GET = handler(async (req) => {
  const scope = (new URL(req.url).searchParams.get("scope") ?? "full") as BundleScope;
  if (!["full", "content", "settings"].includes(scope)) {
    throw new ApiError("scope harus full, content, atau settings", 422, "BAD_SCOPE");
  }
  const bundle = await buildExport(scope);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="ceritalab-${scope}-${stamp}.json"`,
    },
  });
});
