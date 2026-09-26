import { z } from "zod";

import { AGENT_PROVIDER_KEYS } from "@/agent/provider-catalog";
import {
  AGENT_ROLES,
  AGENT_RUN_EVENT_TYPES,
  AGENT_RUN_STATUSES,
  AGENT_TOOL_CALL_STATUSES,
  AGENT_TOOL_NAMES,
} from "@/agent/types";
import { agentRunPlaybookKeySchema } from "@/features/agent-runtime/schemas";

/**
 * Strict shapes returned by the native agent-run reads
 * (`src-tauri/src/workflow_store.rs`). Runs are capped at 200 and events at
 * 100 per run. Checkpoint rows are further parsed by
 * `agentRunApprovalCheckpointSchema` in data.ts.
 */

const idSchema = z.number().int().positive();
const nullableIdSchema = idSchema.nullable();
const campaignStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

const agentRunShape = {
  id: idSchema,
  campaign_id: idSchema,
  workflow_run_id: nullableIdSchema,
  workflow_step_id: nullableIdSchema,
  agent_role: z.enum(AGENT_ROLES),
  provider_key: z.enum(AGENT_PROVIDER_KEYS),
  model_name: z.string(),
  playbook_key: agentRunPlaybookKeySchema,
  status: z.enum(AGENT_RUN_STATUSES),
  input_summary: z.string(),
  input_context_json: z.string(),
  output_summary: z.string(),
  error_message: z.string(),
  iteration_count: z.number().int().nonnegative(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
};

export const agentRunListSnapshotSchema = z.strictObject({
  runs: z
    .array(
      z.strictObject({
        ...agentRunShape,
        campaign_name: z.string(),
        campaign_status: campaignStatusSchema,
        // 1 when native start would reject this draft-quality-owned agent.
        quality_start_blocked: z.number().int().min(0).max(1),
      }),
    )
    .max(200),
  toolCalls: z.array(
    z.strictObject({
      id: idSchema,
      agent_run_id: idSchema,
      provider_tool_call_id: z.string(),
      tool_name: z.enum(AGENT_TOOL_NAMES),
      status: z.enum(AGENT_TOOL_CALL_STATUSES),
      requires_approval: z.number().int().min(0).max(1),
      input_json: z.string(),
      output_json: z.string(),
      error_message: z.string(),
      started_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  events: z.array(
    z.strictObject({
      id: idSchema,
      agent_run_id: idSchema,
      event_type: z.enum(AGENT_RUN_EVENT_TYPES),
      summary: z.string(),
      created_at: z.string(),
    }),
  ),
  checkpoints: z.array(z.record(z.string(), z.unknown())),
});

export const agentRunValidationRowSchema = z.strictObject({
  ...agentRunShape,
  campaign_status: campaignStatusSchema,
});
