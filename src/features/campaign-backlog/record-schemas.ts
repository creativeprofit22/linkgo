import { z } from "zod";

import {
  CAMPAIGN_BACKLOG_OWNER_TYPES,
  CAMPAIGN_BACKLOG_RECURRENCES,
  CAMPAIGN_BACKLOG_STATUSES,
  CAMPAIGN_BACKLOG_WORK_TYPES,
} from "@/features/campaign-backlog/types";
import {
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STEP_STATUSES,
} from "@/workflows/types";

/**
 * Strict shape returned by `linkgo_campaign_backlog_dashboard`
 * (`src-tauri/src/planning_reads.rs`). Open items are capped at 500 and
 * history at 100.
 */

const OPEN_ITEM_LIMIT = 500;
const idSchema = z.number().int().positive();
const countSchema = z.number().int().nonnegative();

const backlogItemDetailSchema = z.strictObject({
  id: idSchema,
  campaign_id: idSchema,
  recurrence_parent_id: idSchema.nullable(),
  work_type: z.enum(CAMPAIGN_BACKLOG_WORK_TYPES),
  title: z.string(),
  details: z.string(),
  owner_type: z.enum(CAMPAIGN_BACKLOG_OWNER_TYPES),
  status: z.enum(CAMPAIGN_BACKLOG_STATUSES),
  due_at: z.string(),
  recurrence: z.enum(CAMPAIGN_BACKLOG_RECURRENCES),
  recurrence_timezone: z.string(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  campaign_name: z.string(),
  campaign_status: z.enum(["draft", "active", "paused", "archived"]),
  autopilot_plan_id: idSchema.nullable(),
  source_import_batch_id: idSchema.nullable(),
  workflow_run_id: idSchema.nullable(),
  linked_workflow_status: z.enum(WORKFLOW_RUN_STATUSES).nullable(),
  linked_score_step_status: z.enum(WORKFLOW_STEP_STATUSES).nullable(),
});

export const campaignBacklogDashboardSnapshotSchema = z.strictObject({
  items: z.array(backlogItemDetailSchema).max(OPEN_ITEM_LIMIT),
  summary: z.strictObject({
    dueNow: countSchema,
    inProgress: countSchema,
    blocked: countSchema,
    linkgoOwned: countSchema,
  }),
  totalItems: countSchema,
});
