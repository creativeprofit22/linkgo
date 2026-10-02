import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

export const candidateStatusSchema = z.enum([
  "new",
  "shortlisted",
  "rejected",
  "drafted",
]);

export const candidatePlatformSchema = z.enum(["linkedin"]);

export const MAX_RELEVANCE_SCORING_CONTEXT_LENGTH = 48_000;
export const MAX_RELEVANCE_CANDIDATE_EXCERPT_LENGTH = 1_200;

export const relevanceScoringContextSchema = z
  .object({
    campaign: z
      .object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(160),
        product: z.string().trim().max(500),
        audience: z.string().trim().max(500),
        voice: z.string().trim().max(500),
        tone: z.string().trim().max(500),
        keywords: z.array(z.string().trim().min(1).max(80)).max(12),
      })
      .strict(),
    sourceBatchId: z.number().int().positive(),
    autopilotPlanId: z.number().int().positive(),
    workflowRunId: z.number().int().positive(),
    workflowStepId: z.number().int().positive(),
    minimumScore: z.number().int().min(0).max(100),
    autoRejectBelowMinimum: z.boolean(),
    candidates: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            sourceKeyword: z.string().trim().max(80),
            authorName: z.string().trim().max(160),
            authorProfileUrl: z.string().trim().max(1_000),
            postedAt: z.string().trim().max(80).nullable(),
            sourceUrl: z.string().trim().min(1).max(1_000),
            contentExcerpt: z
              .string()
              .trim()
              .min(1)
              .max(MAX_RELEVANCE_CANDIDATE_EXCERPT_LENGTH),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((context, issueContext) => {
    if (
      new Set(context.candidates.map((candidate) => candidate.id)).size !==
      context.candidates.length
    ) {
      issueContext.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "Each idea can only be scored once per round",
      });
    }
    if (JSON.stringify(context).length > MAX_RELEVANCE_SCORING_CONTEXT_LENGTH) {
      issueContext.addIssue({
        code: "custom",
        message: `The scoring notes can be up to ${MAX_RELEVANCE_SCORING_CONTEXT_LENGTH} characters`,
      });
    }
  });

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
  url: z.string().trim().min(1, "Add the LinkedIn post link").max(1000),
  content: z.string().trim().min(1, "Add the post text").max(3000),
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

export const candidateIdSchema = z.number().int().positive();

/** Native result of the candidate mutation commands: the affected row id. */
export const candidateMutationResultSchema = z
  .object({ id: z.number().int().positive() })
  .strict();

/** Native list caps (see `src-tauri/src/candidate_queue_store.rs`). */
export const CANDIDATE_LIST_LIMIT = 500;
export const DISCOVERY_LIST_LIMIT = 200;

const rowIdSchema = z.number().int().positive();

/** Native `linkgo_candidate_list` row: a candidate joined with its target. */
export const candidateWithTargetRowSchema = z
  .object({
    id: rowIdSchema,
    campaign_id: rowIdSchema,
    target_post_id: rowIdSchema,
    source_keyword: z.string(),
    status: candidateStatusSchema,
    relevance_score: z.number().int().min(0).max(100).nullable(),
    score_reason: z.string(),
    notes: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    campaign_name: z.string(),
    target_id: rowIdSchema,
    target_platform: candidatePlatformSchema,
    target_url: z.string(),
    target_normalized_url: z.string(),
    target_platform_resource_urn: z.string(),
    target_author_name: z.string(),
    target_author_profile_url: z.string(),
    target_posted_at: z.string().nullable(),
    target_content: z.string(),
    target_content_hash: z.string(),
    target_created_at: z.string(),
    target_updated_at: z.string(),
  })
  .strict();

export const candidateWithTargetRowListSchema = z
  .array(candidateWithTargetRowSchema)
  .max(CANDIDATE_LIST_LIMIT);

/**
 * Native `linkgo_candidate_list` result: the capped rows plus `totalCount`,
 * the number of candidates matching the filter before the cap.
 */
export const candidateListPageSchema = z.strictObject({
  rows: candidateWithTargetRowListSchema,
  totalCount: z.number().int().nonnegative(),
});

/** Native discovery-item row (list and `research_posts` insert results). */
export const candidateDiscoveryItemRowSchema = z
  .object({
    id: rowIdSchema,
    campaign_id: rowIdSchema,
    agent_run_id: rowIdSchema.nullable(),
    workflow_run_id: rowIdSchema.nullable(),
    kind: candidateDiscoveryKindSchema,
    title: z.string(),
    keyword: z.string(),
    rationale: z.string(),
    source_keyword: z.string(),
    confidence_score: z.number().int().min(0).max(100).nullable(),
    status: candidateDiscoveryStatusSchema,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export const candidateDiscoveryItemListSchema = z
  .array(candidateDiscoveryItemRowSchema)
  .max(DISCOVERY_LIST_LIMIT);

/** Native `linkgo_candidate_agent_run_context` result. */
export const candidateAgentRunContextSchema = z
  .object({
    seedKeywords: z.array(z.string()).max(12),
    scoringCandidateIds: z.array(rowIdSchema).max(50),
  })
  .strict();

/** Address of the Ideas screen (`#/queue`). See docs/features/navigation.md. */
export const candidateQueueRoute = defineRoute("queue", emptyRouteSearch());
