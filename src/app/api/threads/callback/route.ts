import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleCallback } from "@/lib/services/publishing/connection";
import { log } from "@/lib/logger";

/**
 * Build the post-OAuth redirect target.
 *
 * Behind a tunnel or reverse proxy, req.url carries the internal host (localhost:3939), so
 * redirecting to u.origin would bounce the user's browser to their own machine and break the
 * flow. Honour the forwarded headers the proxy sets instead.
 */
function publicOrigin(req: Request, url: URL): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  if (!host) return url.origin;
  return `${proto}://${host}`;
}

export const GET = async (req: Request) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const error = u.searchParams.get("error");
  const base = new URL("/threads", publicOrigin(req, u));

  if (error) { base.searchParams.set("error", error); return NextResponse.redirect(base); }
  if (!code) { base.searchParams.set("error", "no_code"); return NextResponse.redirect(base); }

  const jar = await cookies();
  const expected = jar.get("threads_oauth_state")?.value;
  if (!expected || !state || state !== expected) {
    base.searchParams.set("error", "state_mismatch");
    return NextResponse.redirect(base);
  }
  jar.delete("threads_oauth_state");

  try {
    await handleCallback(code);
    base.searchParams.set("connected", "1");
  } catch (e) {
    log.error("threads.callback_failed", { error: (e as Error).message });
    base.searchParams.set("error", (e as Error).message.slice(0, 200));
  }
  return NextResponse.redirect(base);
};
