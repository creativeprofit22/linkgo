import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

export const schedulerSettingsPayloadSchema = z.object({
  enabled: z.boolean(),
  pollIntervalSeconds: z.number().int().min(15).max(3600),
  maxJobsPerTick: z.number().int().min(1).max(10),
  retryBackoffMinutes: z.number().int().min(1).max(1440),
  updatedAt: z.string(),
});

export const schedulerStatusPayloadSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  runnerId: z.string().nullable().optional().default(null),
  settings: schedulerSettingsPayloadSchema,
});

export const schedulerTickResultSchema = z.object({
  claimed: z.number().int().min(0).default(0),
  published: z.number().int().min(0).default(0),
  retryScheduled: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
  blocked: z.number().int().min(0).default(0),
});

/** Caps mirror the native `linkgo_scheduler_dashboard_get` LIMITs. */
export const SCHEDULER_DUE_JOBS_LIMIT = 20;
export const SCHEDULER_EVENTS_LIMIT = 50;
export const SCHEDULER_ATTEMPTS_LIMIT = 25;

const idSchema = z.number().int().positive();
const countSchema = z.number().int().min(0);

export const schedulerDashboardCampaignIdSchema = idSchema.optional();

export const schedulerSettingsRowSchema = z
  .object({
    id: z.literal(1),
    enabled: z.number().int().min(0).max(1),
    poll_interval_seconds: z.number().int().min(15).max(3600),
    max_jobs_per_tick: z.number().int().min(1).max(10),
    retry_backoff_minutes: z.number().int().min(1).max(1440),
    updated_at: z.string(),
  })
  .strict();

export const dueScheduleCardItemSchema = z
  .object({
    id: idSchema,
    approval_id: idSchema,
    platform: z.literal("linkedin"),
    scheduled_for: z.string(),
    timezone: z.string(),
    status: z.enum(["scheduled", "cancelled", "completed", "failed"]),
    idempotency_key: z.string(),
    attempt_count: countSchema,
    max_attempts: countSchema,
    next_attempt_at: z.string().nullable(),
    last_attempted_at: z.string().nullable(),
    last_error: z.string(),
    locked_at: z.string().nullable(),
    locked_by: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    campaign_id: idSchema,
    approval_status: z.string(),
    campaign_name: z.string(),
    campaign_status: z.string(),
    variant_hook: z.string(),
  })
  .strict();

export const schedulerEventSchema = z
  .object({
    id: idSchema,
    campaign_id: idSchema.nullable(),
    approval_id: idSchema.nullable(),
    schedule_job_id: idSchema.nullable(),
    event_type: z.enum([
      "scheduler_started",
      "scheduler_stopped",
      "tick_started",
      "tick_completed",
      "job_claimed",
      "job_blocked",
      "job_published",
      "job_retry_scheduled",
      "job_failed",
    ]),
    severity: z.enum(["info", "warning", "error"]),
    summary: z.string(),
    metadata_json: z.string(),
    created_at: z.string(),
    campaign_name: z.string().nullable(),
  })
  .strict();

export const schedulerPublishAttemptSchema = z
  .object({
    id: idSchema,
    approval_id: idSchema,
    schedule_job_id: idSchema.nullable(),
    platform: z.literal("linkedin"),
    status: z.enum(["succeeded", "failed"]),
    external_post_url: z.string(),
    platform_post_id: z.string(),
    error_message: z.string(),
    created_at: z.string(),
    campaign_id: idSchema.nullable(),
    campaign_name: z.string().nullable(),
    variant_hook: z.string(),
  })
  .strict();

export const schedulerDashboardSchema = z
  .object({
    settings: schedulerSettingsRowSchema,
    summary: z
      .object({
        pendingJobs: countSchema,
        dueJobs: countSchema,
        failedJobs: countSchema,
        recentAttempts: countSchema,
      })
      .strict(),
    dueJobs: z.array(dueScheduleCardItemSchema).max(SCHEDULER_DUE_JOBS_LIMIT),
    recentEvents: z.array(schedulerEventSchema).max(SCHEDULER_EVENTS_LIMIT),
    recentAttempts: z
      .array(schedulerPublishAttemptSchema)
      .max(SCHEDULER_ATTEMPTS_LIMIT),
    globalKillSwitchEnabled: z.boolean(),
    killSwitchReason: z.string(),
  })
  .strict();

/** Address of the Auto-posting screen (`#/scheduler`). See docs/features/navigation.md. */
export const schedulerRoute = defineRoute("scheduler", emptyRouteSearch());
