import { z } from "zod";
import { playbookKeySchema } from "@/features/playbooks/schemas";
import {
  agentConversationSchema,
  agentProviderKeySchema,
  agentRoleSchema,
} from "@/agent/schemas";

const positiveIdSchema = z.number().int().positive();
const optionalSummarySchema = z.string().trim().max(1000).default("");
export const MAX_AGENT_INPUT_CONTEXT_LENGTH = 50_000;
/** A stored agent run's playbook: a known playbook or none. */
export const agentRunPlaybookKeySchema = playbookKeySchema.or(z.literal(""));

export const agentInputContextSchema = z
  .record(z.string().trim().min(1).max(120), z.unknown())
  .superRefine((context, issueContext) => {
    let serialized: string;
    try {
      serialized = JSON.stringify(context);
    } catch {
      issueContext.addIssue({
        code: "custom",
        message: "Agent input context must be JSON serializable",
      });
      return;
    }
    if (serialized.length > MAX_AGENT_INPUT_CONTEXT_LENGTH) {
      issueContext.addIssue({
        code: "custom",
        message: `Agent input context cannot exceed ${MAX_AGENT_INPUT_CONTEXT_LENGTH} characters`,
      });
    }
    try {
      if (JSON.stringify(JSON.parse(serialized)) !== serialized) {
        issueContext.addIssue({
          code: "custom",
          message: "Agent input context must contain JSON values only",
        });
      }
    } catch {
      issueContext.addIssue({
        code: "custom",
        message: "Agent input context must contain JSON values only",
      });
    }
  });

export const createAgentRunSchema = z.object({
  campaignId: positiveIdSchema,
  workflowRunId: positiveIdSchema.optional(),
  workflowStepId: positiveIdSchema.optional(),
  agentRole: agentRoleSchema,
  providerKey: agentProviderKeySchema.default("dry_run"),
  modelName: z.string().trim().max(120).default("dry-run-local"),
  playbookKey: playbookKeySchema.or(z.literal("")).optional(),
  inputSummary: optionalSummarySchema,
  inputContext: agentInputContextSchema.optional().default({}),
});

export const startAgentRunSchema = z.object({
  id: positiveIdSchema,
});

export const resumeAgentRunSchema = z.object({
  id: positiveIdSchema,
});

export const agentApprovalCheckpointPhaseSchema = z.enum([
  "waiting_approval",
  "continuation_ready",
]);

export const approvedContinuationSettlementSchema = z
  .object({
    agentRunId: positiveIdSchema,
    campaignId: positiveIdSchema,
    workflowRunId: positiveIdSchema.nullable(),
    workflowStepId: positiveIdSchema.nullable(),
    agentRole: agentRoleSchema,
    providerKey: agentProviderKeySchema,
    modelName: z.string().max(120),
    playbookKey: playbookKeySchema.or(z.literal("")),
    inputSummary: z.string().max(1000),
    inputContext: agentInputContextSchema,
    messages: agentConversationSchema,
    iterationCount: z.number().int().min(0).max(20),
    handledProviderToolCallIds: z.array(z.string().max(200)),
    checkpointPhase: z.literal("continuation_ready"),
    recovered: z.boolean(),
  })
  .strict();

export const resumeAgentRunResultSchema = z
  .object({
    status: z.enum(["completed", "waiting_approval", "failed"]),
    outputSummary: z.string(),
    errorMessage: z.string(),
    checkpointPhase: agentApprovalCheckpointPhaseSchema.nullable(),
  })
  .strict();

export const agentRunApprovalCheckpointSchema = z
  .object({
    agent_run_id: positiveIdSchema,
    pending_tool_call_id: positiveIdSchema,
    approval_id: positiveIdSchema,
    phase: agentApprovalCheckpointPhaseSchema,
    messages_json: z.string().min(2),
    iteration_count: z.number().int().min(0).max(20),
    created_at: z.string(),
    updated_at: z.string(),
    approval_status: z.enum([
      "needs_review",
      "changes_requested",
      "approved",
      "rejected",
      "scheduled",
      "published",
      "cancelled",
    ]),
    messages: agentConversationSchema,
  })
  .strict();

export const cancelAgentRunSchema = z.object({
  id: positiveIdSchema,
});

/** Native result of the agent-run mutation commands: the affected run id. */
export const agentRunMutationResultSchema = z
  .object({ id: positiveIdSchema })
  .strict();

/** Native result of `linkgo_agent_run_persist_result`. */
export const persistAgentResultOutputSchema = z
  .object({ checkpointPhase: agentApprovalCheckpointPhaseSchema.nullable() })
  .strict();
