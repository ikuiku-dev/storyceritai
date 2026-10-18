// src/lib/api.ts — request validation + uniform JSON envelope + error mapping.
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AIError } from "@/lib/services/ai/types";
import { ThreadsError } from "@/lib/services/publishing/threads";
import { publicError, log } from "@/lib/logger";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, code = "BAD_REQUEST", extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: { message, code, ...extra } }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError("Body harus JSON yang valid", 400, "INVALID_JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("Input tidak valid", 422, "VALIDATION_FAILED", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

export class ApiError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, code = "BAD_REQUEST", extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Wrap a route handler so every thrown error becomes a clean, redacted JSON response. */
export function handler(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status, e.code, e.extra);
      if (e instanceof ZodError) return fail("Input tidak valid", 422, "VALIDATION_FAILED", { issues: e.issues });
      if (e instanceof AIError) {
        const status = e.code === "NO_PROVIDER" ? 409 : e.code === "BUDGET_EXCEEDED" ? 429 : 502;
        return fail(e.message, status, e.code);
      }
      // Domain errors carry their own status/code (409 guardrail blocks, 429 rate limits,
      // 504 uncertain publish). Mapping them keeps the UI able to react to the real cause
      // instead of seeing a generic 500.
      if (e instanceof ThreadsError) {
        return fail(e.message, e.status, e.code);
      }
      log.error("api.unhandled", { error: (e as Error)?.message, path: new URL(req.url).pathname });
      return fail(publicError(e), 500, "INTERNAL");
    }
  };
}
