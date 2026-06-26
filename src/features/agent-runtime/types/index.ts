import type {
  AgentProviderKey,
  AgentRole,
  AgentRunEventType,
  AgentRunStatus,
  AgentToolCallStatus,
  AgentToolName,
} from "@/agent/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { WorkflowRunWithDetails } from "@/workflows/types";

export interface AgentRun {
  id: number;
  campaign_id: number;
  workflow_run_id: number | null;
  workflow_step_id: number | null;
  agent_role: AgentRole;
  provider_key: AgentProviderKey;
  model_name: string;
  status: AgentRunStatus;
  input_summary: string;
  output_summary: string;
  error_message: string;
  iteration_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentToolCall {
  id: number;
  agent_run_id: number;
  provider_tool_call_id: string;
  tool_name: AgentToolName;
  status: AgentToolCallStatus;
  requires_approval: number;
  input_json: string;
  output_json: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AgentRunEvent {
  id: number;
  agent_run_id: number;
  event_type: AgentRunEventType;
  summary: string;
  created_at: string;
}

export interface AgentCampaignSnapshot {
  id: number;
  name: string;
  status: CampaignStatus;
}

export interface AgentToolCallWithJson extends AgentToolCall {
  input: unknown;
  output: unknown;
}

export type AgentRunWithDetails = AgentRun & {
  campaign: AgentCampaignSnapshot;
  workflowRun: WorkflowRunWithDetails | null;
  toolCalls: AgentToolCallWithJson[];
  events: AgentRunEvent[];
};

export interface CreateAgentRunInput {
  campaignId: number;
  workflowRunId?: number;
  workflowStepId?: number;
  agentRole: AgentRole;
  providerKey?: AgentProviderKey;
  modelName?: string;
  inputSummary?: string;
}

export interface StartAgentRunInput {
  id: number;
}

export interface CancelAgentRunInput {
  id: number;
}

export interface RecordAgentRunEventInput {
  agentRunId: number;
  eventType: AgentRunEventType;
  summary: string;
}

export interface RecordAgentToolCallInput {
  agentRunId: number;
  providerToolCallId?: string;
  toolName: AgentToolName;
  status: AgentToolCallStatus;
  requiresApproval: boolean;
  input: unknown;
  output?: unknown;
  errorMessage?: string;
}
