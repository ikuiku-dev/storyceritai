// src/lib/services/publishing/connection.ts — OAuth state + encrypted token storage.
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sealSecret, openSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import {
  threadsConfig, exchangeCodeForToken, exchangeLongLived, refreshLongLived, getMe, THREADS_OAUTH, SCOPES, ThreadsError,
} from "./threads";

export interface ThreadsConnection { token: string; userId: string; username: string | null }

/** CSRF state: random, stored in an HttpOnly cookie, verified on callback. */
export function createState() {
  return randomBytes(24).toString("base64url");
}

export function authorizeUrl(state: string): { url: string; configured: boolean } {
  const cfg = threadsConfig();
  if (!cfg) return { url: "", configured: false };
  const u = new URL(THREADS_OAUTH);
  u.searchParams.set("client_id", cfg.appId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return { url: u.toString(), configured: true };
}

export async function handleCallback(code: string) {
  const cfg = threadsConfig();
  if (!cfg) throw new ThreadsError("Threads belum dikonfigurasi di server (THREADS_APP_ID/SECRET/REDIRECT_URI).", 400, "NOT_CONFIGURED");

  const short = await exchangeCodeForToken(cfg, code.replace(/#_$/, ""));
  const shortToken = String(short.access_token ?? "");
  if (!shortToken) throw new ThreadsError("Tidak menerima access_token dari Threads.", 400, "NO_TOKEN");

  const long = await exchangeLongLived(cfg, shortToken);
  const token = String(long.access_token ?? shortToken);
  const expiresIn = Number(long.expires_in ?? 3600);

  const me = await getMe(token);
  const userId = String(me.id ?? "");
  if (!userId) throw new ThreadsError("Tidak bisa membaca ID pengguna Threads.", 400, "NO_USER");

  const conn = await prisma.integrationConnection.upsert({
    where: { provider: "threads" },
    create: {
      provider: "threads", status: "CONNECTED", accountId: userId,
      accountName: me.username ? `@${String(me.username)}` : String(me.name ?? ""),
      scopes: SCOPES.join(","), tokenCipher: sealSecret(token),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000), refreshable: true,
      metadataJson: JSON.stringify({ id: userId, username: me.username ?? null }),
    },
    update: {
      status: "CONNECTED", accountId: userId,
      accountName: me.username ? `@${String(me.username)}` : String(me.name ?? ""),
      scopes: SCOPES.join(","), tokenCipher: sealSecret(token),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000), lastError: null,
    },
  });
  await audit({ action: "threads.connected", summary: `Threads terhubung sebagai ${conn.accountName}`, entityType: "IntegrationConnection", entityId: conn.id });
  return conn;
}

/** Returns a usable connection or throws with a clear reason. */
export async function getConnection(): Promise<ThreadsConnection | null> {
  const row = await prisma.integrationConnection.findUnique({ where: { provider: "threads" } });
  if (!row?.tokenCipher || row.status !== "CONNECTED") return null;
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now()) {
    await prisma.integrationConnection.update({ where: { id: row.id }, data: { status: "EXPIRED", lastError: "Token kedaluwarsa" } });
    return null;
  }
  return { token: openSecret(row.tokenCipher), userId: row.accountId ?? "", username: row.accountName };
}

export async function refreshToken() {
  const row = await prisma.integrationConnection.findUnique({ where: { provider: "threads" } });
  if (!row?.tokenCipher) throw new ThreadsError("Belum ada koneksi Threads.", 400, "NOT_CONNECTED");
  const token = openSecret(row.tokenCipher);
  const r = await refreshLongLived(token);
  const newToken = String(r.access_token ?? token);
  const expiresIn = Number(r.expires_in ?? 60 * 86400);
  const updated = await prisma.integrationConnection.update({
    where: { id: row.id },
    data: { tokenCipher: sealSecret(newToken), tokenExpiresAt: new Date(Date.now() + expiresIn * 1000), status: "CONNECTED", lastRefreshAt: new Date(), lastError: null },
  });
  await audit({ action: "threads.refreshed", summary: "Token Threads diperbarui", entityType: "IntegrationConnection", entityId: row.id });
  return updated;
}

export async function disconnect() {
  const row = await prisma.integrationConnection.findUnique({ where: { provider: "threads" } });
  if (!row) return null;
  await prisma.integrationConnection.update({
    where: { id: row.id },
    data: { status: "NOT_CONFIGURED", tokenCipher: null, tokenExpiresAt: null, accountId: null, accountName: null },
  });
  await audit({ action: "threads.disconnected", summary: "Threads diputuskan; token dihapus", entityType: "IntegrationConnection", entityId: row.id });
  return { disconnected: true };
}

/** Public status — never includes the token. */
export async function connectionStatus() {
  const row = await prisma.integrationConnection.findUnique({ where: { provider: "threads" } });
  const cfg = threadsConfig();
  return {
    configuredOnServer: !!cfg,
    status: row?.status ?? "NOT_CONFIGURED",
    accountName: row?.accountName ?? null,
    scopes: row?.scopes ?? null,
    expiresAt: row?.tokenExpiresAt ?? null,
    lastRefreshAt: row?.lastRefreshAt ?? null,
    lastError: row?.lastError ?? null,
  };
}
