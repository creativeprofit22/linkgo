import type { AgentProviderKey } from "@/agent/provider-catalog";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { DraftContentIntent, DraftStatus } from "@/features/drafts/types";

export const WORKFLOW_TYPES = ["content_pipeline"] as const;

export const WORKFLOW_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;

export const WORKFLOW_STEP_KEYS = [
  "research",
  "score",
  "draft",
  "audit",
  "approve",
  "schedule",
  "measure",
] as const;

export const WORKFLOW_STEP_STATUSES = [
  "pending",
  "running",
  "waiting_approval",
  "blocked",
  "completed",
  "failed",
  "skipped",
] as const;

export const WORKFLOW_EVENT_TYPES = [
  "run_created",
  "run_started",
  "step_started",
  "step_waiting_approval",
  "step_blocked",
  "step_completed",
  "step_failed",
  "step_skipped",
  "step_resumed",
  "run_completed",
  "run_cancelled",
  "note_added",
] as const;

export const WORKFLOW_ARTIFACT_TYPES = [
  "agent_run",
  "candidate_post",
  "draft",
] as const;

export const CONTENT_PIPELINE_STEPS = [
  {
    step_key: "research",
    title: "Research",
    description: "Research source posts and campaign context.",
    sort_order: 1,
  },
  {
    step_key: "score",
    title: "Score relevance",
    description: "Dedupe and score candidate relevance.",
    sort_order: 2,
  },
  {
    step_key: "draft",
    title: "Draft variants",
    description: "Create draft variants.",
    sort_order: 3,
  },
  {
    step_key: "audit",
    title: "Audit drafts",
    description: "Run deterministic/AI audit checks.",
    sort_order: 4,
  },
  {
    step_key: "approve",
    title: "Approve",
    description: "Wait for human review.",
    sort_order: 5,
  },
  {
    step_key: "schedule",
    title: "Schedule",
    description: "Schedule approved content.",
    sort_order: 6,
  },
  {
    step_key: "measure",
    title: "Measure",
    description: "Record metrics and learning.",
    sort_order: 7,
  },
] as const;

export type WorkflowType = (typeof WORKFLOW_TYPES)[number];
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];
export type WorkflowStepKey = (typeof WORKFLOW_STEP_KEYS)[number];
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];
export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];
export type WorkflowArtifactType = (typeof WORKFLOW_ARTIFACT_TYPES)[number];

export interface PlannerDraftAuditClaim {
  executionId: number;
  auditRunId: number;
  agentRunId: number;
  workflowRunId: number;
  workflowStepId: number;
  draftId: number;
  draftVariantId: number;
  contentRevision: number;
}

export interface WorkflowRun {
  id: number;
  campaign_id: number;
  workflow_type: WorkflowType;
  title: string;
  status: WorkflowRunStatus;
  current_step_key: WorkflowStepKey;
  context_summary: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  id: number;
  workflow_run_id: number;
  step_key: WorkflowStepKey;
  title: string;
  description: string;
  sort_order: number;
  status: WorkflowStepStatus;
  output_summary: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowEvent {
  id: number;
  workflow_run_id: number;
  workflow_step_id: number | null;
  event_type: WorkflowEventType;
  summary: string;
  created_at: string;
}

export interface WorkflowArtifact {
  id: number;
  workflow_run_id: number;
  workflow_step_id: number | null;
  artifact_type: WorkflowArtifactType;
  artifact_id: number;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowArtifactWithDetails extends WorkflowArtifact {
  agent_role: string | null;
  agent_status: string | null;
  candidate_status: string | null;
  candidate_relevance_score: number | null;
  candidate_removed: boolean;
  draft_status: DraftStatus | null;
  draft_content_intent: DraftContentIntent | null;
  draft_removed: boolean;
}

export interface WorkflowCampaignSnapshot {
  id: number;
  name: string;
  status: CampaignStatus;
}

export interface WorkflowCandidateScopeSummary {
  total: number;
  current: number;
  unscored: number;
  alreadyScored: number;
  ineligible: number;
  removed: number;
}

export interface WorkflowRunDerivedValues {
  completedStepCount: number;
  totalStepCount: number;
  progressPercent: number;
  currentStep: WorkflowStep | null;
  latestEvent: WorkflowEvent | null;
  candidateScope: WorkflowCandidateScopeSummary | null;
}

export type WorkflowRunWithDetails = WorkflowRun &
  WorkflowRunDerivedValues & {
    autopilot_plan_id: number | null;
    source_import_batch_id: number | null;
    campaign: WorkflowCampaignSnapshot;
    steps: WorkflowStep[];
    events: WorkflowEvent[];
    artifacts: WorkflowArtifactWithDetails[];
  };

export interface CreateWorkflowRunInput {
  campaignId: number;
  title: string;
  contextSummary?: string;
}

export interface StartWorkflowRunInput {
  id: number;
}

export interface WorkflowScoringInput {
  providerKey: Exclude<AgentProviderKey, "dry_run">;
  modelName: string;
  minimumScore?: number;
  autoRejectBelowMinimum?: boolean;
}

export interface ExecuteWorkflowRunInput {
  id: number;
  scoring?: WorkflowScoringInput;
}

export interface SetWorkflowStepStatusInput {
  stepId: number;
  status: WorkflowStepStatus;
  outputSummary?: string;
  errorMessage?: string;
}

export interface CancelWorkflowRunInput {
  id: number;
}

export interface AddWorkflowNoteInput {
  workflowRunId: number;
  note: string;
}

export interface CreateWorkflowArtifactInput {
  workflowRunId: number;
  workflowStepId?: number;
  artifactType: WorkflowArtifactType;
  artifactId: number;
  summary?: string;
}
