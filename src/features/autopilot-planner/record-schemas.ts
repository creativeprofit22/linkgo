import { z } from "zod";

import { AGENT_RUN_STATUSES } from "@/agent/types";
import { AGENT_PROVIDER_KEYS } from "@/agent/provider-catalog";
import type { AutopilotPlan } from "@/features/autopilot-planner/types";
import {
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STEP_KEYS,
  WORKFLOW_STEP_STATUSES,
} from "@/workflows/types";

/**
 * Strict shape returned by `linkgo_autopilot_planner_dashboard`
 * (`src-tauri/src/planning_reads.rs`): 30 recent plans and 50 recent events.
 */

const idSchema = z.number().int().positive();
const countSchema = z.number().int().nonnegative();
const campaignStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

const planSchema = z.strictObject({
  id: idSchema,
  campaign_id: idSchema,
  source_import_batch_id: idSchema,
  // The column's CHECK only bounds length (1-100); it is not an enum. The
  // previous renderer SQL read it unchecked too. It stays a bounded string
  // here so this feature does not import a private source-imports module.
  source_type: z.custom<AutopilotPlan["source_type"]>(
    (value) =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 100,
  ),
  status: z.enum(["planned", "skipped"]),
  campaign_backlog_item_id: idSchema.nullable(),
  workflow_run_id: idSchema.nullable(),
  candidate_count: countSchema,
  summary: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  campaign_name: z.string(),
  campaign_status: campaignStatusSchema,
  source_batch_status: z
    .enum(["processing", "completed", "completed_with_errors", "failed"])
    .nullable(),
  source_total_count: countSchema.nullable(),
  source_accepted_count: countSchema.nullable(),
  current_candidate_count: countSchema,
  backlog_title: z.string().nullable(),
  backlog_status: z.string().nullable(),
  backlog_work_type: z.string().nullable(),
  workflow_title: z.string().nullable(),
  workflow_status: z.enum(WORKFLOW_RUN_STATUSES).nullable(),
  workflow_current_step_key: z.enum(WORKFLOW_STEP_KEYS).nullable(),
  score_step_status: z.enum(WORKFLOW_STEP_STATUSES).nullable(),
  latest_scorer_run_status: z.enum(AGENT_RUN_STATUSES).nullable(),
  latest_scorer_provider_key: z.enum(AGENT_PROVIDER_KEYS).nullable(),
  latest_scorer_model_name: z.string().nullable(),
});

const eventSchema = z.strictObject({
  id: idSchema,
  campaign_id: idSchema.nullable(),
  source_import_batch_id: idSchema.nullable(),
  autopilot_plan_id: idSchema.nullable(),
  event_type: z.enum([
    "planner_started",
    "planner_stopped",
    "tick_started",
    "tick_completed",
    "tick_failed",
    "batch_planned",
    "batch_skipped",
    "batch_failed",
    "planner_blocked",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  summary: z.string(),
  metadata_json: z.string(),
  created_at: z.string(),
  campaign_name: z.string().nullable(),
  campaign_status: campaignStatusSchema.nullable(),
});

export const autopilotPlannerDashboardSchema = z.strictObject({
  summary: z.strictObject({
    eligibleBatches: countSchema,
    plannedBatches: countSchema,
    skippedBatches: countSchema,
    recentFailures: countSchema,
  }),
  recentPlans: z.array(planSchema).max(30),
  recentEvents: z.array(eventSchema).max(50),
  globalKillSwitchEnabled: z.boolean(),
  killSwitchReason: z.string(),
});
