import { DRAFT_CONTENT_INTENTS } from "@/features/drafts/types";
import { z } from "zod";
import {
  AGENT_PROVIDER_KEYS,
  AGENT_ROLES,
  AGENT_RUN_EVENT_TYPES,
  AGENT_RUN_STATUSES,
  AGENT_TOOL_CALL_STATUSES,
  AGENT_TOOL_NAMES,
} from "@/agent/types";

const positiveIdSchema = z.number().int().positive();
const optionalTextSchema = z.string().trim().max(1000).optional();
const summarySchema = z.string().trim().max(1000).default("");

export const agentToolNameSchema = z.enum(AGENT_TOOL_NAMES);
export const agentRoleSchema = z.enum(AGENT_ROLES);
export const agentProviderKeySchema = z.enum(AGENT_PROVIDER_KEYS);
export const agentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export const agentToolCallStatusSchema = z.enum(AGENT_TOOL_CALL_STATUSES);
export const agentRunEventTypeSchema = z.enum(AGENT_RUN_EVENT_TYPES);

const basicAgentMessageSchema = z
  .object({
    role: z.enum(["system", "user"]),
    content: z.string(),
  })
  .strict();

const assistantTextMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: z.string(),
  })
  .strict();

const assistantToolCallMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: z.string(),
    toolName: agentToolNameSchema,
    providerToolCallId: z.string().trim().min(1),
  })
  .strict();

const toolResultMessageSchema = z
  .object({
    role: z.literal("tool"),
    content: z.string(),
    toolName: agentToolNameSchema,
    providerToolCallId: z.string().trim().min(1),
  })
  .strict();

export const agentMessageSchema = z.union([
  basicAgentMessageSchema,
  assistantTextMessageSchema,
  assistantToolCallMessageSchema,
  toolResultMessageSchema,
]);

export const agentConversationSchema = z
  .array(agentMessageSchema)
  .superRefine((messages, context) => {
    const assistantToolCalls = new Map<
      string,
      { toolName: z.infer<typeof agentToolNameSchema>; resultSeen: boolean }
    >();

    messages.forEach((message, index) => {
      if (message.role === "assistant" && "providerToolCallId" in message) {
        if (assistantToolCalls.has(message.providerToolCallId)) {
          context.addIssue({
            code: "custom",
            message: `Assistant tool call ID "${message.providerToolCallId}" is duplicated`,
            path: [index, "providerToolCallId"],
          });
          return;
        }
        assistantToolCalls.set(message.providerToolCallId, {
          toolName: message.toolName,
          resultSeen: false,
        });
        return;
      }

      if (message.role !== "tool") return;
      const assistantToolCall = assistantToolCalls.get(
        message.providerToolCallId,
      );
      if (assistantToolCall === undefined) {
        context.addIssue({
          code: "custom",
          message: `Tool result ID "${message.providerToolCallId}" does not match a preceding assistant tool call`,
          path: [index, "providerToolCallId"],
        });
        return;
      }
      if (assistantToolCall.resultSeen) {
        context.addIssue({
          code: "custom",
          message: `Tool result ID "${message.providerToolCallId}" is duplicated`,
          path: [index, "providerToolCallId"],
        });
      }
      if (assistantToolCall.toolName !== message.toolName) {
        context.addIssue({
          code: "custom",
          message: `Tool result ID "${message.providerToolCallId}" does not match the preceding ${assistantToolCall.toolName} call`,
          path: [index, "toolName"],
        });
      }
      assistantToolCall.resultSeen = true;
    });
  });

export const discoveryToolSuggestionSchema = z
  .object({
    kind: z.enum(["keyword", "trend", "source_prompt"]),
    title: z.string().trim().max(160).default(""),
    keyword: z.string().trim().max(80).default(""),
    rationale: z.string().trim().max(500).default(""),
    sourceKeyword: z.string().trim().max(80).optional().default(""),
    confidenceScore: z.number().int().min(0).max(100).nullable().optional(),
  })
  .strict();

export const scoreToolEvaluationSchema = z
  .object({
    candidatePostId: positiveIdSchema,
    score: z.number().int().min(0).max(100),
    rationale: z.string().trim().min(1).max(500),
  })
  .strict();

export const researchPostsInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    workflowRunId: positiveIdSchema.optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
    maxPosts: z.number().int().min(1).max(25).default(5),
    notes: optionalTextSchema,
    suggestions: z
      .array(discoveryToolSuggestionSchema)
      .max(25)
      .optional()
      .default([]),
  })
  .strict();

export const researchPostsOutputSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(160),
            sourceSummary: z.string().trim().min(1).max(500),
            suggestedAngle: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .max(25),
    discoveryItems: z
      .array(
        z
          .object({
            id: positiveIdSchema,
            kind: z.enum(["keyword", "trend", "source_prompt"]),
            title: z.string().trim().max(160),
            keyword: z.string().trim().max(80),
            rationale: z.string().trim().max(500),
            sourceKeyword: z.string().trim().max(80),
            confidenceScore: z.number().int().min(0).max(100).nullable(),
            status: z.enum(["suggested", "promoted", "dismissed"]),
          })
          .strict(),
      )
      .max(25)
      .default([]),
    summary: summarySchema,
  })
  .strict();

export const scoreRelevanceInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    candidatePostIds: z.array(positiveIdSchema).min(1).max(50),
    minimumScore: z.number().int().min(0).max(100).default(60),
    scores: z.array(scoreToolEvaluationSchema).min(1).max(50),
    autoRejectBelowMinimum: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((input, context) => {
    const candidateIds = new Set<number>();
    for (const [index, candidatePostId] of input.candidatePostIds.entries()) {
      if (candidateIds.has(candidatePostId)) {
        context.addIssue({
          code: "custom",
          path: ["candidatePostIds", index],
          message: "Candidate post IDs must be unique",
        });
      }
      candidateIds.add(candidatePostId);
    }

    const scoreIds = new Set<number>();
    for (const [index, score] of input.scores.entries()) {
      if (scoreIds.has(score.candidatePostId)) {
        context.addIssue({
          code: "custom",
          path: ["scores", index, "candidatePostId"],
          message: "Each candidate must have exactly one score",
        });
      }
      scoreIds.add(score.candidatePostId);
    }

    const missingIds = [...candidateIds].filter((id) => !scoreIds.has(id));
    const foreignIds = [...scoreIds].filter((id) => !candidateIds.has(id));
    if (missingIds.length > 0 || foreignIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["scores"],
        message:
          "Score entries must match the requested candidate post IDs exactly",
      });
    }
  });

export const scoreRelevanceOutputSchema = z
  .object({
    scores: z
      .array(
        z
          .object({
            candidatePostId: positiveIdSchema,
            score: z.number().int().min(0).max(100),
            rationale: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(50),
    summary: summarySchema,
  })
  .strict();

const draftPostVariantSchema = z
  .object({
    hook: z.string().trim().min(1).max(280),
    body: z.string().trim().min(1).max(2500),
    cta: z.string().trim().max(240),
    hashtags: z.array(z.string().trim().min(1).max(40)).max(5),
  })
  .strict();

export const draftPostInputSchema = z
  .object({
    draftGenerationRequestId: positiveIdSchema,
    campaignId: positiveIdSchema,
    candidatePostId: positiveIdSchema,
    variantCount: z.number().int().min(3).max(5).default(3),
    contentIntent: z.enum(DRAFT_CONTENT_INTENTS),
    angle: optionalTextSchema,
    voiceNotes: optionalTextSchema,
    variants: z.array(draftPostVariantSchema).min(3).max(5),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.variants.length !== input.variantCount) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "variants must contain exactly variantCount items",
      });
    }
  });

export const draftPostOutputSchema = z
  .object({
    variants: z.array(draftPostVariantSchema).min(3).max(5),
    summary: summarySchema,
  })
  .strict();

export const AUDIT_POST_TEXT_MAX_LENGTH = 4306;

const AUDIT_POST_TEXT_REQUIRED_MESSAGE =
  "Draft AI audit text must contain at least one non-whitespace character";

export const canonicalAuditTextSchema = z
  .string()
  .min(1, AUDIT_POST_TEXT_REQUIRED_MESSAGE)
  .max(
    AUDIT_POST_TEXT_MAX_LENGTH,
    `Draft AI audit text must not exceed ${AUDIT_POST_TEXT_MAX_LENGTH} characters`,
  )
  .regex(/\S/u, AUDIT_POST_TEXT_REQUIRED_MESSAGE);

export const AUDIT_POST_FINDING_KEYS = [
  "hook",
  "specificity",
  "generic_language",
  "authenticity",
  "clarity",
  "safety",
] as const;

const auditPostFindingSchema = z
  .object({
    ruleKey: z.enum(AUDIT_POST_FINDING_KEYS),
    severity: z.enum(["pass", "warning", "block"]),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

const auditPostFindingsSchema = z
  .array(auditPostFindingSchema)
  .length(AUDIT_POST_FINDING_KEYS.length)
  .superRefine((findings, context) => {
    const findingKeys = new Set(findings.map((finding) => finding.ruleKey));
    if (findingKeys.size !== AUDIT_POST_FINDING_KEYS.length) {
      context.addIssue({
        code: "custom",
        message:
          "findings must contain exactly one entry for each required audit category",
      });
    }
  });

export const auditPostInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    draftVariantId: positiveIdSchema,
    contentRevision: positiveIdSchema,
    auditRunId: positiveIdSchema,
    text: canonicalAuditTextSchema,
    findings: auditPostFindingsSchema,
  })
  .strict();

export const auditPostOutputSchema = z
  .object({
    findings: auditPostFindingsSchema,
    summary: summarySchema,
  })
  .strict();

export const DRAFT_QUALITY_CATEGORY_KEYS = [
  "hook_strength",
  "authenticity",
  "linkedin_fit",
  "specificity",
  "narrative_structure",
] as const;

const draftQualityCategoryScoreSchema = z
  .object({
    categoryKey: z.enum(DRAFT_QUALITY_CATEGORY_KEYS),
    score: z.number().int().min(0).max(100),
    feedback: z.string().trim().min(1).max(1000),
  })
  .strict();

const draftQualityCategoryScoresSchema = z
  .array(draftQualityCategoryScoreSchema)
  .length(DRAFT_QUALITY_CATEGORY_KEYS.length)
  .superRefine((scores, context) => {
    if (
      new Set(scores.map((score) => score.categoryKey)).size !==
      DRAFT_QUALITY_CATEGORY_KEYS.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Exactly one score per quality category is required",
      });
    }
  });

const qualityRewriteSchema = z
  .object({
    hook: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(3000),
    cta: z.string().trim().max(500),
    hashtags: z.string().trim().max(300),
  })
  .strict();

export const scoreDraftQualityInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    draftVariantId: positiveIdSchema,
    qualityRunId: positiveIdSchema,
    attemptId: positiveIdSchema,
    contentRevision: positiveIdSchema,
    hook: z.string().max(500),
    body: z.string().max(3000),
    cta: z.string().max(500),
    hashtags: z.string().max(300),
    threshold: z.literal(70),
    rewriteAllowed: z.boolean(),
    priorCategoryFeedback: z
      .array(
        z
          .object({
            categoryKey: z.enum(DRAFT_QUALITY_CATEGORY_KEYS),
            feedback: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(5),
    categoryScores: draftQualityCategoryScoresSchema,
    rewrite: qualityRewriteSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const overall = Math.round(
      input.categoryScores.reduce((sum, category) => sum + category.score, 0) /
        5,
    );
    const rewriteRequired = overall < input.threshold && input.rewriteAllowed;
    if (rewriteRequired !== (input.rewrite !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["rewrite"],
        message: rewriteRequired
          ? "A complete rewrite is required below threshold"
          : "Rewrite output is not allowed for this score",
      });
    }
  });

export const scoreDraftQualityOutputSchema = z
  .object({
    campaignId: positiveIdSchema,
    draftVariantId: positiveIdSchema,
    qualityRunId: positiveIdSchema,
    attemptId: positiveIdSchema,
    contentRevision: positiveIdSchema,
    categoryScores: draftQualityCategoryScoresSchema,
    rewrite: qualityRewriteSchema.optional(),
    summary: summarySchema,
  })
  .strict();

export const schedulePostInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    approvalId: positiveIdSchema,
    scheduledFor: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(80).default("local"),
  })
  .strict();

export const schedulePostOutputSchema = z
  .object({
    scheduled: z.literal(false),
    approvalId: positiveIdSchema,
    scheduledFor: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(80),
    summary: summarySchema,
  })
  .strict();

export const collectMetricsInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    approvalId: positiveIdSchema,
    publishAttemptId: positiveIdSchema.optional(),
    measuredAt: z.string().trim().min(1).max(120),
  })
  .strict();

export const collectMetricsOutputSchema = z
  .object({
    metricsAvailable: z.literal(false),
    approvalId: positiveIdSchema,
    measuredAt: z.string().trim().min(1).max(120),
    summary: summarySchema,
  })
  .strict();

export const agentToolInputSchemas = {
  research_posts: researchPostsInputSchema,
  score_relevance: scoreRelevanceInputSchema,
  draft_post: draftPostInputSchema,
  audit_post: auditPostInputSchema,
  score_draft_quality: scoreDraftQualityInputSchema,
  schedule_post: schedulePostInputSchema,
  collect_metrics: collectMetricsInputSchema,
} as const;

export const agentToolOutputSchemas = {
  research_posts: researchPostsOutputSchema,
  score_relevance: scoreRelevanceOutputSchema,
  draft_post: draftPostOutputSchema,
  audit_post: auditPostOutputSchema,
  score_draft_quality: scoreDraftQualityOutputSchema,
  schedule_post: schedulePostOutputSchema,
  collect_metrics: collectMetricsOutputSchema,
} as const;

export type ResearchPostsInput = z.infer<typeof researchPostsInputSchema>;
export type ResearchPostsOutput = z.infer<typeof researchPostsOutputSchema>;
export type ScoreRelevanceInput = z.infer<typeof scoreRelevanceInputSchema>;
export type ScoreRelevanceOutput = z.infer<typeof scoreRelevanceOutputSchema>;
export type DraftPostInput = z.infer<typeof draftPostInputSchema>;
export type DraftPostOutput = z.infer<typeof draftPostOutputSchema>;
export type AuditPostInput = z.infer<typeof auditPostInputSchema>;
export type AuditPostOutput = z.infer<typeof auditPostOutputSchema>;
export type ScoreDraftQualityInput = z.infer<
  typeof scoreDraftQualityInputSchema
>;
export type ScoreDraftQualityOutput = z.infer<
  typeof scoreDraftQualityOutputSchema
>;
export type SchedulePostInput = z.infer<typeof schedulePostInputSchema>;
export type SchedulePostOutput = z.infer<typeof schedulePostOutputSchema>;
export type CollectMetricsInput = z.infer<typeof collectMetricsInputSchema>;
export type CollectMetricsOutput = z.infer<typeof collectMetricsOutputSchema>;
