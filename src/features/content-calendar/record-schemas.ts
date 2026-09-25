import { z } from "zod";

/**
 * Strict shapes returned by the native content-calendar commands
 * (`src-tauri/src/content_calendar.rs`). Lists are capped to native limits.
 */

export const CALENDAR_SLOT_LIMIT = 500;
export const CALENDAR_ELIGIBLE_LIMIT = 200;

const idSchema = z.number().int().positive();

const approvalSnapshotShape = {
  approval_id: idSchema,
  campaign_id: idSchema,
  approval_status: z.enum([
    "needs_review",
    "changes_requested",
    "approved",
    "rejected",
    "scheduled",
    "published",
    "cancelled",
  ]),
  approval_reviewer_notes: z.string(),
  approval_approved_at: z.string().nullable(),
  campaign_name: z.string(),
  campaign_status: z.enum(["draft", "active", "paused", "archived"]),
  draft_id: idSchema,
  draft_angle: z.string(),
  draft_notes: z.string(),
  candidate_post_id: idSchema,
  candidate_source_keyword: z.string(),
  target_url: z.string(),
  target_author_name: z.string(),
  target_author_profile_url: z.string(),
  target_content: z.string(),
  variant_id: idSchema,
  variant_number: z.number().int().positive(),
  variant_hook: z.string(),
  variant_body: z.string(),
  variant_cta: z.string(),
  variant_hashtags: z.string(),
  schedule_job_id: idSchema.nullable(),
  schedule_scheduled_for: z.string().nullable(),
  schedule_timezone: z.string().nullable(),
  schedule_status: z
    .enum(["scheduled", "cancelled", "completed", "failed"])
    .nullable(),
  schedule_attempt_count: z.number().int().nonnegative().nullable(),
  schedule_last_error: z.string().nullable(),
  schedule_updated_at: z.string().nullable(),
};

const slotDetailRowSchema = z.strictObject({
  ...approvalSnapshotShape,
  id: idSchema,
  purpose: z.enum(["reach", "trust", "proof", "conversion", "community"]),
  slot_for: z.string(),
  timezone: z.string(),
  format: z.enum([
    "text",
    "image",
    "carousel",
    "document",
    "video",
    "poll",
    "event",
  ]),
  angle: z.string(),
  visual_direction: z.string(),
  cta: z.string(),
  notes: z.string(),
  status: z.enum(["planned", "archived"]),
  created_at: z.string(),
  updated_at: z.string(),
  publish_attempt_id: idSchema.nullable(),
  publish_status: z.enum(["succeeded", "failed"]).nullable(),
  publish_external_post_url: z.string().nullable(),
  publish_platform_post_id: z.string().nullable(),
  publish_error_message: z.string().nullable(),
  publish_created_at: z.string().nullable(),
});

const draftAuditRowSchema = z.strictObject({
  id: idSchema,
  draft_variant_id: idSchema,
  rule_key: z.string(),
  severity: z.enum(["pass", "warning", "block"]),
  message: z.string(),
  created_at: z.string(),
});

export const calendarSlotListSchema = z.strictObject({
  rows: z.array(slotDetailRowSchema).max(CALENDAR_SLOT_LIMIT),
  audits: z.array(draftAuditRowSchema),
});

export const calendarEligibleApprovalsSchema = z.strictObject({
  rows: z
    .array(z.strictObject(approvalSnapshotShape))
    .max(CALENDAR_ELIGIBLE_LIMIT),
  audits: z.array(draftAuditRowSchema),
});

/** Native schedule preflight: what to pass to the approval scheduler. */
export const calendarScheduleTargetSchema = z.strictObject({
  approvalId: idSchema,
  scheduledFor: z.string(),
  timezone: z.string(),
});

export type CalendarSlotDetailRow = z.infer<typeof slotDetailRowSchema>;
export type CalendarApprovalSnapshotRow = z.infer<
  typeof calendarEligibleApprovalsSchema
>["rows"][number];
export type CalendarDraftAuditRow = z.infer<typeof draftAuditRowSchema>;
