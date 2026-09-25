import { z } from "zod";

const metricCountSchema = z.number().int().min(0).max(1_000_000_000);
const positiveIdSchema = z.number().int().positive();
const optionalPositiveIdSchema = positiveIdSchema.optional();

export const memorySignalSchema = z.enum([
  "winner",
  "underperformer",
  "insight",
  "avoid",
]);

export const campaignMemoryStatusSchema = z.enum(["active", "archived"]);

export const metricCollectionSourceSchema = z.enum([
  "manual",
  "linkedin_social_metadata",
]);

export const metricRefreshJobStatusSchema = z.enum([
  "active",
  "paused",
  "unavailable",
  "failed",
]);

export const metricRefreshEventTypeSchema = z.enum([
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
]);

export const metricRefreshEventSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
]);

export const nativeMetricRefreshSettingsSchema = z.object({
  enabled: z.boolean(),
  pollIntervalMinutes: z.number().int().min(15).max(1440),
  maxJobsPerTick: z.number().int().min(1).max(20),
  refreshIntervalHours: z.number().int().min(1).max(168),
  retryBackoffMinutes: z.number().int().min(5).max(1440),
  updatedAt: z.string(),
});

export const nativeMetricRefreshStatusSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  runnerId: z.string().nullable().optional(),
  settings: nativeMetricRefreshSettingsSchema,
});

export const nativeMetricRefreshTickResultSchema = z.object({
  claimed: z.number().int().min(0),
  refreshed: z.number().int().min(0),
  retryScheduled: z.number().int().min(0),
  unavailable: z.number().int().min(0),
  failed: z.number().int().min(0),
  blocked: z.number().int().min(0),
  seeded: z.number().int().min(0),
});

export const metricRefreshSettingsSchema = z.object({
  id: z.literal(1),
  enabled: z.number().int().min(0).max(1),
  poll_interval_minutes: z.number().int().min(15).max(1440),
  max_jobs_per_tick: z.number().int().min(1).max(20),
  refresh_interval_hours: z.number().int().min(1).max(168),
  retry_backoff_minutes: z.number().int().min(5).max(1440),
  updated_at: z.string(),
});

export const metricRefreshJobSchema = z.object({
  id: positiveIdSchema,
  campaign_id: positiveIdSchema,
  approval_id: positiveIdSchema,
  publish_attempt_id: positiveIdSchema.nullable(),
  platform: z.literal("linkedin"),
  target_urn: z.string(),
  status: metricRefreshJobStatusSchema,
  next_refresh_at: z.string(),
  last_refreshed_at: z.string().nullable(),
  last_attempted_at: z.string().nullable(),
  attempt_count: z.number().int().min(0),
  max_attempts: z.number().int().min(1),
  failure_count: z.number().int().min(0),
  last_error: z.string(),
  locked_at: z.string().nullable(),
  locked_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const metricRefreshEventSchema = z.object({
  id: positiveIdSchema,
  campaign_id: positiveIdSchema.nullable(),
  approval_id: positiveIdSchema.nullable(),
  metric_refresh_job_id: positiveIdSchema.nullable(),
  post_metric_id: positiveIdSchema.nullable(),
  event_type: metricRefreshEventTypeSchema,
  severity: metricRefreshEventSeveritySchema,
  summary: z.string(),
  metadata_json: z.string(),
  created_at: z.string(),
});

export const learningEventTypeSchema = z.enum([
  "metric_recorded",
  "memory_created",
  "memory_archived",
  "memory_restored",
]);

export const recordPostMetricSchema = z.object({
  campaignId: positiveIdSchema,
  approvalId: positiveIdSchema,
  publishAttemptId: optionalPositiveIdSchema,
  measuredAt: z
    .string()
    .trim()
    .max(80)
    .refine((value) => Number.isFinite(Date.parse(value)), {
      message: "Measured time must be a valid date",
    }),
  impressions: metricCountSchema,
  reactions: metricCountSchema,
  comments: metricCountSchema,
  reposts: metricCountSchema,
  profileVisits: metricCountSchema,
  linkClicks: metricCountSchema,
  ctr: z.number().min(0).max(100).nullable().optional().default(null),
  notes: z.string().trim().max(1000).default(""),
});

export const createCampaignMemorySchema = z.object({
  campaignId: positiveIdSchema,
  postMetricId: optionalPositiveIdSchema,
  signal: memorySignalSchema,
  summary: z.string().trim().min(1, "Summary is required").max(500),
  evidence: z.string().trim().max(1000).default(""),
  confidence: z.number().int().min(0).max(100).default(50),
});

export const setCampaignMemoryStatusSchema = z.object({
  id: positiveIdSchema,
  status: campaignMemoryStatusSchema,
});

/** Native result of the metrics mutation commands: the affected row id. */
export const metricsMutationResultSchema = z
  .object({ id: positiveIdSchema })
  .strict();
