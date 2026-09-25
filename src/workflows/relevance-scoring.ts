import { relevanceScoringContextSchema } from "@/features/candidate-queue/schemas";
import type { RelevanceScoringContext } from "@/features/candidate-queue/types";
import { invokeCommand } from "@/lib/tauri";
import { plannerScoringScopeRowsSchema } from "@/workflows/record-schemas";
import {
  claimNativeRelevanceScoring,
  failNativeRelevanceScoring,
  settleNativeRelevanceScoring,
  type NativeScorerClaimInput,
} from "@/workflows/relevance-scoring-commands";
import type { WorkflowStepStatus } from "@/workflows/types";

interface PlannerScoringHeaderRow {
  workflow_run_id: number;
  workflow_status: string;
  current_step_key: string;
  workflow_step_id: number;
  score_step_status: WorkflowStepStatus;
  campaign_id: number;
  campaign_name: string;
  campaign_product: string;
  campaign_audience: string;
  campaign_voice: string;
  campaign_tone: string;
  campaign_status: string;
  autopilot_plan_id: number;
  plan_status: string;
  source_import_batch_id: number;
  source_campaign_id: number;
}

interface PlannerCandidateArtifactRow {
  artifact_id: number;
  artifact_order: number;
  workflow_step_id: number | null;
  candidate_id: number | null;
  candidate_campaign_id: number | null;
  candidate_status: "new" | "shortlisted" | "rejected" | "drafted" | null;
  relevance_score: number | null;
  source_keyword: string | null;
  author_name: string | null;
  author_profile_url: string | null;
  posted_at: string | null;
  source_url: string | null;
  content: string | null;
}

export interface PlannerScoringCandidate {
  id: number;
  artifactOrder: number;
  status: "new" | "shortlisted" | "rejected" | "drafted";
  relevanceScore: number | null;
  sourceKeyword: string;
  authorName: string;
  authorProfileUrl: string;
  postedAt: string | null;
  sourceUrl: string;
  contentExcerpt: string;
}

export interface PlannerScoringScope {
  workflowRunId: number;
  workflowStepId: number;
  workflowStatus: string;
  scoreStepStatus: WorkflowStepStatus;
  campaignId: number;
  campaignName: string;
  autopilotPlanId: number;
  sourceImportBatchId: number;
  artifactCount: number;
  currentCandidates: PlannerScoringCandidate[];
  unscoredCandidates: PlannerScoringCandidate[];
  alreadyScoredCandidates: PlannerScoringCandidate[];
  ineligibleCandidates: PlannerScoringCandidate[];
  removedCandidateIds: number[];
  campaign: RelevanceScoringContext["campaign"];
}

export interface PlannerScoringPolicy {
  minimumScore: number;
  autoRejectBelowMinimum: boolean;
}

export interface PlannerScoringClaim {
  executionId: number;
  agentRunId: number;
  workflowRunId: number;
  workflowStepId: number;
}

export type PlannerScoringClaimInput = Omit<
  NativeScorerClaimInput,
  "workflowRunId"
>;

function compactExcerpt(content: string): string {
  return content.trim().replace(/\s+/gu, " ").slice(0, 1_200);
}

/** Validates the planner scope header; messages are unchanged. */
function assertHeader(
  header: PlannerScoringHeaderRow | null,
): PlannerScoringHeaderRow {
  if (header === null) {
    throw new Error("Planner scoring workflow scope was not found");
  }
  if (header.plan_status !== "planned") {
    throw new Error("Autopilot plan is not available for scoring");
  }
  if (header.source_campaign_id !== header.campaign_id) {
    throw new Error("Source batch belongs to a different campaign");
  }
  if (header.campaign_status === "archived") {
    throw new Error("Campaign is archived");
  }
  if (header.workflow_status === "cancelled") {
    throw new Error("Workflow is cancelled");
  }
  if (
    header.current_step_key !== "score" &&
    header.score_step_status !== "completed"
  ) {
    throw new Error("Workflow score step is not runnable");
  }
  return header;
}

/**
 * Loads the planner scoring scope. The header, candidate artifacts (capped at
 * 500) and campaign keywords are read natively in one transaction
 * (`workflow_store::planner_scoring_scope`); validation stays here.
 */
export async function loadPlannerScoringScope(
  workflowRunId: number,
): Promise<PlannerScoringScope> {
  const rows = plannerScoringScopeRowsSchema.parse(
    await invokeCommand("linkgo_workflow_planner_scoring_scope", {
      input: { id: workflowRunId },
    }),
  );
  const header = assertHeader(rows.header);
  const artifactRows: PlannerCandidateArtifactRow[] = rows.artifacts;
  if (artifactRows.length === 0) {
    throw new Error("No candidate scope is attached to this score step");
  }

  const currentCandidates: PlannerScoringCandidate[] = [];
  const removedCandidateIds: number[] = [];
  for (const artifact of artifactRows) {
    if (artifact.workflow_step_id !== header.workflow_step_id) {
      throw new Error(
        "Candidate scope is attached to a different workflow step",
      );
    }
    if (artifact.candidate_id === null) {
      removedCandidateIds.push(artifact.artifact_id);
      continue;
    }
    if (artifact.candidate_campaign_id !== header.campaign_id) {
      throw new Error("Candidate scope contains a cross-campaign artifact");
    }
    if (
      artifact.candidate_status === null ||
      artifact.source_url === null ||
      artifact.content === null
    ) {
      removedCandidateIds.push(artifact.artifact_id);
      continue;
    }
    currentCandidates.push({
      id: artifact.candidate_id,
      artifactOrder: artifact.artifact_order,
      status: artifact.candidate_status,
      relevanceScore: artifact.relevance_score,
      sourceKeyword: artifact.source_keyword ?? "",
      authorName: artifact.author_name ?? "",
      authorProfileUrl: artifact.author_profile_url ?? "",
      postedAt: artifact.posted_at,
      sourceUrl: artifact.source_url,
      contentExcerpt: compactExcerpt(artifact.content),
    });
  }

  const alreadyScoredCandidates = currentCandidates.filter(
    (candidate) => candidate.relevanceScore !== null,
  );
  const unscoredCandidates = currentCandidates.filter(
    (candidate) =>
      candidate.status === "new" && candidate.relevanceScore === null,
  );
  const ineligibleCandidates = currentCandidates.filter(
    (candidate) =>
      candidate.status !== "new" && candidate.relevanceScore === null,
  );

  return {
    workflowRunId: header.workflow_run_id,
    workflowStepId: header.workflow_step_id,
    workflowStatus: header.workflow_status,
    scoreStepStatus: header.score_step_status,
    campaignId: header.campaign_id,
    campaignName: header.campaign_name,
    autopilotPlanId: header.autopilot_plan_id,
    sourceImportBatchId: header.source_import_batch_id,
    artifactCount: artifactRows.length,
    currentCandidates,
    unscoredCandidates,
    alreadyScoredCandidates,
    ineligibleCandidates,
    removedCandidateIds,
    campaign: {
      id: header.campaign_id,
      name: header.campaign_name,
      product: header.campaign_product,
      audience: header.campaign_audience,
      voice: header.campaign_voice,
      tone: header.campaign_tone,
      keywords: rows.keywords,
    },
  };
}

export function buildRelevanceScoringContext(
  scope: PlannerScoringScope,
  policy: PlannerScoringPolicy,
): RelevanceScoringContext {
  return relevanceScoringContextSchema.parse({
    campaign: scope.campaign,
    sourceBatchId: scope.sourceImportBatchId,
    autopilotPlanId: scope.autopilotPlanId,
    workflowRunId: scope.workflowRunId,
    workflowStepId: scope.workflowStepId,
    minimumScore: policy.minimumScore,
    autoRejectBelowMinimum: policy.autoRejectBelowMinimum,
    candidates: scope.unscoredCandidates.map((candidate) => ({
      id: candidate.id,
      sourceKeyword: candidate.sourceKeyword,
      authorName: candidate.authorName,
      authorProfileUrl: candidate.authorProfileUrl,
      postedAt: candidate.postedAt,
      sourceUrl: candidate.sourceUrl,
      contentExcerpt: candidate.contentExcerpt,
    })),
  });
}

export async function claimPlannerScoringExecution(
  workflowRunId: number,
  input: PlannerScoringClaimInput,
): Promise<PlannerScoringClaim> {
  return claimNativeRelevanceScoring({ workflowRunId, ...input });
}

export async function settlePlannerScoringWithoutModel(
  workflowRunId: number,
  outcome: "completed" | "blocked",
  summary: string,
): Promise<void> {
  await settleNativeRelevanceScoring({ workflowRunId, outcome, summary });
}

export async function failPlannerScoringClaim(
  claim: PlannerScoringClaim,
  error: unknown,
): Promise<void> {
  await failNativeRelevanceScoring({
    executionId: claim.executionId,
    workflowRunId: claim.workflowRunId,
    workflowStepId: claim.workflowStepId,
    errorSummary:
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Workflow scorer failed",
  });
}
