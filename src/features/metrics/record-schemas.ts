import { z } from "zod";

/**
 * Strict shapes returned by the native metrics read commands
 * (`src-tauri/src/metrics_reads.rs`). Lists are capped to native limits.
 */

export const METRICS_LIST_LIMIT = 500;
const REFRESH_EVENTS_LIMIT = 20;

const idSchema = z.number().int().positive();
const countSchema = z.number().int().nonnegative();
const campaignStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
const approvalStatusSchema = z.enum([
  "needs_review",
  "changes_requested",
  "approved",
  "rejected",
  "scheduled",
  "published",
  "cancelled",
]);

const snapshotShape = {
  campaign_name: z.string(),
  campaign_status: campaignStatusSchema,
  approval_status: approvalStatusSchema,
  draft_id: idSchema,
  draft_angle: z.string(),
  draft_notes: z.string(),
  variant_id: idSchema,
  variant_number: z.number().int().positive(),
  variant_hook: z.string(),
  variant_body: z.string(),
  variant_cta: z.string(),
  variant_hashtags: z.string(),
  variant_status: z.enum(["draft", "selected", "rejected"]),
  target_author_name: z.string(),
  target_author_profile_url: z.string(),
  target_content: z.string(),
  target_url: z.string(),
};

export const metricEligibleApprovalListSchema = z
  .array(
    z.strictObject({
      ...snapshotShape,
      campaign_id: idSchema,
      approval_id: idSchema,
      publish_attempt_id: idSchema,
      publish_external_post_url: z.string(),
      publish_platform_post_id: z.string(),
      publish_created_at: z.string(),
    }),
  )
  .max(METRICS_LIST_LIMIT);

export const postMetricDetailListSchema = z
  .array(
    z.strictObject({
      ...snapshotShape,
      id: idSchema,
      campaign_id: idSchema,
      approval_id: idSchema,
      publish_attempt_id: idSchema.nullable(),
      platform: z.literal("linkedin"),
      measured_at: z.string(),
      impressions: countSchema,
      reactions: countSchema,
      comments: countSchema,
      reposts: countSchema,
      profile_visits: countSchema,
      link_clicks: countSchema,
      ctr: z.number().min(0).max(100).nullable(),
      notes: z.string(),
      collection_source: z.enum(["manual", "linkedin_social_metadata"]),
      raw_payload_json: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      publish_external_post_url: z.string().nullable(),
      publish_platform_post_id: z.string().nullable(),
      publish_created_at: z.string().nullable(),
    }),
  )
  .max(METRICS_LIST_LIMIT);

export const campaignMemoryListSchema = z
  .array(
    z.strictObject({
      id: idSchema,
      campaign_id: idSchema,
      post_metric_id: idSchema.nullable(),
      signal: z.enum(["winner", "underperformer", "insight", "avoid"]),
      summary: z.string(),
      evidence: z.string(),
      confidence: z.number().int().min(0).max(100),
      status: z.enum(["active", "archived"]),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  )
  .max(METRICS_LIST_LIMIT);

export const learningEventListSchema = z
  .array(
    z.strictObject({
      id: idSchema,
      campaign_id: idSchema,
      post_metric_id: idSchema.nullable(),
      campaign_memory_id: idSchema.nullable(),
      event_type: z.enum([
        "metric_recorded",
        "memory_created",
        "memory_archived",
        "memory_restored",
      ]),
      summary: z.string(),
      created_at: z.string(),
    }),
  )
  .max(METRICS_LIST_LIMIT);

const refreshJobSchema = z.strictObject({
  id: idSchema,
  campaign_id: idSchema,
  approval_id: idSchema,
  publish_attempt_id: idSchema.nullable(),
  platform: z.literal("linkedin"),
  target_urn: z.string(),
  status: z.enum(["active", "paused", "unavailable", "failed"]),
  next_refresh_at: z.string(),
  last_refreshed_at: z.string().nullable(),
  last_attempted_at: z.string().nullable(),
  attempt_count: countSchema,
  max_attempts: countSchema,
  failure_count: countSchema,
  last_error: z.string(),
  locked_at: z.string().nullable(),
  locked_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const refreshEventSchema = z.strictObject({
  id: idSchema,
  campaign_id: idSchema.nullable(),
  approval_id: idSchema.nullable(),
  metric_refresh_job_id: idSchema.nullable(),
  post_metric_id: idSchema.nullable(),
  event_type: z.enum([
    "refresh_started",
    "refresh_completed",
    "refresh_retry_scheduled",
    "refresh_unavailable",
    "refresh_failed",
    "refresh_blocked",
    "worker_started",
    "worker_stopped",
    "tick_started",
    "tick_completed",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  summary: z.string(),
  metadata_json: z.string(),
  created_at: z.string(),
});

export const metricRefreshDashboardRecordSchema = z.strictObject({
  settings: z
    .strictObject({
      id: z.literal(1),
      enabled: z.number().int().min(0).max(1),
      poll_interval_minutes: countSchema,
      max_jobs_per_tick: countSchema,
      refresh_interval_hours: countSchema,
      retry_backoff_minutes: countSchema,
      updated_at: z.string(),
    })
    .nullable(),
  jobs: z.array(refreshJobSchema).max(METRICS_LIST_LIMIT),
  events: z.array(refreshEventSchema).max(REFRESH_EVENTS_LIMIT),
  summary: z.strictObject({
    totalJobs: countSchema,
    activeJobs: countSchema,
    dueJobs: countSchema,
    unavailableJobs: countSchema,
    failedJobs: countSchema,
    apiSnapshots: countSchema,
  }),
});
