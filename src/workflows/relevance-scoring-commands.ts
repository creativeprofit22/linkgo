import type { AgentLoopResult, AgentProviderKey } from "@/agent/types";
import type { AgentPlaybookKey } from "@/agent/playbooks";
import { IS_TAURI, IS_TEST } from "@/lib/env";
import { invokeCommand, toNativeCommandError } from "@/lib/tauri";

export interface NativeRelevanceScoringClaim {
  executionId: number;
  agentRunId: number;
  workflowRunId: number;
  workflowStepId: number;
}

export interface NativeScorerClaimInput {
  workflowRunId: number;
  providerKey: AgentProviderKey;
  modelName: string;
  playbookKey: AgentPlaybookKey | "";
  inputSummary: string;
  inputContext: Record<string, unknown>;
}

export interface NativeRelevanceScore {
  candidatePostId: number;
  score: number;
  rationale: string;
}

export interface NativeApplyRelevanceScoresInput {
  agentRunId: number;
  campaignId: number;
  candidatePostIds: number[];
  minimumScore: number;
  autoRejectBelowMinimum: boolean;
  scores: NativeRelevanceScore[];
}

type InvokeFn = (command: string, args?: unknown) => Promise<unknown>;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function isInvoke(candidate: unknown): candidate is InvokeFn {
  return typeof candidate === "function";
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInvoke(candidate) ? candidate : null;
}

async function invokeScoringCommand<T>(
  command: string,
  input: unknown,
): Promise<T> {
  const injected = getInjectedInvoke();
  if (injected) {
    try {
      return (await injected(command, { input })) as T;
    } catch (error: unknown) {
      throw toNativeCommandError(error);
    }
  }
  if (!IS_TAURI) {
    throw new Error("Planner scoring requires the Linkgo desktop app");
  }
  return invokeCommand<T>(command, { input });
}

export function claimNativeRelevanceScoring(
  input: NativeScorerClaimInput,
): Promise<NativeRelevanceScoringClaim> {
  return invokeScoringCommand("linkgo_relevance_scoring_claim", input);
}

export function startNativeRelevanceScorer(agentRunId: number): Promise<void> {
  return invokeScoringCommand("linkgo_relevance_scoring_start", {
    agentRunId,
  });
}

export function applyNativeRelevanceScores(
  input: NativeApplyRelevanceScoresInput,
): Promise<NativeRelevanceScore[]> {
  return invokeScoringCommand("linkgo_relevance_scoring_apply_scores", input);
}

export function settleNativeRelevanceScoring(input: {
  workflowRunId: number;
  outcome: "completed" | "blocked";
  summary: string;
}): Promise<void> {
  return invokeScoringCommand("linkgo_relevance_scoring_settle", input);
}

export function failNativeRelevanceScoring(input: {
  executionId: number;
  workflowRunId: number;
  workflowStepId: number;
  errorSummary: string;
}): Promise<void> {
  return invokeScoringCommand("linkgo_relevance_scoring_fail", input);
}

export function reconcileNativeRelevanceScorer(
  agentRunId: number,
  result: AgentLoopResult,
): Promise<void> {
  return invokeScoringCommand("linkgo_relevance_scoring_reconcile", {
    agentRunId,
    status: result.status,
    outputSummary: result.outputSummary,
    errorMessage: result.errorMessage,
    iterationCount: result.iterationCount,
    toolCalls: result.toolCalls,
  });
}

export function failNativeRelevanceScorerAgent(
  agentRunId: number,
  error: unknown,
): Promise<void> {
  return invokeScoringCommand("linkgo_relevance_scoring_fail_agent", {
    agentRunId,
    errorSummary:
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Workflow scorer failed",
  });
}
