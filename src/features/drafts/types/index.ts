import type { AgentPlaybookKey } from "@/agent/playbooks";
import type { AgentProviderKey } from "@/agent/types";
import type { CandidateWithTarget } from "@/features/candidate-queue/types";

export const DRAFT_CONTENT_INTENTS = [
  "event",
  "launch",
  "idea",
  "community",
] as const;

export type DraftContentIntent = (typeof DRAFT_CONTENT_INTENTS)[number];

export type DraftStatus =
  | "drafting"
  | "needs_revision"
  | "ready_for_review"
  | "archived";

export type DraftVariantStatus = "draft" | "selected" | "rejected";

export type DraftAuditSeverity = "pass" | "warning" | "block";

export const DRAFT_AI_AUDIT_RULE_KEYS = [
  "hook",
  "specificity",
  "generic_language",
  "authenticity",
  "clarity",
  "safety",
] as const;

export type DraftAiAuditRuleKey = (typeof DRAFT_AI_AUDIT_RULE_KEYS)[number];
export type DraftAiAuditRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Draft {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  angle: string;
  notes: string;
  content_intent: DraftContentIntent;
  status: DraftStatus;
  created_at: string;
  updated_at: string;
}

export interface DraftVariant {
  id: number;
  draft_id: number;
  variant_number: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
  content_revision: number;
  status: DraftVariantStatus;
  created_at: string;
  updated_at: string;
}

export interface DraftAuditFinding {
  id?: number;
  draft_variant_id?: number;
  rule_key: string;
  severity: DraftAuditSeverity;
  message: string;
  created_at?: string;
}

export interface DraftAiAuditRun {
  id: number;
  draft_variant_id: number;
  content_revision: number;
  agent_run_id: number | null;
  provider_key: AgentProviderKey;
  model_name: string;
  status: DraftAiAuditRunStatus;
  summary: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftAiAuditFinding {
  id: number;
  audit_run_id: number;
  rule_key: DraftAiAuditRuleKey;
  severity: DraftAuditSeverity;
  message: string;
  created_at: string;
}

export interface RunDraftAiAuditInput {
  draftVariantId: number;
  providerKey?: AgentProviderKey;
  modelName?: string;
}

export type RunDraftAiAudit = (input: RunDraftAiAuditInput) => Promise<number>;

export interface ReconcileDraftAiAuditLifecycleInput {
  maxAuditRuns?: number;
  maxOrphanAgentRuns?: number;
}

export interface ReconcileDraftAiAuditLifecycleResult {
  failedAuditRunIds: number[];
  failedAgentRunIds: number[];
  clearedApprovalCheckpointCount: number;
}

export interface StartDraftAiAuditRunInput {
  draftVariantId: number;
  contentRevision: number;
  agentRunId?: number | null;
  providerKey?: AgentProviderKey;
  modelName?: string;
}

export interface CompleteDraftAiAuditRunInput {
  auditRunId: number;
  draftVariantId: number;
  contentRevision: number;
  summary?: string;
  findings: Array<{
    ruleKey: DraftAiAuditRuleKey;
    severity: DraftAuditSeverity;
    message: string;
  }>;
}

export interface FailDraftAiAuditRunInput {
  auditRunId: number;
  draftVariantId: number;
  contentRevision: number;
  errorMessage: string;
}

export type DraftVariantWithAudits = DraftVariant & {
  audits: DraftAuditFinding[];
  auditSeverity: DraftAuditSeverity;
};

export type DraftWithDetails = Draft & {
  campaign_name: string;
  candidate: CandidateWithTarget;
  variants: DraftVariantWithAudits[];
};

export interface DraftVariantInput {
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string;
}

export interface CreateDraftInput {
  candidateId: number;
  angle?: string;
  notes?: string;
  contentIntent?: DraftContentIntent;
  variants: DraftVariantInput[];
}

export interface UpdateDraftInput {
  id: number;
  angle?: string;
  notes?: string;
  status?: DraftStatus;
}

export interface UpdateDraftVariantInput {
  id: number;
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string;
}

export interface SetDraftVariantStatusInput {
  id: number;
  status: DraftVariantStatus;
}

export type DraftGenerationRequestStatus =
  | "pending"
  | "generated"
  | "saved"
  | "failed"
  | "dismissed";

export interface GeneratedDraftVariant {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
}

export interface DraftGenerationRequest {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  agent_run_id: number | null;
  provider_key: AgentProviderKey;
  model_name: string;
  playbook_key: AgentPlaybookKey | "";
  variant_count: number;
  content_intent: DraftContentIntent;
  workflow_run_id: number | null;
  workflow_step_id: number | null;
  angle: string;
  voice_notes: string;
  status: DraftGenerationRequestStatus;
  summary: string;
  generated_variants: GeneratedDraftVariant[];
  error_message: string;
  created_draft_id: number | null;
  created_at: string;
  updated_at: string;
  candidate: CandidateWithTarget;
}

export interface GenerateDraftVariantsInput {
  campaignId: number;
  candidateId: number;
  providerKey?: AgentProviderKey;
  modelName?: string;
  playbookKey?: AgentPlaybookKey | "";
  variantCount?: number;
  contentIntent?: DraftContentIntent;
  workflowRunId?: number | null;
  angle?: string;
  voiceNotes?: string;
}

export interface EligibleDraftWorkflowOption {
  workflowRunId: number;
  workflowStepId: number;
  candidateId: number;
  title: string;
  status: "running" | "blocked" | "failed";
}

export interface SaveGeneratedDraftInput {
  id: number;
}
