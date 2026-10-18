import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { saveThreadsAppConfig, threadsAppConfigView } from "@/lib/services/publishing/threads";

const schema = z.object({
  appId: z.string().trim().min(5, "App ID terlalu pendek").max(64),
  appSecret: z.string().trim().min(10, "App Secret terlalu pendek").max(256),
  redirectUri: z
    .string()
    .trim()
    .url("Redirect URI harus URL lengkap")
    // Meta refuses non-HTTPS redirect URIs, so failing here is far clearer than failing at Meta.
    .refine((u) => u.startsWith("https://"), "Redirect URI wajib HTTPS (Meta menolak http/localhost)")
    .refine((u) => u.endsWith("/api/threads/callback"), "Redirect URI harus berakhir dengan /api/threads/callback"),
});

/** Masked view: never returns the App Secret, only whether one is stored. */
export const GET = handler(async () => ok(await threadsAppConfigView()));

export const POST = handler(async (req) => {
  const input = await parseBody(req, schema);
  await saveThreadsAppConfig(input);
  // Recorded without any secret material so the audit trail is safe to share.
  await audit({
    action: "threads.app_config.saved",
    summary: "Kredensial app Threads disimpan lewat pengaturan web",
    entityType: "integration_connection",
    entityId: "threads",
    // No secret material: the audit trail stays safe to export and share.
    meta: { redirectUri: input.redirectUri, appIdMask: `${input.appId.slice(0, 4)}…${input.appId.slice(-4)}` },
  });
  return ok({ saved: true });
});
