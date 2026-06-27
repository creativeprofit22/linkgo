import { z } from "zod";

const positiveIdSchema = z.number().int().positive();
const optionalPositiveIdSchema = positiveIdSchema.nullish();
const summarySchema = z.string().trim().min(1).max(1000);
const detailSchema = z.string().trim().max(4000).default("");

export const safetyAuditSubjectTypeSchema = z.enum([
  "campaign",
  "approval",
  "schedule_job",
  "publish_attempt",
  "agent_run",
  "workflow_run",
  "error_queue_item",
  "safety_settings",
]);

export const safetyAuditEventTypeSchema = z.enum([
  "kill_switch_enabled",
  "kill_switch_disabled",
  "schedule_allowed",
  "schedule_blocked",
  "schedule_cancelled",
  "publish_succeeded",
  "publish_failed",
  "approval_rejected",
  "agent_run_started",
  "agent_run_failed",
  "error_item_created",
  "error_item_updated",
]);

export const safetyAuditSeveritySchema = z.enum(["info", "warning", "block"]);

export const rateLimitActionSchema = z.enum([
  "schedule_post",
  "publish_post",
  "comment",
  "agent_run",
]);

export const rateLimitDecisionSchema = z.enum(["allowed", "blocked"]);

export const errorQueueSourceTypeSchema = z.enum([
  "approval",
  "publish_attempt",
  "schedule_job",
  "agent_run",
  "workflow_run",
  "manual",
]);

export const errorQueueSeveritySchema = z.enum([
  "warning",
  "error",
  "critical",
]);

export const errorQueueStatusSchema = z.enum([
  "open",
  "in_progress",
  "awaiting_review",
  "resolved",
  "failed",
]);

export const setGlobalKillSwitchSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(1000).default(""),
});

export const setErrorQueueItemStatusSchema = z.object({
  id: positiveIdSchema,
  status: errorQueueStatusSchema,
  resolutionNotes: z.string().trim().max(2000).default(""),
});

export const recordSafetyAuditEventSchema = z.object({
  campaignId: optionalPositiveIdSchema,
  subjectType: safetyAuditSubjectTypeSchema,
  subjectId: optionalPositiveIdSchema,
  eventType: safetyAuditEventTypeSchema,
  severity: safetyAuditSeveritySchema.default("info"),
  summary: summarySchema,
  metadata: z.unknown().default({}),
});

export const recordRateLimitEventSchema = z.object({
  campaignId: positiveIdSchema,
  action: rateLimitActionSchema,
  windowKey: z.string().trim().min(1).max(120),
  limitValue: z.number().int().min(0),
  currentCount: z.number().int().min(0),
  decision: rateLimitDecisionSchema,
  summary: summarySchema,
});

export const upsertErrorQueueItemSchema = z.object({
  campaignId: optionalPositiveIdSchema,
  sourceType: errorQueueSourceTypeSchema,
  sourceId: optionalPositiveIdSchema,
  title: z.string().trim().min(1).max(200),
  detail: detailSchema,
  severity: errorQueueSeveritySchema.default("error"),
});

export const assertSafetyKillSwitchOffSchema = z.object({
  campaignId: optionalPositiveIdSchema,
  subjectType: safetyAuditSubjectTypeSchema,
  subjectId: optionalPositiveIdSchema,
  summary: summarySchema,
});

export const assertSchedulePostLimitSchema = z.object({
  campaignId: positiveIdSchema,
  scheduledFor: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Schedule date must be valid",
    }),
  approvalId: positiveIdSchema.optional(),
  limitValue: z.number().int().min(0).optional(),
});

export const assertCommentLimitSchema = z.object({
  campaignId: positiveIdSchema,
  commentedAt: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Comment date must be valid",
    })
    .optional(),
  commentThreadId: positiveIdSchema.optional(),
  limitValue: z.number().int().min(0).optional(),
});
