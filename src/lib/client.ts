"use client";
// Tiny typed fetch wrapper for client components. Throws a readable message from the API envelope.
export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: { message: string; code: string; issues?: { path: string; message: string }[] } }
export type ApiRes<T> = ApiOk<T> | ApiErr;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as ApiRes<T>;
  if (!json.ok) {
    const msg = json.error.issues?.length ? `${json.error.message}: ${json.error.issues.map((i) => `${i.path} ${i.message}`).join(", ")}` : json.error.message;
    throw new Error(msg);
  }
  return json.data;
}
