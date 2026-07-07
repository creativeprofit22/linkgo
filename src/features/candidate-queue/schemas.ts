import { z } from "zod";

export const candidateStatusSchema = z.enum([
  "new",
  "shortlisted",
  "rejected",
  "drafted",
]);

export const candidatePlatformSchema = z.enum(["linkedin"]);

export const dedupeKeyTypeSchema = z.enum(["normalized_url", "content_hash"]);

export const candidateDiscoveryKindSchema = z.enum([
  "keyword",
  "trend",
  "source_prompt",
]);

export const candidateDiscoveryStatusSchema = z.enum([
  "suggested",
  "promoted",
  "dismissed",
]);

const providerKeySchema = z.enum([
  "dry_run",
  "anthropic",
  "xiaomi",
  "openai",
  "gemini",
  "glm",
  "moonshot",
  "deepseek",
  "openrouter",
  "sakana",
  "minimax",
  "custom",
]);

const playbookKeySchema = z
  .enum([
    "",
    "linkedin_writer",
    "linkedin_humanizer",
    "content_calendar",
    "linkedin_commenter",
    "campaign_analyst",
  ])
  .optional();

export const createCandidateSchema = z.object({
  campaignId: z.number().int().positive(),
  url: z.string().trim().min(1, "LinkedIn post URL is required").max(1000),
  content: z.string().trim().min(1, "Post text is required").max(3000),
  authorName: z.string().trim().max(160).default(""),
  authorProfileUrl: z.string().trim().max(1000).default(""),
  postedAt: z.string().trim().max(80).nullable().optional().default(null),
  platformResourceUrn: z.string().trim().max(500).optional().default(""),
  sourceKeyword: z.string().trim().max(80).default(""),
  relevanceScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .default(null),
  scoreReason: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export const updateCandidateSchema = z.object({
  id: z.number().int().positive(),
  status: candidateStatusSchema.optional(),
  relevanceScore: z.number().int().min(0).max(100).nullable().optional(),
  scoreReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const discoverySuggestionSchema = z.object({
  kind: candidateDiscoveryKindSchema,
  title: z.string().trim().max(160).default(""),
  keyword: z.string().trim().max(80).default(""),
  rationale: z.string().trim().max(500).default(""),
  sourceKeyword: z.string().trim().max(80).optional().default(""),
  confidenceScore: z.number().int().min(0).max(100).nullable().optional(),
});

export const runCandidateDiscoverySchema = z.object({
  campaignId: z.number().int().positive(),
  seedKeywords: z
    .array(z.string().trim().max(80))
    .max(25)
    .optional()
    .default([]),
  notes: z.string().trim().max(1000).optional().default(""),
  providerKey: providerKeySchema.optional().default("dry_run"),
  modelName: z.string().trim().max(120).optional().default(""),
  playbookKey: playbookKeySchema.default(""),
});

export const scoreCandidatesSchema = z.object({
  campaignId: z.number().int().positive(),
  candidatePostIds: z.array(z.number().int().positive()).max(50).optional(),
  minimumScore: z.number().int().min(0).max(100).optional().default(60),
  autoRejectBelowMinimum: z.boolean().optional().default(false),
  providerKey: providerKeySchema.optional().default("dry_run"),
  modelName: z.string().trim().max(120).optional().default(""),
  playbookKey: playbookKeySchema.default(""),
});

export const promoteDiscoveryItemSchema = z.object({
  id: z.number().int().positive(),
  campaignId: z.number().int().positive(),
});

export const dismissDiscoveryItemSchema = z.object({
  id: z.number().int().positive(),
  campaignId: z.number().int().positive(),
});
