import { handler, ok, ApiError } from "@/lib/api";
import { getConnection } from "@/lib/services/publishing/connection";
import { getMe } from "@/lib/services/publishing/threads";

// Test Connection: proves the stored token works. Does NOT publish anything.
export const POST = handler(async () => {
  const conn = await getConnection();
  if (!conn) throw new ApiError("Threads belum terhubung atau token sudah kedaluwarsa.", 409, "NOT_CONNECTED");
  const me = await getMe(conn.token);
  return ok({ ok: true, username: me.username ?? null, id: me.id ?? null, message: "Token valid dan akun bisa dibaca." });
});
