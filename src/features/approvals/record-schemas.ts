import { z } from "zod";

/**
 * Strict shapes returned by the native approval read commands
 * (`src-tauri/src/approval_reads.rs`). Lists are capped to the native limits.
 */

export const APPROVAL_LIST_LIMIT = 500;
export const ELIGIBLE_DRAFT_LIMIT = 200;

const idSchema = z.number().int().positive();
const approvalStatusSchema = z.enum([
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
  "scheduled",
  "published",
  "cancelled",
]);
const draftStatusSchema = z.enum([
  "drafting",
  "needs_revision",
  "ready_for_review",
  "archived",
]);
const campaignStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
const variantStatusSchema = z.enum(["draft", "selected", "rejected"]);

const draftSnapshotShape = {
  campaign_id: idSchema,
  draft_id: idSchema,
  draft_variant_id: idSchema,
  draft_candidate_post_id: idSchema,
  draft_angle: z.string(),
  draft_notes: z.string(),
  draft_status: draftStatusSchema,
  campaign_name: z.string(),
  campaign_status: campaignStatusSchema,
  candidate_source_keyword: z.string(),
  target_url: z.string(),
  target_author_name: z.string(),
  target_author_profile_url: z.string(),
  target_content: z.string(),
  variant_number: z.number().int().positive(),
  variant_hook: z.string(),
  variant_body: z.string(),
  variant_cta: z.string(),
  variant_hashtags: z.string(),
  variant_status: variantStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
};

const draftSnapshotRowSchema = z.strictObject(draftSnapshotShape);

const approvalDetailRowSchema = z.strictObject({
  ...draftSnapshotShape,
  id: idSchema,
  status: approvalStatusSchema,
  reviewed_content_revision: z.number().int().positive().nullable(),
  current_content_revision: z.number().int().positive(),
  readiness: z.union([z.literal(0), z.literal(1)]),
  reviewer_notes: z.string(),
  approved_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
});

const scheduleJobRowSchema = z.strictObject({
  id: idSchema,
  approval_id: idSchema,
  platform: z.literal("linkedin"),
  scheduled_for: z.string(),
  timezone: z.string(),
  status: z.enum(["scheduled", "cancelled", "completed", "failed"]),
  idempotency_key: z.string(),
  attempt_count: z.number().int().nonnegative(),
  max_attempts: z.number().int().nonnegative(),
  next_attempt_at: z.string().nullable(),
  last_attempted_at: z.string().nullable(),
  last_error: z.string(),
  locked_at: z.string().nullable(),
  locked_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const publishAttemptRowSchema = z.strictObject({
  id: idSchema,
  approval_id: idSchema,
  schedule_job_id: idSchema.nullable(),
  platform: z.literal("linkedin"),
  status: z.enum(["succeeded", "failed"]),
  external_post_url: z.string(),
  platform_post_id: z.string(),
  error_message: z.string(),
  created_at: z.string(),
});

const draftAuditRowSchema = z.strictObject({
  id: idSchema,
  draft_variant_id: idSchema,
  rule_key: z.string(),
  severity: z.enum(["pass", "warning", "block"]),
  message: z.string(),
  created_at: z.string(),
});

export const approvalListSnapshotSchema = z.strictObject({
  rows: z.array(approvalDetailRowSchema).max(APPROVAL_LIST_LIMIT),
  scheduleJobs: z.array(scheduleJobRowSchema),
  publishAttempts: z.array(publishAttemptRowSchema),
  linkedAgentRunCounts: z.array(
    z.strictObject({
      approval_id: idSchema,
      count: z.number().int().positive(),
    }),
  ),
  audits: z.array(draftAuditRowSchema),
});

export const eligibleDraftsSnapshotSchema = z.strictObject({
  rows: z.array(draftSnapshotRowSchema).max(ELIGIBLE_DRAFT_LIMIT),
  audits: z.array(draftAuditRowSchema),
});

export type ApprovalListSnapshot = z.infer<typeof approvalListSnapshotSchema>;
export type ApprovalDetailRow = ApprovalListSnapshot["rows"][number];
export type DraftSnapshotRow = z.infer<typeof draftSnapshotRowSchema>;
export type DraftAuditRecord = z.infer<typeof draftAuditRowSchema>;
