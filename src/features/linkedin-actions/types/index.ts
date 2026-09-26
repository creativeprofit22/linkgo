export interface LinkedInPublishPostInput {
  approvalId: number;
  scheduleJobId?: number | undefined;
  commentary: string;
  idempotencyKey: string;
}

export interface LinkedInPublishCommentInput {
  commentThreadId: number;
  commentary: string;
  targetUrn: string;
  idempotencyKey: string;
}

/** LinkedIn created the item and native code settled every local record. */
export interface ExecutionOutcomeSucceeded {
  status: "succeeded";
  executionId: number;
  platformId: string;
  externalUrl: string;
}

/** LinkedIn definitely did not create the item; local state was restored. */
export interface ExecutionOutcomeFailed {
  status: "failed";
  executionId: number;
  message: string;
}

/**
 * LinkedIn may have created the item. It is never retried and must be
 * reconciled by an operator in Safety before the item can be published again.
 */
export interface ExecutionOutcomeUnknown {
  status: "outcomeUnknown";
  executionId: number;
  message: string;
}

/** Refused before any LinkedIn call. */
export interface ExecutionOutcomeBlocked {
  status: "blocked";
  message: string;
}

/** Recovery took over the execution; the result is kept for reconciliation. */
export interface ExecutionOutcomeStaleOwner {
  status: "staleOwner";
  executionId: number;
  message: string;
}

export type ExecutionOutcome =
  | ExecutionOutcomeSucceeded
  | ExecutionOutcomeFailed
  | ExecutionOutcomeUnknown
  | ExecutionOutcomeBlocked
  | ExecutionOutcomeStaleOwner;
