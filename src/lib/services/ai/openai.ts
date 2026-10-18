// src/lib/services/ai/openai.ts — OpenAI-compatible adapter.
// Assumption documented: any server exposing POST {base}/chat/completions and GET {base}/models
// with a bearer key is supported. Nothing else is assumed.
import { AIError, type AIAdapter, type CompletionRequest, type CompletionResult, type ProviderConfig } from "./types";
import { log } from "@/lib/logger";

/**
 * Base URLs that rejected `response_format`. Process-local: once a provider proves it cannot
 * handle the parameter we stop sending it, avoiding a wasted request on every call.
 */
const jsonModeUnsupported = new Set<string>();

/**
 * Ask for a bare JSON object in prose, for providers that reject `response_format`.
 * Appended to the system message when one exists, otherwise prepended as a system turn.
 */
function withJsonInstruction<T extends { role: string; content: string }>(messages: T[]): T[] {
  // Models without response_format drift from the requested shape, so the reminder has to name
  // the exact skeleton the caller expects. Skipping this produced confidently wrong JSON.
  const instruction =
    "PENTING: balas HANYA dengan satu objek JSON valid dan langsung mulai dengan karakter '{'. " +
    "Jangan menulis kalimat pembuka, penjelasan, daftar bernomor, tebal markdown, atau blok kode. " +
    "Kunci objek WAJIB sama persis dengan yang diminta pada instruksi di atas — jangan mengganti " +
    "nama kunci, jangan menambah kunci lain, jangan mengubah struktur. " +
    "Jika kamu menulis teks di luar JSON atau memakai kunci buatan sendiri, jawaban dianggap gagal.";
  const copy = [...messages] as T[];
  const sysIdx = copy.findIndex((m) => m.role === "system");
  if (sysIdx >= 0) copy[sysIdx] = { ...copy[sysIdx], content: `${copy[sysIdx].content}\n\n${instruction}` } as T;
  else copy.unshift({ role: "system", content: instruction } as T);
  // Repeat at the very end: the last instruction carries the most weight for many models.
  const last = copy[copy.length - 1];
  if (last.role === "user") {
    copy[copy.length - 1] = { ...last, content: `${last.content}\n\n${instruction}` } as T;
  } else {
    copy.push({ role: "user", content: instruction } as T);
  }
  return copy;
}

/** Shared response parsing so the retry path and the normal path agree. */
function parseCompletion(text: string): CompletionResult {
  let json: {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new AIError("PARSE_FAILED", "Respons provider bukan JSON yang valid");
  }
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new AIError("PARSE_FAILED", "Respons provider tidak berisi konten teks");
  return {
    text: content,
    inputTokens: json.usage?.prompt_tokens ?? null,
    outputTokens: json.usage?.completion_tokens ?? null,
  };
}

function chatUrl(base: string) {
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}
function modelsUrl(base: string) {
  return `${base.replace(/\/+$/, "")}/models`;
}

const SECRETISH = /\b(sk-[A-Za-z0-9_-]{6,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;
const redact = (s: string) => s.replace(SECRETISH, "[REDACTED]");

function mapHttpError(status: number, bodyText: string): AIError {
  let detail = "";
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string; code?: string } };
    detail = j.error?.message ?? j.error?.code ?? "";
  } catch {
    detail = bodyText.slice(0, 200);
  }
  detail = redact(detail);
  if (status === 401 || status === 403) return new AIError("AUTH_FAILED", `API key ditolak (HTTP ${status}). ${detail}`, { status });
  if (status === 404) return new AIError("MODEL_NOT_FOUND", `Model atau endpoint tidak ditemukan (HTTP 404). ${detail}`, { status });
  if (status === 429) return new AIError("RATE_LIMITED", `Rate limit provider tercapai (HTTP 429). ${detail}`, { status });
  if (status >= 500) return new AIError("SERVER_ERROR", `Provider error (HTTP ${status}). ${detail}`, { status });
  return new AIError("BAD_REQUEST", `Permintaan ditolak (HTTP ${status}). ${detail}`, { status });
}

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AIError("TIMEOUT", `Provider tidak merespons dalam ${timeoutMs}ms`);
    throw new AIError("NETWORK", `Tidak bisa menghubungi provider: ${redact((e as Error).message)}`);
  } finally {
    clearTimeout(timer);
  }
}

export const openaiAdapter: AIAdapter = {
  async complete(req: CompletionRequest, cfg: ProviderConfig): Promise<CompletionResult> {
    if (!cfg.baseUrl || !/^https?:\/\//i.test(cfg.baseUrl)) {
      throw new AIError("INVALID_BASE_URL", "Base URL harus diawali http:// atau https://");
    }
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxOutputTokens ?? cfg.maxOutputTokens,
    };
    const temp = req.temperature ?? cfg.temperature;
    if (temp != null) body.temperature = temp;
    // Some OpenAI-compatible providers reject `response_format` outright (400). We ask for
    // JSON when supported, but must not fail the whole generation when it is not.
    const wantsJson = Boolean(req.jsonMode);
    // Prefer the real parameter; when the provider has proved it cannot convert it, fall back
    // to an inline instruction so the model still produces parseable JSON.
    if (wantsJson && !jsonModeUnsupported.has(cfg.baseUrl)) {
      body.response_format = { type: "json_object" };
    } else if (wantsJson) {
      body.messages = withJsonInstruction(req.messages);
    }

    const res = await call(
      chatUrl(cfg.baseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      },
      req.timeoutMs ?? cfg.timeoutMs
    );

    let text = await res.text();

    // Detect a provider that refuses response_format and transparently retry without it.
    if (!res.ok && req.jsonMode && /response_format/i.test(text) && !jsonModeUnsupported.has(cfg.baseUrl)) {
      jsonModeUnsupported.add(cfg.baseUrl);
      const fallbackBody: Record<string, unknown> = { ...body };
      delete fallbackBody.response_format;
      // Without response_format the model needs to be told to reply in JSON, otherwise it
      // answers in prose and downstream parsing fails.
      fallbackBody.messages = withJsonInstruction(req.messages);
      const retry = await call(
        chatUrl(cfg.baseUrl),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
          },
          body: JSON.stringify(fallbackBody),
        },
        req.timeoutMs ?? cfg.timeoutMs
      );
      log.warn("ai.response_format.unsupported", { baseUrl: cfg.baseUrl });
      text = await retry.text();
      if (!retry.ok) throw mapHttpError(retry.status, text);
      return parseCompletion(text);
    }

    if (!res.ok) throw mapHttpError(res.status, text);

    let json: {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new AIError("PARSE_FAILED", "Respons provider bukan JSON yang valid");
    }
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new AIError("PARSE_FAILED", "Respons provider tidak berisi konten teks");

    return {
      text: content,
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
    };
  },

  async listModels(cfg: ProviderConfig): Promise<string[]> {
    const res = await call(
      modelsUrl(cfg.baseUrl),
      { method: "GET", headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {} },
      Math.min(cfg.timeoutMs, 15_000)
    );
    const text = await res.text();
    if (!res.ok) throw mapHttpError(res.status, text);
    try {
      const json = JSON.parse(text) as { data?: { id?: string }[] };
      return (json.data ?? []).map((m) => m.id).filter((x): x is string => !!x).sort();
    } catch {
      throw new AIError("PARSE_FAILED", "Format daftar model tidak dikenali");
    }
  },

  async testConnection(cfg: ProviderConfig) {
    const res = await call(
      modelsUrl(cfg.baseUrl),
      { method: "GET", headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {} },
      Math.min(cfg.timeoutMs, 15_000)
    );
    const text = await res.text();
    if (!res.ok) throw mapHttpError(res.status, text);
    return { ok: true as const, message: "Koneksi berhasil — endpoint /models merespons." };
  },
};
