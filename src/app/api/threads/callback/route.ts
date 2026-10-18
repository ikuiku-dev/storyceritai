import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleCallback } from "@/lib/services/publishing/connection";
import { log } from "@/lib/logger";

export const GET = async (req: Request) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const error = u.searchParams.get("error");
  const base = new URL("/threads", u.origin);

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
