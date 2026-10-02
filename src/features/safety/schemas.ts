import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

const positiveIdSchema = z.number().int().positive();

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

export const globalKillSwitchResultSchema = z
  .object({ enabled: z.boolean(), reason: z.string() })
  .strict();

/** Native `linkgo_safety_settings_get` result (and dashboard settings). */
export const safetySettingsSchema = z
  .object({
    id: z.literal(1),
    global_kill_switch: z.number().int().min(0).max(1),
    kill_switch_reason: z.string(),
    updated_at: z.string(),
  })
  .strict();

const DASHBOARD_LIST_LIMIT = 50;
const nullableIdSchema = positiveIdSchema.nullable();
const countSchema = z.number().int().nonnegative();

const errorQueueItemSchema = z
  .object({
    id: positiveIdSchema,
    campaign_id: nullableIdSchema,
    source_type: z.enum([
      "approval",
      "publish_attempt",
      "schedule_job",
      "agent_run",
      "workflow_run",
      "manual",
    ]),
    source_id: nullableIdSchema,
    title: z.string(),
    detail: z.string(),
    severity: z.enum(["warning", "error", "critical"]),
    status: errorQueueStatusSchema,
    resolution_notes: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    campaign_name: z.string().nullable(),
    campaign_status: z.string().nullable(),
  })
  .strict();

const rateLimitEventSchema = z
  .object({
    id: positiveIdSchema,
    campaign_id: positiveIdSchema,
    action: z.enum(["schedule_post", "publish_post", "comment", "agent_run"]),
    window_key: z.string(),
    limit_value: countSchema,
    current_count: countSchema,
    decision: z.enum(["allowed", "blocked"]),
    summary: z.string(),
    created_at: z.string(),
  })
  .strict();

const safetyAuditEventSchema = z
  .object({
    id: positiveIdSchema,
    campaign_id: nullableIdSchema,
    subject_type: z.enum([
      "campaign",
      "approval",
      "schedule_job",
      "publish_attempt",
      "agent_run",
      "workflow_run",
      "error_queue_item",
      "safety_settings",
    ]),
    subject_id: z.number().int().nullable(),
    event_type: z.enum([
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
    ]),
    severity: z.enum(["info", "warning", "block"]),
    summary: z.string(),
    metadata_json: z.string(),
    created_at: z.string(),
  })
  .strict();

export const safetyDashboardCampaignIdSchema = positiveIdSchema.optional();

/** Native `linkgo_safety_dashboard_get` result; lists are capped at 50. */
export const safetyDashboardSchema = z
  .object({
    settings: safetySettingsSchema,
    summary: z
      .object({
        openErrors: countSchema,
        blockedToday: countSchema,
        allowedToday: countSchema,
        auditEvents: countSchema,
      })
      .strict(),
    errorQueueItems: z.array(errorQueueItemSchema).max(DASHBOARD_LIST_LIMIT),
    rateLimitEvents: z.array(rateLimitEventSchema).max(DASHBOARD_LIST_LIMIT),
    auditEvents: z.array(safetyAuditEventSchema).max(DASHBOARD_LIST_LIMIT),
  })
  .strict();

export const errorQueueItemStatusResultSchema = z
  .object({
    id: positiveIdSchema,
    previousStatus: errorQueueStatusSchema,
    status: errorQueueStatusSchema,
  })
  .strict();

/** Address of the Safety screen (`#/safety`). See docs/features/navigation.md. */
export const safetyRoute = defineRoute("safety", emptyRouteSearch());
