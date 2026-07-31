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

export const draftPostInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    candidatePostId: positiveIdSchema,
    variantCount: z.number().int().min(1).max(5).default(3),
    angle: optionalTextSchema,
    voiceNotes: optionalTextSchema,
  })
  .strict();

export const draftPostOutputSchema = z
  .object({
    variants: z
      .array(
        z
          .object({
            hook: z.string().trim().min(1).max(280),
            body: z.string().trim().min(1).max(2500),
            cta: z.string().trim().max(240).default(""),
            hashtags: z.array(z.string().trim().min(1).max(40)).max(5),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    summary: summarySchema,
  })
  .strict();

export const auditPostInputSchema = z
  .object({
    campaignId: positiveIdSchema,
    draftVariantId: positiveIdSchema.optional(),
    text: z.string().trim().min(1).max(3000),
    rules: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict();

export const auditPostOutputSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            ruleKey: z.string().trim().min(1).max(80),
            severity: z.enum(["pass", "warning", "block"]),
            message: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .max(20),
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
  schedule_post: schedulePostInputSchema,
  collect_metrics: collectMetricsInputSchema,
} as const;

export const agentToolOutputSchemas = {
  research_posts: researchPostsOutputSchema,
  score_relevance: scoreRelevanceOutputSchema,
  draft_post: draftPostOutputSchema,
  audit_post: auditPostOutputSchema,
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
export type SchedulePostInput = z.infer<typeof schedulePostInputSchema>;
export type SchedulePostOutput = z.infer<typeof schedulePostOutputSchema>;
export type CollectMetricsInput = z.infer<typeof collectMetricsInputSchema>;
export type CollectMetricsOutput = z.infer<typeof collectMetricsOutputSchema>;
