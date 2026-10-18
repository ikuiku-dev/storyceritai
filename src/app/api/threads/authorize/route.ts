import { handler, ok } from "@/lib/api";
import { cookies } from "next/headers";
import { authorizeUrl, createState } from "@/lib/services/publishing/connection";

export const GET = handler(async () => {
  const state = createState();
  const jar = await cookies();
  jar.set("threads_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  const { url, configured } = authorizeUrl(state);
  if (!configured) return ok({ configured: false, url: null, message: "THREADS_APP_ID / THREADS_APP_SECRET / THREADS_REDIRECT_URI belum diisi di .env" });
  return ok({ configured: true, url });
});
