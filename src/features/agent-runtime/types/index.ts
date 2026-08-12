import type { AgentPlaybookKey } from "@/agent/playbooks";
import type {
  AgentMessage,
  AgentProviderKey,
  AgentRole,
  AgentRunEventType,
  AgentRunStatus,
  AgentToolCallStatus,
  AgentToolName,
} from "@/agent/types";
import type { ApprovalStatus } from "@/features/approvals/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { WorkflowRunWithDetails } from "@/workflows/types";

export type AgentInputContext = Record<string, unknown>;

export interface AgentRun {
  id: number;
  campaign_id: number;
  workflow_run_id: number | null;
  workflow_step_id: number | null;
  agent_role: AgentRole;
  provider_key: AgentProviderKey;
  model_name: string;
  playbook_key: AgentPlaybookKey | "";
  status: AgentRunStatus;
  input_summary: string;
  input_context_json: string;
  output_summary: string;
  error_message: string;
  iteration_count: number;
  input_tokens?: number;
  output_tokens?: number;
  provider_request_id?: string;
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

export type AgentApprovalCheckpointPhase =
  | "waiting_approval"
  | "continuation_ready";

export interface AgentRunApprovalCheckpoint {
  agent_run_id: number;
  pending_tool_call_id: number;
  approval_id: number;
  phase: AgentApprovalCheckpointPhase;
  messages_json: string;
  iteration_count: number;
  created_at: string;
  updated_at: string;
  approval_status: ApprovalStatus;
  messages: AgentMessage[];
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
  checkpoint: AgentRunApprovalCheckpoint | null;
  inputContext: AgentInputContext;
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
  playbookKey?: AgentPlaybookKey | "";
  inputSummary?: string;
  inputContext?: AgentInputContext;
}

export interface StartAgentRunInput {
  id: number;
}

export interface ResumeAgentRunInput {
  id: number;
}

export interface ResumeAgentRunResult {
  status: Extract<AgentRunStatus, "completed" | "waiting_approval" | "failed">;
  outputSummary: string;
  errorMessage: string;
  checkpointPhase: AgentApprovalCheckpointPhase | null;
}

export interface ApprovedContinuationSettlement {
  agentRunId: number;
  campaignId: number;
  workflowRunId: number | null;
  workflowStepId: number | null;
  agentRole: AgentRole;
  providerKey: AgentProviderKey;
  modelName: string;
  playbookKey: AgentPlaybookKey | "";
  inputSummary: string;
  inputContext: AgentInputContext;
  messages: AgentMessage[];
  iterationCount: number;
  handledProviderToolCallIds: string[];
  checkpointPhase: "continuation_ready";
  recovered: boolean;
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
