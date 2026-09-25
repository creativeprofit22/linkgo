import { z } from "zod";

import {
  WORKFLOW_ARTIFACT_TYPES,
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STEP_KEYS,
  WORKFLOW_STEP_STATUSES,
  WORKFLOW_TYPES,
} from "@/workflows/types";

/**
 * Strict shapes returned by the native workflow reads
 * (`src-tauri/src/workflow_store.rs`). Runs are capped at 200 and events at
 * 100 per run.
 */

const idSchema = z.number().int().positive();
const nullableIdSchema = idSchema.nullable();
const campaignStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

const runShape = {
  id: idSchema,
  campaign_id: idSchema,
  workflow_type: z.enum(WORKFLOW_TYPES),
  title: z.string(),
  status: z.enum(WORKFLOW_RUN_STATUSES),
  current_step_key: z.enum(WORKFLOW_STEP_KEYS),
  context_summary: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
};

export const workflowRunListSnapshotSchema = z.strictObject({
  runs: z
    .array(
      z.strictObject({
        ...runShape,
        campaign_name: z.string(),
        campaign_status: campaignStatusSchema,
        autopilot_plan_id: nullableIdSchema,
        source_import_batch_id: nullableIdSchema,
      }),
    )
    .max(200),
  steps: z.array(
    z.strictObject({
      id: idSchema,
      workflow_run_id: idSchema,
      step_key: z.enum(WORKFLOW_STEP_KEYS),
      title: z.string(),
      description: z.string(),
      sort_order: z.number().int(),
      status: z.enum(WORKFLOW_STEP_STATUSES),
      output_summary: z.string(),
      error_message: z.string(),
      started_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
  events: z.array(
    z.strictObject({
      id: idSchema,
      workflow_run_id: idSchema,
      workflow_step_id: nullableIdSchema,
      event_type: z.enum(WORKFLOW_EVENT_TYPES),
      summary: z.string(),
      created_at: z.string(),
    }),
  ),
  artifacts: z.array(
    z.strictObject({
      id: idSchema,
      workflow_run_id: idSchema,
      workflow_step_id: nullableIdSchema,
      artifact_type: z.enum(WORKFLOW_ARTIFACT_TYPES),
      artifact_id: idSchema,
      summary: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      agent_role: z.string().nullable(),
      agent_status: z.string().nullable(),
      candidate_id: nullableIdSchema,
      candidate_status: z.string().nullable(),
      candidate_relevance_score: z.number().int().nullable(),
      draft_id: nullableIdSchema,
      draft_status: z
        .enum(["drafting", "needs_revision", "ready_for_review", "archived"])
        .nullable(),
      draft_content_intent: z.string().nullable(),
    }),
  ),
});

export const workflowRunValidationRowSchema = z.strictObject({
  ...runShape,
  campaign_status: campaignStatusSchema,
  autopilot_plan_id: nullableIdSchema,
});

/** Rows the planner scoring executor validates (`loadPlannerScoringScope`). */
export const plannerScoringScopeRowsSchema = z.strictObject({
  header: z
    .strictObject({
      workflow_run_id: idSchema,
      workflow_status: z.string(),
      current_step_key: z.string(),
      workflow_step_id: idSchema,
      score_step_status: z.enum(WORKFLOW_STEP_STATUSES),
      campaign_id: idSchema,
      campaign_name: z.string(),
      campaign_product: z.string(),
      campaign_audience: z.string(),
      campaign_voice: z.string(),
      campaign_tone: z.string(),
      campaign_status: z.string(),
      autopilot_plan_id: idSchema,
      plan_status: z.string(),
      source_import_batch_id: idSchema,
      source_campaign_id: idSchema,
    })
    .nullable(),
  artifacts: z
    .array(
      z.strictObject({
        artifact_id: idSchema,
        artifact_order: idSchema,
        workflow_step_id: nullableIdSchema,
        candidate_id: nullableIdSchema,
        candidate_campaign_id: nullableIdSchema,
        candidate_status: z
          .enum(["new", "shortlisted", "rejected", "drafted"])
          .nullable(),
        relevance_score: z.number().int().nullable(),
        source_keyword: z.string().nullable(),
        author_name: z.string().nullable(),
        author_profile_url: z.string().nullable(),
        posted_at: z.string().nullable(),
        source_url: z.string().nullable(),
        content: z.string().nullable(),
      }),
    )
    .max(500),
  keywords: z.array(z.string()).max(12),
});

/** Saved-draft provenance rows for a planner audit step (at most 2). */
export const plannerDraftAuditScopeRowsSchema = z
  .array(
    z.strictObject({
      campaign_id: idSchema,
      workflow_step_id: idSchema,
      draft_id: idSchema,
      request_id: idSchema,
      provider_key: z.string(),
      model_name: z.string(),
      request_run_id: nullableIdSchema,
      request_step_id: nullableIdSchema,
      request_campaign_id: idSchema,
      created_draft_id: nullableIdSchema,
      draft_campaign_id: idSchema,
    }),
  )
  .max(2);
