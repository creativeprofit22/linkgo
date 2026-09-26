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

export const DRAFT_QUALITY_CATEGORY_KEYS = [
  "hook_strength",
  "authenticity",
  "linkedin_fit",
  "specificity",
  "narrative_structure",
] as const;
export const DRAFT_QUALITY_THRESHOLD = 70 as const;
export const DRAFT_QUALITY_MAXIMUM_REWRITES = 2 as const;
export const DRAFT_QUALITY_RUN_STATUSES = [
  "pending",
  "running",
  "passed",
  "needs_revision",
  "failed",
  "cancelled",
] as const;
export const DRAFT_QUALITY_ATTEMPT_STATUSES = [
  "scoring",
  "scored",
  "rewritten",
  "passed",
  "failed",
] as const;

export type DraftQualityCategoryKey =
  (typeof DRAFT_QUALITY_CATEGORY_KEYS)[number];
export type DraftQualityRunStatus = (typeof DRAFT_QUALITY_RUN_STATUSES)[number];
export type DraftQualityAttemptStatus =
  (typeof DRAFT_QUALITY_ATTEMPT_STATUSES)[number];

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
  workflow_step_execution_id: number | null;
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

export interface DraftAiAuditSnapshot {
  draft_variant_id: number;
  campaign_id: number;
  content_revision: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

export interface DraftAiAuditFinding {
  id: number;
  audit_run_id: number;
  rule_key: DraftAiAuditRuleKey;
  severity: DraftAuditSeverity;
  message: string;
  created_at: string;
}

export interface DraftVariantAiAudit {
  status: DraftAiAuditRunStatus | null;
  run: DraftAiAuditRun | null;
  findings: DraftAiAuditFinding[];
}

export interface DraftQualityRun {
  id: number;
  draft_variant_id: number;
  starting_content_revision: number;
  current_content_revision: number;
  provider_key: AgentProviderKey;
  model_name: string;
  threshold: typeof DRAFT_QUALITY_THRESHOLD;
  maximum_rewrite_count: typeof DRAFT_QUALITY_MAXIMUM_REWRITES;
  applied_rewrite_count: number;
  status: DraftQualityRunStatus;
  final_score: number | null;
  summary: string;
  error_message: string;
  active_agent_run_id: number | null;
  active_ai_audit_run_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftQualityAttempt {
  id: number;
  run_id: number;
  attempt_number: number;
  content_revision: number;
  input_hook: string;
  input_body: string;
  input_cta: string;
  input_hashtags: string;
  rewritten_hook: string | null;
  rewritten_body: string | null;
  rewritten_cta: string | null;
  rewritten_hashtags: string | null;
  overall_score: number | null;
  status: DraftQualityAttemptStatus;
  agent_run_id: number | null;
  ai_audit_run_id: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface DraftQualityCategoryScore {
  id: number;
  attempt_id: number;
  category_key: DraftQualityCategoryKey;
  score: number;
  feedback: string;
  created_at: string;
}

export interface DraftQualityScorecard {
  run: DraftQualityRun;
  attempts: Array<
    DraftQualityAttempt & { categoryScores: DraftQualityCategoryScore[] }
  >;
}

export interface DraftQualityRewrite {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

export interface DraftQualityScoreInput {
  campaignId: number;
  draftVariantId: number;
  qualityRunId: number;
  attemptId: number;
  contentRevision: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
  threshold: typeof DRAFT_QUALITY_THRESHOLD;
  rewriteAllowed: boolean;
  priorCategoryFeedback: Array<{
    categoryKey: DraftQualityCategoryKey;
    feedback: string;
  }>;
  categoryScores: Array<{
    categoryKey: DraftQualityCategoryKey;
    score: number;
    feedback: string;
  }>;
  rewrite?: DraftQualityRewrite;
}

export interface ClaimDraftQualityInput {
  draftVariantId: number;
  providerKey?: AgentProviderKey;
  modelName?: string;
}

/** Native settlement DTO; provider-only request context must never cross this boundary. */
export interface ApplyDraftQualityScoreInput {
  qualityRunId: number;
  draftVariantId: number;
  attemptId: number;
  contentRevision: number;
  agentRunId: number;
  categoryScores: DraftQualityScoreInput["categoryScores"];
  rewrite?: DraftQualityRewrite;
  summary: string;
}

export interface ContinueDraftQualityInput {
  qualityRunId: number;
  draftVariantId: number;
}

export interface FailDraftQualityInput extends ContinueDraftQualityInput {
  /** The attempt this loop claimed; native rejects failures from older attempts. */
  attemptId: number;
  errorMessage: string;
}

/** Durable claim identity returned by native claim, continue, and resume. */
export interface DraftQualityClaimResult {
  qualityRunId: number;
  attemptId: number;
  agentRunId: number;
  campaignId: number;
  draftVariantId: number;
  contentRevision: number;
}

export interface ReconcileDraftQualityResult {
  reconciledRunIds: number[];
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
  failedExecutionIds: number[];
  failedWorkflowRunIds: number[];
  clearedApprovalCheckpointCount: number;
}

export interface StartDraftAiAuditRunInput {
  draftVariantId: number;
  contentRevision: number;
  agentRunId?: number | null;
  providerKey?: AgentProviderKey;
  modelName?: string;
}

export interface DraftAiAuditFindingInput {
  ruleKey: DraftAiAuditRuleKey;
  severity: DraftAuditSeverity;
  message: string;
}

/** Identity only: native reads findings from the auditor's own output. */
export interface CompleteDraftAiAuditRunInput {
  auditRunId: number;
  draftVariantId: number;
  contentRevision: number;
}

export interface FailDraftAiAuditRunInput {
  auditRunId: number;
  draftVariantId: number;
  contentRevision: number;
  errorMessage: string;
  agentRunId?: number | null;
}

/** Identity only: native reads the auditor's own persisted findings. */
export interface CompletePlannerDraftAuditInput {
  agentRunId: number;
}

export interface FailPlannerDraftAuditInput {
  agentRunId: number;
  errorSummary: string;
}

export interface ReconcileStalePlannerDraftAuditsInput {
  limit?: number;
}

export interface ReconcileStalePlannerDraftAuditsResult {
  failedAuditRunIds: number[];
  failedAgentRunIds: number[];
  failedExecutionIds: number[];
  failedWorkflowRunIds: number[];
}

export type DraftVariantWithAudits = DraftVariant & {
  audits: DraftAuditFinding[];
  auditSeverity: DraftAuditSeverity;
  aiAudit: DraftVariantAiAudit;
  qualityScorecard: DraftQualityScorecard | null;
};

export type DraftWithDetails = Draft & {
  campaign_name: string;
  candidate: CandidateWithTarget;
  variants: DraftVariantWithAudits[];
};

/** A capped draft list; `totalCount` counts every match before the cap. */
export interface DraftListPage {
  items: DraftWithDetails[];
  totalCount: number;
}

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
