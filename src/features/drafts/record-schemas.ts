import { z } from "zod";

import { AGENT_PROVIDER_KEYS } from "@/agent/provider-catalog";
import {
  DRAFT_CONTENT_INTENTS,
  DRAFT_QUALITY_ATTEMPT_STATUSES,
  DRAFT_QUALITY_CATEGORY_KEYS,
  DRAFT_QUALITY_RUN_STATUSES,
  DRAFT_AI_AUDIT_RULE_KEYS,
} from "@/features/drafts/types";

/**
 * Strict shapes returned by the native draft read commands
 * (`src-tauri/src/drafts_reads.rs`). Lists are capped to native limits.
 */

const DRAFT_LIST_LIMIT = 500;
const GENERATION_REQUEST_LIMIT = 500;
const WORKFLOW_OPTION_LIMIT = 200;

const idSchema = z.number().int().positive();
const nullableIdSchema = idSchema.nullable();
const countSchema = z.number().int().nonnegative();
const scoreSchema = z.number().int().min(0).max(100);
const providerSchema = z.enum(AGENT_PROVIDER_KEYS);
const severitySchema = z.enum(["pass", "warning", "block"]);

const candidateTargetShape = {
  campaign_name: z.string(),
  candidate_source_keyword: z.string(),
  candidate_status: z.enum(["new", "shortlisted", "rejected", "drafted"]),
  candidate_relevance_score: scoreSchema.nullable(),
  candidate_score_reason: z.string(),
  candidate_notes: z.string(),
  candidate_created_at: z.string(),
  candidate_updated_at: z.string(),
  target_id: idSchema,
  target_platform: z.literal("linkedin"),
  target_url: z.string(),
  target_normalized_url: z.string(),
  target_platform_resource_urn: z.string(),
  target_author_name: z.string(),
  target_author_profile_url: z.string(),
  target_posted_at: z.string().nullable(),
  target_content: z.string(),
  target_content_hash: z.string(),
  target_created_at: z.string(),
  target_updated_at: z.string(),
};

export const draftListSnapshotSchema = z.strictObject({
  drafts: z
    .array(
      z.strictObject({
        ...candidateTargetShape,
        id: idSchema,
        campaign_id: idSchema,
        candidate_post_id: idSchema,
        angle: z.string(),
        notes: z.string(),
        content_intent: z.enum(DRAFT_CONTENT_INTENTS),
        status: z.enum([
          "drafting",
          "needs_revision",
          "ready_for_review",
          "archived",
        ]),
        created_at: z.string(),
        updated_at: z.string(),
      }),
    )
    .max(DRAFT_LIST_LIMIT),
  variants: z.array(
    z.strictObject({
      id: idSchema,
      draft_id: idSchema,
      variant_number: z.number().int().positive(),
      hook: z.string(),
      body: z.string(),
      cta: z.string(),
      hashtags: z.string(),
      content_revision: z.number().int().positive(),
      status: z.enum(["draft", "selected", "rejected"]),
      created_at: z.string(),
      updated_at: z.string(),
      // Native variant-level approval gate (SQLite boolean): readiness at the
      // current revision and no block audit at any revision.
      approval_ready: z.union([z.literal(0), z.literal(1)]),
    }),
  ),
  audits: z.array(
    z.strictObject({
      id: idSchema,
      draft_variant_id: idSchema,
      rule_key: z.string(),
      severity: severitySchema,
      message: z.string(),
      created_at: z.string(),
    }),
  ),
  aiAuditRuns: z.array(
    z.strictObject({
      id: idSchema,
      draft_variant_id: idSchema,
      content_revision: z.number().int().positive(),
      agent_run_id: nullableIdSchema,
      workflow_step_execution_id: nullableIdSchema,
      provider_key: providerSchema,
      model_name: z.string(),
      status: z.enum([
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ]),
      summary: z.string(),
      error_message: z.string(),
      started_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
  aiAuditFindings: z.array(
    z.strictObject({
      id: idSchema,
      audit_run_id: idSchema,
      rule_key: z.enum(DRAFT_AI_AUDIT_RULE_KEYS),
      severity: severitySchema,
      message: z.string(),
      created_at: z.string(),
    }),
  ),
  qualityRuns: z.array(
    z.strictObject({
      id: idSchema,
      draft_variant_id: idSchema,
      starting_content_revision: z.number().int().positive(),
      current_content_revision: z.number().int().positive(),
      provider_key: providerSchema,
      model_name: z.string(),
      threshold: z.literal(70),
      maximum_rewrite_count: z.literal(2),
      applied_rewrite_count: countSchema,
      status: z.enum(DRAFT_QUALITY_RUN_STATUSES),
      final_score: scoreSchema.nullable(),
      summary: z.string(),
      error_message: z.string(),
      active_agent_run_id: nullableIdSchema,
      active_ai_audit_run_id: nullableIdSchema,
      started_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
  qualityAttempts: z.array(
    z.strictObject({
      id: idSchema,
      run_id: idSchema,
      attempt_number: z.number().int().positive(),
      content_revision: z.number().int().positive(),
      input_hook: z.string(),
      input_body: z.string(),
      input_cta: z.string(),
      input_hashtags: z.string(),
      rewritten_hook: z.string().nullable(),
      rewritten_body: z.string().nullable(),
      rewritten_cta: z.string().nullable(),
      rewritten_hashtags: z.string().nullable(),
      overall_score: scoreSchema.nullable(),
      status: z.enum(DRAFT_QUALITY_ATTEMPT_STATUSES),
      agent_run_id: nullableIdSchema,
      ai_audit_run_id: nullableIdSchema,
      created_at: z.string(),
      updated_at: z.string(),
      completed_at: z.string().nullable(),
    }),
  ),
  qualityScores: z.array(
    z.strictObject({
      id: idSchema,
      attempt_id: idSchema,
      category_key: z.enum(DRAFT_QUALITY_CATEGORY_KEYS),
      score: scoreSchema,
      feedback: z.string(),
      created_at: z.string(),
    }),
  ),
  /** Drafts matching the filter before the `DRAFT_LIST_LIMIT` cap. */
  totalCount: z.number().int().nonnegative(),
});

export const draftGenerationRequestListSchema = z
  .array(
    z.strictObject({
      ...candidateTargetShape,
      id: idSchema,
      campaign_id: idSchema,
      candidate_post_id: idSchema,
      agent_run_id: nullableIdSchema,
      provider_key: providerSchema,
      model_name: z.string(),
      // Narrowed to a known playbook by `playbookKeySchema` in data.ts; the
      // column is also constrained by a CHECK in the database.
      playbook_key: z.string().max(80),
      variant_count: z.number().int().positive(),
      content_intent: z.enum(DRAFT_CONTENT_INTENTS),
      workflow_run_id: nullableIdSchema,
      workflow_step_id: nullableIdSchema,
      angle: z.string(),
      voice_notes: z.string(),
      status: z.enum(["pending", "generated", "saved", "failed", "dismissed"]),
      summary: z.string(),
      generated_variants_json: z.string(),
      error_message: z.string(),
      created_draft_id: nullableIdSchema,
      created_at: z.string(),
      updated_at: z.string(),
    }),
  )
  .max(GENERATION_REQUEST_LIMIT);

export const draftWorkflowOptionListSchema = z
  .array(
    z.strictObject({
      workflow_run_id: idSchema,
      workflow_step_id: idSchema,
      candidate_id: idSchema,
      title: z.string(),
      status: z.enum(["running", "blocked", "failed"]),
    }),
  )
  .max(WORKFLOW_OPTION_LIMIT);
