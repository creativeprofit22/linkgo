import type { z } from "zod";
import type { AgentProviderKey } from "@/agent/provider-catalog";
import type { WorkflowStepKey } from "@/workflows/types";

export { AGENT_PROVIDER_KEYS } from "@/agent/provider-catalog";
export type { AgentProviderKey } from "@/agent/provider-catalog";

export const AGENT_TOOL_NAMES = [
  "research_posts",
  "score_relevance",
  "draft_post",
  "audit_post",
  "schedule_post",
  "collect_metrics",
] as const;

export const AGENT_ROLES = [
  "researcher",
  "scorer",
  "drafter",
  "auditor",
  "scheduler",
  "analyst",
] as const;

export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;

export const AGENT_TOOL_CALL_STATUSES = [
  "requested",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "rejected",
] as const;

export const AGENT_RUN_EVENT_TYPES = [
  "run_created",
  "model_started",
  "model_streamed",
  "tool_requested",
  "tool_completed",
  "tool_failed",
  "approval_required",
  "run_completed",
  "run_failed",
  "run_cancelled",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];
export type AgentRole = (typeof AGENT_ROLES)[number];
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentToolCallStatus = (typeof AGENT_TOOL_CALL_STATUSES)[number];
export type AgentRunEventType = (typeof AGENT_RUN_EVENT_TYPES)[number];

export interface AgentToolMetadata {
  name: AgentToolName;
  label: string;
  description: string;
  roadmapSection: string;
  requiresApproval: boolean;
  stepKeys: WorkflowStepKey[];
}

export interface AgentToolContract<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> extends AgentToolMetadata {
  inputSchema: TInput;
  outputSchema: TOutput;
  execute: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

export type AgentToolRegistry = Record<AgentToolName, AgentToolContract>;

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: AgentToolName;
  providerToolCallId?: string;
}

export interface AgentModelRequest {
  runId: number;
  campaignId: number;
  workflowRunId: number | null;
  workflowStepId: number | null;
  agentRole: AgentRole;
  inputSummary: string;
  messages: AgentMessage[];
}

export type AgentModelChunk =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool_call";
      providerToolCallId?: string;
      toolName: AgentToolName;
      input: unknown;
    }
  | {
      type: "done";
      outputSummary: string;
    };

export interface AgentProvider {
  key: AgentProviderKey;
  modelName: string;
  stream: (request: AgentModelRequest) => AsyncIterable<AgentModelChunk>;
}

export type AgentProgressEvent =
  | {
      type: "model_started";
      summary: string;
    }
  | {
      type: "model_streamed";
      summary: string;
    }
  | {
      type: "tool_requested";
      summary: string;
      providerToolCallId: string;
      toolName: AgentToolName;
      input: unknown;
      requiresApproval: boolean;
    }
  | {
      type: "tool_completed";
      summary: string;
      providerToolCallId: string;
      toolName: AgentToolName;
      input: unknown;
      output: unknown;
      requiresApproval: boolean;
    }
  | {
      type: "tool_failed";
      summary: string;
      providerToolCallId: string;
      toolName: AgentToolName;
      input: unknown;
      errorMessage: string;
      requiresApproval: boolean;
    }
  | {
      type: "approval_required";
      summary: string;
      providerToolCallId: string;
      toolName: AgentToolName;
      input: unknown;
      requiresApproval: true;
    }
  | {
      type: "run_completed";
      summary: string;
    }
  | {
      type: "run_failed";
      summary: string;
      errorMessage: string;
    };

export interface AgentLoopOptions {
  provider: AgentProvider;
  tools: AgentToolRegistry;
  request: AgentModelRequest;
  maxIterations?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onProgress?: (event: AgentProgressEvent) => Promise<void> | void;
}

export interface AgentLoopToolCallResult {
  providerToolCallId: string;
  toolName: AgentToolName;
  status: AgentToolCallStatus;
  requiresApproval: boolean;
  input: unknown;
  output: unknown;
  errorMessage: string;
}

export interface AgentLoopUsage {
  inputTokens: number;
  outputTokens: number;
  providerRequestId: string;
}

export interface AgentLoopResult {
  status: Extract<AgentRunStatus, "completed" | "waiting_approval" | "failed">;
  outputSummary: string;
  iterationCount: number;
  toolCalls: AgentLoopToolCallResult[];
  errorMessage: string;
  retryCount: number;
  usage: AgentLoopUsage;
}
