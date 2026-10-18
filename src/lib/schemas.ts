// src/lib/schemas.ts — Zod schemas shared by API routes (server) and forms (client).
import { z } from "zod";

const TRUTH_MODES = ["REAL_EXPERIENCE", "SOURCE_BASED", "HYPOTHETICAL", "OPINION", "PRODUCT_EXPLAINER"] as const;

export const providerInput = z.object({
  name: z.string().min(1).max(80),
  protocol: z.enum(["openai_compatible", "mock"]).default("openai_compatible"),
  baseUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), "Base URL harus http(s)"),
  apiKey: z.string().max(500).optional(), // write-only; never returned
  model: z.string().min(1).max(200),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  maxOutputTokens: z.number().int().min(16).max(32000).default(2000),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxRetries: z.number().int().min(0).max(5).default(2),
  contextWindow: z.number().int().min(0).nullable().optional(),
  priceInputPer1M: z.number().min(0).nullable().optional(),
  priceOutputPer1M: z.number().min(0).nullable().optional(),
  active: z.boolean().default(true),
  isFallback: z.boolean().default(false),
  notes: z.string().max(1000).nullable().optional(),
});
export type ProviderInput = z.infer<typeof providerInput>;

export const ROLE_KEYS = [
  "research_extractor",
  "audience_analyst",
  "story_writer",
  "naturalness_editor",
  "critical_reviewer",
  "product_matcher",
  "experiment_analyzer",
  "final_validator",
] as const;

export const roleAssignment = z.object({
  role: z.enum(ROLE_KEYS),
  providerId: z.string().min(1),
  modelOverride: z.string().max(200).nullable().optional(),
  temperatureOverride: z.number().min(0).max(2).nullable().optional(),
});

export const settingsInput = z.object({
  publishingMode: z.enum(["DRAFT_ONLY", "MANUAL_APPROVAL", "SCHEDULED_APPROVAL", "AUTO_PUBLISH"]).optional(),
  autoPublishEnabled: z.boolean().optional(),
  maxPostsPerDay: z.number().int().min(1).max(50).optional(),
  minGapMinutes: z.number().int().min(5).max(1440).optional(),
  requireAffiliateLink: z.boolean().optional(),
  requireFactCheckPass: z.boolean().optional(),
  disclosureText: z.string().max(500).optional(),
  disclosureEnabled: z.boolean().optional(),
  aiContentLabelEnabled: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
  dailyBudgetUsd: z.number().min(0).nullable().optional(),
  monthlyBudgetUsd: z.number().min(0).nullable().optional(),
  scoringWeights: z
    .object({
      problemFit: z.number().min(0).max(100),
      demandEvidence: z.number().min(0).max(100),
      dataQuality: z.number().min(0).max(100),
      demonstrability: z.number().min(0).max(100),
      commission: z.number().min(0).max(100),
      risk: z.number().min(0).max(100),
    })
    .optional(),
});

export const urlInput = z.object({
  url: z.string().url().max(2000),
  kind: z.enum(["ARTICLE", "FORUM", "REVIEW", "COMMENT", "THREADS_POST"]).default("ARTICLE"),
});

export const textImportInput = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(20).max(200_000),
  kind: z.enum(["USER_NOTE", "INTERVIEW", "TRANSCRIPT", "FILE_IMPORT", "ARTICLE"]).default("USER_NOTE"),
  permissionStatus: z.enum(["ALLOWED", "RESTRICTED", "UNKNOWN", "USER_PROVIDED"]).default("USER_PROVIDED"),
});

export const productInput = z.object({
  name: z.string().min(1).max(200),
  shopName: z.string().max(120).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  url: z.string().url().max(2000).nullable().optional(),
  targetAudience: z.string().max(500).nullable().optional(),
  buyerProblem: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sourceOrigin: z.enum(["MANUAL", "URL", "CSV_IMPORT", "JSON_IMPORT", "SHOPEE_OPEN_API", "AFFILIATE_FEED"]).default("MANUAL"),
});

export const productScoreInput = z.object({
  problemFitScore: z.number().int().min(0).max(100).nullable(),
  problemFitReason: z.string().max(500).nullable().optional(),
  demandEvidenceScore: z.number().int().min(0).max(100).nullable(),
  demandEvidenceReason: z.string().max(500).nullable().optional(),
  dataQualityScore: z.number().int().min(0).max(100).nullable(),
  dataQualityReason: z.string().max(500).nullable().optional(),
  demonstrabilityScore: z.number().int().min(0).max(100).nullable(),
  demonstrabilityReason: z.string().max(500).nullable().optional(),
  commissionScore: z.number().int().min(0).max(100).nullable(),
  commissionReason: z.string().max(500).nullable().optional(),
  riskScore: z.number().int().min(0).max(100).nullable(),
  riskReason: z.string().max(500).nullable().optional(),
});

export const affiliateLinkInput = z.object({
  productUrl: z.string().url().max(2000).nullable().optional(),
  affiliateUrl: z.string().url().max(2000),
  urlSource: z.enum(["MANUAL", "SHOPEE_AFFILIATE_PORTAL", "CSV_IMPORT"]).default("MANUAL"),
  campaignId: z.string().max(120).nullable().optional(),
  subId: z.string().max(120).nullable().optional(),
  commissionPerOrderIdr: z.number().int().min(0).nullable().optional(),
  commissionSource: z.string().max(200).nullable().optional(),
  commissionPeriod: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().default(true),
});

export const storyControls = z.object({
  formality: z.number().int().min(0).max(4).default(1),
  length: z.number().int().min(0).max(4).default(2),
  promotion: z.number().int().min(0).max(4).default(1),
  humor: z.number().int().min(0).max(4).default(1),
  detail: z.number().int().min(0).max(4).default(2),
  slang: z.number().int().min(0).max(4).default(1),
  endingQuestion: z.boolean().default(false),
});

export const storyGenerateInput = z.object({
  conceptId: z.string().optional(),
  productId: z.string().nullable().optional(),
  audienceProblem: z.string().min(5).max(1000),
  audience: z.string().max(300).nullable().optional(),
  stylePreset: z.string().max(60).default("santai"),
  truthMode: z.enum(TRUTH_MODES),
  personalExperience: z.string().max(4000).nullable().optional(),
  sourceIds: z.array(z.string()).max(10).default([]),
  controls: storyControls.default({ formality: 1, length: 2, promotion: 1, humor: 1, detail: 2, slang: 1, endingQuestion: false }),
  versions: z.number().int().min(1).max(4).default(2),
});

export const tournamentInput = z.object({
  productId: z.string().nullable().optional(),
  audienceProblem: z.string().min(5).max(1000),
  audience: z.string().max(300).nullable().optional(),
  hypothesis: z.string().max(1000).optional(),
  truthMode: z.enum(TRUTH_MODES).default("HYPOTHETICAL"),
  personalExperience: z.string().max(4000).nullable().optional(),
  maxConcepts: z.number().int().min(4).max(14).default(10),
  finalists: z.number().int().min(2).max(6).default(4),
  versionsPerConcept: z.number().int().min(1).max(3).default(2),
  maxAiCalls: z.number().int().min(4).max(60).default(30),
});
