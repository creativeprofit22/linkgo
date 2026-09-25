import { z } from "zod";

import { sourceConnectorKeySchema } from "@/features/source-imports/connectors";

/**
 * Stored source-import record shapes returned by native commands. This file
 * imports nothing from the feature's type/UI modules so the dashboard read
 * does not add edges to the source-import/candidate UI-contract cycle.
 */

/** Must match `MAX_SOURCE_IMPORT_ROWS` and native `BATCH_ITEM_LIMIT`. */
const BATCH_ITEM_LIMIT = 50;
const RECENT_BATCH_LIMIT = 10;

export const sourceImportBatchStatusSchema = z.enum([
  "processing",
  "completed",
  "completed_with_errors",
  "failed",
]);

export const sourceImportItemStatusSchema = z.enum([
  "pending",
  "accepted",
  "duplicate",
  "rejected",
]);

export const sourceImportPolicyRuleKeySchema = z.enum([
  "",
  "source",
  "age",
  "banned_topic",
  "already_contacted",
]);

const sourceImportItemRowSchema = z.strictObject({
  id: z.number().int().positive(),
  source_import_batch_id: z.number().int().positive(),
  row_number: z.number().int().positive(),
  status: sourceImportItemStatusSchema,
  input_json: z.string(),
  candidate_post_id: z.number().int().positive().nullable(),
  reason: z.string(),
  policy_rule_key: sourceImportPolicyRuleKeySchema,
  created_at: z.string(),
  updated_at: z.string(),
});

/** Native `linkgo_source_import_dashboard` result: newest 10 batches. */
export const sourceImportDashboardSchema = z
  .array(
    z.strictObject({
      id: z.number().int().positive(),
      campaign_id: z.number().int().positive(),
      source_type: sourceConnectorKeySchema,
      status: sourceImportBatchStatusSchema,
      total_count: z.number().int().min(0),
      accepted_count: z.number().int().min(0),
      duplicate_count: z.number().int().min(0),
      rejected_count: z.number().int().min(0),
      error_message: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      items: z.array(sourceImportItemRowSchema).max(BATCH_ITEM_LIMIT),
    }),
  )
  .max(RECENT_BATCH_LIMIT);
