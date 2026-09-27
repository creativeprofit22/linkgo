import { z } from "zod";
import { invokeCommand } from "@/lib/tauri";
import {
  candidateAgentRunContextSchema,
  candidateDiscoveryItemListSchema,
  candidateDiscoveryItemRowSchema,
  candidateIdSchema,
  candidateListPageSchema,
  candidateMutationResultSchema,
  candidateWithTargetRowListSchema,
  createCandidateSchema,
  dismissDiscoveryItemSchema,
  promoteDiscoveryItemSchema,
  relevanceScoringContextSchema,
  runCandidateDiscoverySchema,
  scoreCandidatesSchema,
  updateCandidateSchema,
} from "@/features/candidate-queue/schemas";
import type {
  CandidateAgentRunContext,
  CandidateDiscoveryItem,
  CandidateListPage,
  CandidateStatus,
  CandidateWithTarget,
  CreateCandidateInput,
  DismissDiscoveryItemInput,
  PromoteDiscoveryItemInput,
  RunCandidateDiscoveryInput,
  ScoreCandidatesInput,
  TargetPost,
  UpdateCandidateInput,
} from "@/features/candidate-queue/types";
import {
  scoreRelevanceInputSchema,
  type ResearchPostsInput,
  type ResearchPostsOutput,
  type ScoreRelevanceInput,
  type ScoreRelevanceOutput,
} from "@/agent/schemas";
import type { AgentToolExecutionContext } from "@/agent/types";
import { resolveDefaultAgentModel } from "@/features/integrations/data";
import { applyNativeRelevanceScores } from "@/workflows/relevance-scoring-commands";

interface TargetPostRow {
  id: number;
  platform: "linkedin";
  url: string;
  normalized_url: string;
  platform_resource_urn: string;
  author_name: string;
  author_profile_url: string;
  posted_at: string | null;
  content: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

type CandidateWithTargetRow = z.infer<
  typeof candidateWithTargetRowListSchema
>[number];
type CandidateDiscoveryItemRow = z.infer<
  typeof candidateDiscoveryItemRowSchema
>;

export function mapTargetPost(row: TargetPostRow): TargetPost {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    normalized_url: row.normalized_url,
    platform_resource_urn: row.platform_resource_urn,
    author_name: row.author_name,
    author_profile_url: row.author_profile_url,
    posted_at: row.posted_at,
    content: row.content,
    content_hash: row.content_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapCandidateWithTarget(
  row: CandidateWithTargetRow,
): CandidateWithTarget {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    target_post_id: row.target_post_id,
    source_keyword: row.source_keyword,
    status: row.status,
    relevance_score: row.relevance_score,
    score_reason: row.score_reason,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    campaign_name: row.campaign_name,
    target: {
      id: row.target_id,
      platform: row.target_platform,
      url: row.target_url,
      normalized_url: row.target_normalized_url,
      platform_resource_urn: row.target_platform_resource_urn,
      author_name: row.target_author_name,
      author_profile_url: row.target_author_profile_url,
      posted_at: row.target_posted_at,
      content: row.target_content,
      content_hash: row.target_content_hash,
      created_at: row.target_created_at,
      updated_at: row.target_updated_at,
    },
  };
}

function mapDiscoveryItem(
  row: CandidateDiscoveryItemRow,
): CandidateDiscoveryItem {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    agent_run_id: row.agent_run_id,
    workflow_run_id: row.workflow_run_id,
    kind: row.kind,
    title: row.title,
    keyword: row.keyword,
    rationale: row.rationale,
    source_keyword: row.source_keyword,
    confidence_score: row.confidence_score,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toToolDiscoveryItem(
  item: CandidateDiscoveryItem,
): ResearchPostsOutput["discoveryItems"][number] {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    keyword: item.keyword,
    rationale: item.rationale,
    sourceKeyword: item.source_keyword,
    confidenceScore: item.confidence_score,
    status: item.status,
  };
}

/**
 * Creates a manual candidate. Campaign mutability, dedupe, target reuse and
 * the candidate + dedupe-key inserts settle natively in one transaction.
 * The URL is normalized here (WHATWG `URL`) so dedupe keys stay identical
 * to rows written by earlier versions.
 */
export async function createCandidate(
  input: CreateCandidateInput,
): Promise<number> {
  const parsed = createCandidateSchema.parse(input);
  return candidateMutationResultSchema.parse(
    await invokeCommand("linkgo_candidate_create", {
      input: parsed,
    }),
  ).id;
}

/**
 * Lists candidates natively (`candidate_queue_store.rs`), newest first with
 * rejected rows last, capped at 500. `totalCount` is the uncapped number of
 * matching candidates, so callers can tell when `items` was truncated.
 */
export async function listCandidatePage(
  campaignId?: number,
): Promise<CandidateListPage> {
  const parsedCampaignId = candidateIdSchema.optional().parse(campaignId);
  const page = candidateListPageSchema.parse(
    await invokeCommand("linkgo_candidate_list", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
  return {
    items: page.rows.map(mapCandidateWithTarget),
    totalCount: Math.max(page.totalCount, page.rows.length),
  };
}

/** The capped candidate rows only; see `listCandidatePage` for the total. */
export async function listCandidates(
  campaignId?: number,
): Promise<CandidateWithTarget[]> {
  return (await listCandidatePage(campaignId)).items;
}

/** Lists a campaign's live (non-dismissed) discovery items, capped at 200. */
export async function listDiscoveryItems(
  campaignId: number,
): Promise<CandidateDiscoveryItem[]> {
  const parsedCampaignId = candidateIdSchema.parse(campaignId);
  const rows = candidateDiscoveryItemListSchema.parse(
    await invokeCommand("linkgo_candidate_discovery_list", {
      input: { campaignId: parsedCampaignId },
    }),
  );
  return rows.map(mapDiscoveryItem);
}

/**
 * Checks the campaign can mutate and reads its seed keywords and default
 * scoring candidates natively. The agent run starts after this returns, so
 * no provider call is held inside a database transaction.
 */
async function getAgentRunContext(
  campaignId: number,
): Promise<CandidateAgentRunContext> {
  return candidateAgentRunContextSchema.parse(
    await invokeCommand("linkgo_candidate_agent_run_context", {
      input: { campaignId },
    }),
  );
}

export async function runCandidateDiscovery(
  input: RunCandidateDiscoveryInput,
): Promise<number> {
  const parsed = runCandidateDiscoverySchema.parse(input);
  const context = await getAgentRunContext(parsed.campaignId);
  const seedKeywords =
    parsed.seedKeywords.length > 0 ? parsed.seedKeywords : context.seedKeywords;
  const providerKey = parsed.providerKey;
  const modelName =
    parsed.modelName || (await resolveDefaultAgentModel(providerKey));
  const inputSummary = [
    "Run operator-triggered local discovery for the Candidate Queue.",
    `Seed keywords: ${seedKeywords.join(", ") || "campaign context"}.`,
    parsed.notes ? `Notes: ${parsed.notes}` : "Notes: none.",
  ].join("\n");
  const { createAgentRun, startAgentRun } =
    await import("@/features/agent-runtime/data");
  const runId = await createAgentRun({
    campaignId: parsed.campaignId,
    agentRole: "researcher",
    providerKey,
    modelName,
    inputSummary,
    ...(parsed.playbookKey ? { playbookKey: parsed.playbookKey } : {}),
  });
  await startAgentRun({ id: runId });
  return runId;
}

export async function scoreCandidates(
  input: ScoreCandidatesInput,
): Promise<number> {
  const parsed = scoreCandidatesSchema.parse(input);
  const context = await getAgentRunContext(parsed.campaignId);
  const candidatePostIds =
    parsed.candidatePostIds && parsed.candidatePostIds.length > 0
      ? parsed.candidatePostIds
      : context.scoringCandidateIds;
  const providerKey = parsed.providerKey;
  const modelName =
    parsed.modelName || (await resolveDefaultAgentModel(providerKey));
  const inputSummary = [
    "Score operator-selected Candidate Queue posts.",
    `Candidate IDs: ${candidatePostIds.join(", ") || "none"}.`,
    `Minimum score: ${parsed.minimumScore}.`,
    `Auto-reject: ${parsed.autoRejectBelowMinimum ? "true" : "false"}.`,
  ].join("\n");
  const { createAgentRun, startAgentRun } =
    await import("@/features/agent-runtime/data");
  const runId = await createAgentRun({
    campaignId: parsed.campaignId,
    agentRole: "scorer",
    providerKey,
    modelName,
    inputSummary,
    ...(parsed.playbookKey ? { playbookKey: parsed.playbookKey } : {}),
  });
  await startAgentRun({ id: runId });
  return runId;
}

/** Promotes a discovery suggestion (adding its keyword) natively. */
export async function promoteDiscoveryItem(
  input: PromoteDiscoveryItemInput,
): Promise<void> {
  const parsed = promoteDiscoveryItemSchema.parse(input);
  candidateMutationResultSchema.parse(
    await invokeCommand("linkgo_candidate_promote_discovery_item", {
      input: parsed,
    }),
  );
}

export async function dismissDiscoveryItem(
  input: DismissDiscoveryItemInput,
): Promise<void> {
  const parsed = dismissDiscoveryItemSchema.parse(input);
  // Native checks the campaign can mutate and that the item belongs to it.
  await invokeCommand<null>("linkgo_candidate_dismiss_discovery_item", {
    input: parsed,
  });
}

export async function updateCandidate(
  input: UpdateCandidateInput,
): Promise<void> {
  const parsed = updateCandidateSchema.parse(input);
  // Only provided fields are sent; an explicit `relevanceScore: null` clears
  // the score. Native re-validates and writes in one transaction.
  await invokeCommand<null>("linkgo_candidate_update", { input: parsed });
}

export async function setCandidateStatus(
  id: number,
  status: CandidateStatus,
): Promise<void> {
  await updateCandidate({ id, status });
}

/**
 * Deletes a candidate natively, first dismissing its linked draft requests,
 * cancelling their pending agent runs and blocking their workflow steps.
 */
export async function deleteCandidate(id: number): Promise<void> {
  const parsed = candidateIdSchema.parse(id);
  candidateMutationResultSchema.parse(
    await invokeCommand("linkgo_candidate_delete", {
      input: { id: parsed },
    }),
  );
}

export async function insertDiscoveryItemsFromTool(
  input: ResearchPostsInput,
  context: AgentToolExecutionContext,
): Promise<ResearchPostsOutput["discoveryItems"]> {
  if (context.request.campaignId !== input.campaignId) {
    throw new Error("Research request belongs to a different campaign");
  }
  // Native compacts text, drops empty and duplicate suggestions, reuses live
  // matches, checks campaign and agent-run ownership, and writes every row in
  // one transaction (`candidate_queue_store.rs`).
  const rows = z
    .array(candidateDiscoveryItemRowSchema)
    .max(25)
    .parse(
      await invokeCommand("linkgo_candidate_discovery_insert", {
        input: {
          campaignId: input.campaignId,
          agentRunId: context.request.runId,
          workflowRunId: context.request.workflowRunId,
          suggestions: input.suggestions.slice(0, 25).map((suggestion) => ({
            kind: suggestion.kind,
            title: suggestion.title,
            keyword: suggestion.keyword,
            rationale: suggestion.rationale,
            sourceKeyword: suggestion.sourceKeyword,
            confidenceScore: suggestion.confidenceScore ?? null,
          })),
        },
      }),
    );
  return rows.map(mapDiscoveryItem).map(toToolDiscoveryItem);
}

export async function applyRelevanceScoresFromTool(
  input: ScoreRelevanceInput,
  context: AgentToolExecutionContext,
): Promise<ScoreRelevanceOutput["scores"]> {
  const parsed = scoreRelevanceInputSchema.parse(input);
  if (context.request.campaignId !== parsed.campaignId) {
    throw new Error("Score request belongs to a different campaign");
  }
  const plannerContext = relevanceScoringContextSchema.safeParse(
    context.request.inputContext,
  );
  if (plannerContext.success) {
    const expectedIds = plannerContext.data.candidates.map(
      (candidate) => candidate.id,
    );
    const requestedIds = new Set(parsed.candidatePostIds);
    if (
      expectedIds.length !== requestedIds.size ||
      expectedIds.some((id) => !requestedIds.has(id))
    ) {
      throw new Error(
        "Score request does not match the attached workflow scope",
      );
    }
    if (
      parsed.minimumScore !== plannerContext.data.minimumScore ||
      parsed.autoRejectBelowMinimum !==
        plannerContext.data.autoRejectBelowMinimum
    ) {
      throw new Error("Score policy does not match the operator confirmation");
    }
  }

  return applyNativeRelevanceScores({
    agentRunId: context.request.runId,
    campaignId: parsed.campaignId,
    candidatePostIds: parsed.candidatePostIds,
    minimumScore: parsed.minimumScore,
    autoRejectBelowMinimum: parsed.autoRejectBelowMinimum,
    scores: parsed.scores,
  });
}
