// src/lib/services/ai/types.ts — provider-agnostic interfaces.
// Every provider must implement this; nothing above this layer knows about HTTP details.

export type AIProtocol = "openai_compatible" | "mock";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Ask provider for JSON output when supported. */
  jsonMode?: boolean;
}

export interface CompletionResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  raw?: unknown;
}

export type AIErrorCode =
  | "PROVIDER_SCHEMA_MISMATCH"
  | "AUTH_FAILED"
  | "INVALID_BASE_URL"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "MODEL_NOT_FOUND"
  | "BAD_REQUEST"
  | "SERVER_ERROR"
  | "NETWORK"
  | "BUDGET_EXCEEDED"
  | "NO_PROVIDER"
  | "PARSE_FAILED"
  | "UNKNOWN";

export class AIError extends Error {
  code: AIErrorCode;
  status?: number;
  retryable: boolean;
  constructor(code: AIErrorCode, message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? ["TIMEOUT", "RATE_LIMITED", "SERVER_ERROR", "NETWORK"].includes(code);
  }
}

export interface ProviderConfig {
  id: string;
  name: string;
  protocol: AIProtocol;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number | null;
  maxRetries: number;
}

export interface AIAdapter {
  complete(req: CompletionRequest, cfg: ProviderConfig): Promise<CompletionResult>;
  listModels(cfg: ProviderConfig): Promise<string[]>;
  testConnection(cfg: ProviderConfig): Promise<{ ok: true; message: string }>;
}

export const AI_ROLES = [
  "research_extractor",
  "audience_analyst",
  "story_writer",
  "naturalness_editor",
  "critical_reviewer",
  "product_matcher",
  "experiment_analyzer",
  "final_validator",
] as const;
export type AIRole = (typeof AI_ROLES)[number];

export const ROLE_LABELS: Record<AIRole, string> = {
  research_extractor: "Research Extractor — merangkum fakta dari sumber",
  audience_analyst: "Audience Analyst — mengelompokkan masalah & keberatan",
  story_writer: "Story Writer — menghasilkan kandidat cerita",
  naturalness_editor: "Naturalness Editor — memperbaiki bahasa",
  critical_reviewer: "Critical Reviewer — mencari kelemahan & klaim tanpa bukti",
  product_matcher: "Product Matcher — menghubungkan cerita dengan produk",
  experiment_analyzer: "Experiment Analyst — membaca hasil eksperimen",
  final_validator: "Final Validator — memeriksa aturan sebelum publikasi",
};
