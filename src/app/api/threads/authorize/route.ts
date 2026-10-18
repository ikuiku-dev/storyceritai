import { handler, ok } from "@/lib/api";
import { cookies } from "next/headers";
import { authorizeUrl, createState } from "@/lib/services/publishing/connection";

export const GET = handler(async () => {
  const state = createState();
  const jar = await cookies();
  jar.set("threads_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  const { url, configured } = await authorizeUrl(state);
  if (!configured) return ok({ configured: false, url: null, message: "Threads belum dikonfigurasi. Isi App ID, App Secret, dan Redirect URI di halaman Threads Integration." });
  return ok({ configured: true, url });
});
