import { z } from "zod";
import { playbookKeySchema } from "@/features/playbooks/schemas";
import {
  agentProviderKeySchema,
  agentRoleSchema,
  agentRunEventTypeSchema,
  agentToolCallStatusSchema,
  agentToolNameSchema,
} from "@/agent/schemas";

const positiveIdSchema = z.number().int().positive();
const optionalSummarySchema = z.string().trim().max(1000).default("");

export const createAgentRunSchema = z.object({
  campaignId: positiveIdSchema,
  workflowRunId: positiveIdSchema.optional(),
  workflowStepId: positiveIdSchema.optional(),
  agentRole: agentRoleSchema,
  providerKey: agentProviderKeySchema.default("dry_run"),
  modelName: z.string().trim().max(120).default("dry-run-local"),
  playbookKey: playbookKeySchema.or(z.literal("")).optional(),
  inputSummary: optionalSummarySchema,
});

export const startAgentRunSchema = z.object({
  id: positiveIdSchema,
});

export const cancelAgentRunSchema = z.object({
  id: positiveIdSchema,
});

export const recordAgentRunEventSchema = z.object({
  agentRunId: positiveIdSchema,
  eventType: agentRunEventTypeSchema,
  summary: z.string().trim().min(1).max(1000),
});

export const recordAgentToolCallSchema = z.object({
  agentRunId: positiveIdSchema,
  providerToolCallId: z.string().trim().max(200).default(""),
  toolName: agentToolNameSchema,
  status: agentToolCallStatusSchema,
  requiresApproval: z.boolean(),
  input: z.unknown(),
  output: z.unknown().optional(),
  errorMessage: optionalSummarySchema,
});
