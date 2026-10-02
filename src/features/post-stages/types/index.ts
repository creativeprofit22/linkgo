/**
 * Read-only lifecycle of one post, derived from existing ideas, drafts,
 * approvals and metrics. Nothing here is stored. Kept import-free so any
 * feature can use these types without creating a type cycle.
 */
export const POST_STAGE_KEYS = [
  "idea",
  "draft",
  "waiting",
  "scheduled",
  "posted",
  "results",
] as const;

export type PostStageKey = (typeof POST_STAGE_KEYS)[number];

export const POST_STAGE_LABELS: Readonly<Record<PostStageKey, string>> = {
  idea: "Idea",
  draft: "Draft",
  waiting: "Waiting for your OK",
  scheduled: "Scheduled",
  posted: "Posted",
  results: "Results",
};

/**
 * `current`: the post sits at this stage, nothing is wrong.
 * `needs-you`: the post waits for a human action at this stage.
 * `problem`: something failed at this stage.
 */
export type PostStageState = "current" | "needs-you" | "problem";

export interface PostStage {
  key: PostStageKey;
  state: PostStageState;
  /** One plain sentence explaining the stage, shown next to the tracker. */
  detail: string;
  /** The draft carrying this post, once one exists. */
  draftId: number | null;
  /** The approval deciding this post, once one exists. */
  approvalId: number | null;
}

export interface PostStageIndex {
  byCandidateId: ReadonlyMap<number, PostStage>;
  byDraftId: ReadonlyMap<number, PostStage>;
  byApprovalId: ReadonlyMap<number, PostStage>;
}

/** The fields of a draft the stage derivation reads. */
export interface PostStageDraftInput {
  id: number;
  candidate_post_id: number;
  status: "drafting" | "needs_revision" | "ready_for_review" | "archived";
}

/** The fields of an approval the stage derivation reads. */
export interface PostStageApprovalInput {
  id: number;
  draft_id: number;
  status:
    | "needs_review"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "scheduled"
    | "published"
    | "cancelled";
  created_at: string;
  scheduleJob: {
    status: "scheduled" | "cancelled" | "completed" | "failed";
  } | null;
  publishAttempts: ReadonlyArray<{
    id: number;
    status: "succeeded" | "failed";
  }>;
}

export interface PostStageSources {
  drafts: readonly PostStageDraftInput[];
  approvals: readonly PostStageApprovalInput[];
  /** Approval ids with at least one recorded post metric. */
  approvalIdsWithMetrics: ReadonlySet<number>;
}
