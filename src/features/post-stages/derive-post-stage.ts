import {
  POST_STAGE_KEYS,
  type PostStage,
  type PostStageApprovalInput,
  type PostStageDraftInput,
  type PostStageIndex,
  type PostStageKey,
  type PostStageSources,
} from "@/features/post-stages/types";

function stageRank(key: PostStageKey): number {
  return POST_STAGE_KEYS.indexOf(key);
}

/** The stage of an idea nobody has written a draft for yet. */
export function ideaStage(): PostStage {
  return {
    key: "idea",
    state: "current",
    detail: "Not written yet",
    draftId: null,
    approvalId: null,
  };
}

/** Rejected and cancelled approvals no longer carry the post forward. */
export function isLiveApproval(approval: PostStageApprovalInput): boolean {
  return approval.status !== "rejected" && approval.status !== "cancelled";
}

function latestAttempt(
  approval: PostStageApprovalInput,
): PostStageApprovalInput["publishAttempts"][number] | undefined {
  let latest: PostStageApprovalInput["publishAttempts"][number] | undefined;
  for (const attempt of approval.publishAttempts)
    if (latest === undefined || attempt.id > latest.id) latest = attempt;
  return latest;
}

/** The stage of one approval, including rejected or cancelled ones. */
export function deriveApprovalStage(
  approval: PostStageApprovalInput,
  hasMetrics: boolean,
): PostStage {
  const ids = { draftId: approval.draft_id, approvalId: approval.id };
  const stage = (
    key: PostStageKey,
    state: PostStage["state"],
    detail: string,
  ): PostStage => ({ key, state, detail, ...ids });

  if (approval.status === "rejected")
    return stage("waiting", "problem", "Rejected — this version won't post");
  if (approval.status === "cancelled")
    return stage("waiting", "problem", "Approval cancelled");

  const succeeded = approval.publishAttempts.some(
    (attempt) => attempt.status === "succeeded",
  );
  if (approval.status === "published" || succeeded)
    return hasMetrics
      ? stage("results", "current", "Results recorded")
      : stage("posted", "current", "Posted on LinkedIn");

  if (approval.status === "needs_review")
    return stage("waiting", "needs-you", "Waiting for your OK");
  if (approval.status === "changes_requested")
    return stage("waiting", "needs-you", "Changes requested");

  const job = approval.scheduleJob;
  if (job?.status === "failed" || latestAttempt(approval)?.status === "failed")
    return stage("scheduled", "problem", "Posting failed — check Auto-posting");
  if (job?.status === "scheduled")
    return stage("scheduled", "current", "Scheduled");
  if (job?.status === "completed")
    return stage("posted", "current", "Posted on LinkedIn");
  return stage("scheduled", "needs-you", "Approved — pick a time");
}

function draftOnlyStage(draft: PostStageDraftInput): PostStage {
  const ids = { draftId: draft.id, approvalId: null };
  switch (draft.status) {
    case "ready_for_review":
      return {
        key: "draft",
        state: "needs-you",
        detail: "Ready to send for approval",
        ...ids,
      };
    case "needs_revision":
      return {
        key: "draft",
        state: "needs-you",
        detail: "Needs edits",
        ...ids,
      };
    case "archived":
      return { key: "draft", state: "current", detail: "Archived", ...ids };
    case "drafting":
      return {
        key: "draft",
        state: "current",
        detail: "Being written",
        ...ids,
      };
  }
}

interface Ranked {
  stage: PostStage;
  /** Newer wins a tie: approval `created_at`, then id. */
  createdAt: string;
  id: number;
}

function isMoreAdvanced(next: Ranked, current: Ranked | undefined): boolean {
  if (current === undefined) return true;
  const rankDelta = stageRank(next.stage.key) - stageRank(current.stage.key);
  if (rankDelta !== 0) return rankDelta > 0;
  if (next.createdAt !== current.createdAt)
    return next.createdAt > current.createdAt;
  return next.id > current.id;
}

/**
 * Builds the stage of every idea, draft and approval in one pass. When an
 * idea or draft has several live approvals, the most advanced wins and ties
 * go to the newest.
 */
export function derivePostStageIndex(
  sources: PostStageSources,
): PostStageIndex {
  const byApprovalId = new Map<number, PostStage>();
  const bestByDraftId = new Map<number, Ranked>();

  for (const approval of sources.approvals) {
    const stage = deriveApprovalStage(
      approval,
      sources.approvalIdsWithMetrics.has(approval.id),
    );
    byApprovalId.set(approval.id, stage);
    if (!isLiveApproval(approval)) continue;
    const ranked = { stage, createdAt: approval.created_at, id: approval.id };
    if (isMoreAdvanced(ranked, bestByDraftId.get(approval.draft_id)))
      bestByDraftId.set(approval.draft_id, ranked);
  }

  const byDraftId = new Map<number, PostStage>();
  const bestByCandidateId = new Map<number, Ranked>();
  for (const draft of sources.drafts) {
    const stage = bestByDraftId.get(draft.id)?.stage ?? draftOnlyStage(draft);
    byDraftId.set(draft.id, stage);
    const ranked = { stage, createdAt: "", id: draft.id };
    if (isMoreAdvanced(ranked, bestByCandidateId.get(draft.candidate_post_id)))
      bestByCandidateId.set(draft.candidate_post_id, ranked);
  }

  const byCandidateId = new Map<number, PostStage>();
  for (const [candidateId, ranked] of bestByCandidateId)
    byCandidateId.set(candidateId, ranked.stage);

  return { byCandidateId, byDraftId, byApprovalId };
}
