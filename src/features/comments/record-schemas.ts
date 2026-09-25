import { z } from "zod";

/**
 * Strict shapes returned by the native comment read commands
 * (`src-tauri/src/comment_reads.rs`). Lists are capped to native limits.
 */

const THREAD_LIST_LIMIT = 500;
const ELIGIBLE_LIMIT = 200;

const idSchema = z.number().int().positive();
const campaignStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
const candidateStatusSchema = z.enum([
  "new",
  "shortlisted",
  "rejected",
  "drafted",
]);
const targetShape = {
  target_post_id: idSchema,
  target_url: z.string(),
  target_platform_resource_urn: z.string(),
  target_author_name: z.string(),
  target_author_profile_url: z.string(),
  target_content: z.string(),
  target_posted_at: z.string().nullable(),
};

const threadRowSchema = z.strictObject({
  ...targetShape,
  id: idSchema,
  campaign_id: idSchema,
  candidate_post_id: idSchema,
  status: z.enum([
    "drafting",
    "needs_review",
    "changes_requested",
    "approved",
    "rejected",
    "posted",
    "cancelled",
  ]),
  operator_notes: z.string(),
  reviewer_notes: z.string(),
  approved_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
  posted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  campaign_name: z.string(),
  campaign_status: campaignStatusSchema,
  candidate_status: candidateStatusSchema,
  candidate_source_keyword: z.string(),
  candidate_relevance_score: z.number().int().min(0).max(100).nullable(),
});

export const commentThreadsSnapshotSchema = z.strictObject({
  threads: z.array(threadRowSchema).max(THREAD_LIST_LIMIT),
  variants: z.array(
    z.strictObject({
      id: idSchema,
      comment_thread_id: idSchema,
      variant_number: z.number().int().positive(),
      body: z.string(),
      status: z.enum(["draft", "selected", "rejected"]),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
  audits: z.array(
    z.strictObject({
      id: idSchema,
      comment_variant_id: idSchema,
      rule_key: z.string(),
      severity: z.enum(["pass", "warning", "block"]),
      message: z.string(),
      created_at: z.string(),
    }),
  ),
  attempts: z.array(
    z.strictObject({
      id: idSchema,
      comment_thread_id: idSchema,
      platform: z.literal("linkedin"),
      status: z.enum(["succeeded", "failed"]),
      external_comment_url: z.string(),
      platform_comment_id: z.string(),
      idempotency_key: z.string(),
      error_message: z.string(),
      created_at: z.string(),
    }),
  ),
  /** Threads matching the filter before the `THREAD_LIST_LIMIT` cap. */
  totalCount: z.number().int().nonnegative(),
});

export const commentEligibleCandidateListSchema = z
  .array(
    z.strictObject({
      ...targetShape,
      candidate_id: idSchema,
      campaign_id: idSchema,
      campaign_name: z.string(),
      campaign_status: campaignStatusSchema,
      candidate_status: candidateStatusSchema,
      source_keyword: z.string(),
      relevance_score: z.number().int().min(0).max(100).nullable(),
    }),
  )
  .max(ELIGIBLE_LIMIT);
