// src/lib/services/providers.ts — provider CRUD, secret handling, connection tests.
import "server-only";
import { prisma } from "@/lib/db";
import { isBlockedHostname, isPrivateIPv4, isBlockedIPv6 } from "@/lib/net/ssrf";
import { sealSecret, maskSecret } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { adapterFor, toConfig } from "@/lib/services/ai/runtime";
import { AIError } from "@/lib/services/ai/types";
import type { ProviderInput } from "@/lib/schemas";
import type { AIProvider } from "@prisma/client";

/** Client-safe provider shape — never includes apiKeyCipher. */
export type PublicProvider = Omit<AIProvider, "apiKeyCipher">;

export function toPublic(p: AIProvider): PublicProvider {
  const { apiKeyCipher: _sealed, ...rest } = p;
  void _sealed;
  return rest;
}

export async function listProviders(): Promise<PublicProvider[]> {
  const rows = await prisma.aIProvider.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toPublic);
}

export async function createProvider(input: ProviderInput): Promise<PublicProvider> {
  if (input.isFallback) await prisma.aIProvider.updateMany({ data: { isFallback: false } });
  const row = await prisma.aIProvider.create({
    data: {
      name: input.name,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      model: input.model,
      timeoutMs: input.timeoutMs,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature ?? null,
      maxRetries: input.maxRetries,
      contextWindow: input.contextWindow ?? null,
      priceInputPer1M: input.priceInputPer1M ?? null,
      priceOutputPer1M: input.priceOutputPer1M ?? null,
      active: input.active,
      isFallback: input.isFallback,
      notes: input.notes ?? null,
      apiKeyCipher: input.apiKey ? sealSecret(input.apiKey) : null,
      apiKeyMask: input.apiKey ? maskSecret(input.apiKey) : null,
    },
  });
  await audit({ action: "provider.created", summary: `Provider AI ditambahkan: ${row.name}`, entityType: "AIProvider", entityId: row.id, meta: { protocol: row.protocol, model: row.model } });
  return toPublic(row);
}

export async function updateProvider(id: string, input: Partial<ProviderInput>): Promise<PublicProvider> {
  const existing = await prisma.aIProvider.findUnique({ where: { id } });
  if (!existing) throw new AIError("MODEL_NOT_FOUND", "Provider tidak ditemukan");
  if (input.isFallback) await prisma.aIProvider.updateMany({ where: { id: { not: id } }, data: { isFallback: false } });

  const data: Record<string, unknown> = {};
  for (const k of ["name", "protocol", "baseUrl", "model", "timeoutMs", "maxOutputTokens", "maxRetries", "active", "isFallback"] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  for (const k of ["temperature", "contextWindow", "priceInputPer1M", "priceOutputPer1M", "notes"] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (input.apiKey) {
    data.apiKeyCipher = sealSecret(input.apiKey);
    data.apiKeyMask = maskSecret(input.apiKey);
    await audit({ action: "provider.key_rotated", summary: `API key provider ${existing.name} diganti`, entityType: "AIProvider", entityId: id });
  }
  const row = await prisma.aIProvider.update({ where: { id }, data });
  if (input.baseUrl || input.apiKey || input.model) {
    await prisma.aIProvider.update({ where: { id }, data: { lastTestOk: null, lastTestError: null, lastTestedAt: null } });
  }
  await audit({ action: "provider.updated", summary: `Provider AI diperbarui: ${row.name}`, entityType: "AIProvider", entityId: id });
  return toPublic(row);
}

export async function deleteProvider(id: string) {
  const existing = await prisma.aIProvider.findUnique({ where: { id } });
  if (!existing) throw new AIError("MODEL_NOT_FOUND", "Provider tidak ditemukan");
  await prisma.aIModelConfiguration.deleteMany({ where: { providerId: id } });
  await prisma.aIProvider.delete({ where: { id } });
  await audit({ action: "provider.deleted", summary: `Provider AI dihapus: ${existing.name}`, entityType: "AIProvider", entityId: id });
}

export async function testConnection(id: string) {
  const p = await prisma.aIProvider.findUnique({ where: { id } });
  if (!p) throw new AIError("MODEL_NOT_FOUND", "Provider tidak ditemukan");
  const adapter = adapterFor(p.protocol);
  const started = Date.now();
  try {
    const res = await adapter.testConnection(toConfig(p));
    await prisma.aIProvider.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: true, lastTestError: null } });
    return { ok: true, latencyMs: Date.now() - started, message: res.message };
  } catch (e) {
    const err = e instanceof AIError ? e : new AIError("UNKNOWN", (e as Error).message);
    await prisma.aIProvider.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: false, lastTestError: err.message.slice(0, 500) } });
    return { ok: false, latencyMs: Date.now() - started, code: err.code, message: err.message };
  }
}

export async function testModel(id: string) {
  const p = await prisma.aIProvider.findUnique({ where: { id } });
  if (!p) throw new AIError("MODEL_NOT_FOUND", "Provider tidak ditemukan");
  const adapter = adapterFor(p.protocol);
  const started = Date.now();
  try {
    const res = await adapter.complete(
      {
        model: p.model,
        maxOutputTokens: 24,
        messages: [
          { role: "system", content: "You are a health check. [TASK:generic] Reply with the single word: OK" },
          { role: "user", content: "ping" },
        ],
      },
      toConfig(p)
    );
    await prisma.costRecord.create({
      data: { providerId: p.id, model: p.model, task: "test_model", inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: Date.now() - started, ok: true },
    });
    await prisma.aIProvider.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: true, lastTestError: null } });
    return { ok: true, latencyMs: Date.now() - started, reply: res.text.slice(0, 120) };
  } catch (e) {
    const err = e instanceof AIError ? e : new AIError("UNKNOWN", (e as Error).message);
    await prisma.aIProvider.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: false, lastTestError: err.message.slice(0, 500) } });
    return { ok: false, latencyMs: Date.now() - started, code: err.code, message: err.message };
  }
}

export async function listModels(id: string) {
  const p = await prisma.aIProvider.findUnique({ where: { id } });
  if (!p) throw new AIError("MODEL_NOT_FOUND", "Provider tidak ditemukan");
  const adapter = adapterFor(p.protocol);
  return adapter.listModels(toConfig(p));
}

/**
 * List models for credentials that have not been saved yet.
 *
 * The settings screen needs to show "what can this key actually use?" before the provider
 * exists, so this cannot go through the database-backed path. SSRF protection still applies:
 * the adapter validates the base URL and refuses private/loopback hosts.
 */
export async function fetchModelsForCredentials(input: {
  baseUrl: string;
  apiKey: string | null;
  protocol: string;
}) {
  if (input.protocol === "mock") return ["mock-fast", "mock-slow"];
  // Guard the one place user-supplied input reaches the network before the provider is saved.
  let parsed: URL;
  try {
    parsed = new URL(input.baseUrl);
  } catch {
    throw new AIError("INVALID_BASE_URL", "Base URL tidak valid");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AIError("INVALID_BASE_URL", "Base URL harus diawali http:// atau https://");
  }
  // Cloud metadata endpoints are never a legitimate model provider. isBlockedHostname only
  // matches names, so literal IPs must be checked explicitly or 169.254.169.254 slips through.
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, "");
  const isLoopback = bareHost === "localhost" || bareHost === "127.0.0.1" || bareHost === "::1";
  if (!isLoopback && (isBlockedHostname(bareHost) || isPrivateIPv4(bareHost) || isBlockedIPv6(bareHost))) {
    throw new AIError("INVALID_BASE_URL", "Host tidak diizinkan");
  }

  const adapter = adapterFor(input.protocol);
  const models = await adapter.listModels({
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    apiKey: input.apiKey,
    model: "",
    timeoutMs: 15000,
    maxOutputTokens: 0,
    temperature: null,
  } as never);
  return models;
}
