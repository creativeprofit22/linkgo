import type {
  OpenPublishExecution,
  PublishExecutionKind,
} from "@/features/publish-reconciliation/types";

/**
 * Renderer hint that native publishing currently refuses a new publish for an
 * item. The native reservation gate stays the source of truth.
 */
export type PublishLock = "publishing" | "awaiting_reconciliation";

/**
 * Returns the lock for one post/comment subject from open executions.
 * `outcome_unknown` wins over `reserved`/`in_flight` because it needs action.
 */
export function findPublishLock(
  executions: readonly OpenPublishExecution[],
  kind: PublishExecutionKind,
  subjectId: number,
): PublishLock | null {
  let lock: PublishLock | null = null;
  for (const execution of executions) {
    if (execution.kind !== kind || execution.subjectId !== subjectId) continue;
    if (execution.status === "outcome_unknown")
      return "awaiting_reconciliation";
    lock = "publishing";
  }
  return lock;
}

/**
 * Returns the open execution for one subject whose LinkedIn outcome is
 * unknown, so the post/comment card can offer an inline resolver. Native
 * reconciliation still validates the fence and resolution.
 */
export function findOutcomeUnknownExecution(
  executions: readonly OpenPublishExecution[],
  kind: PublishExecutionKind,
  subjectId: number,
): OpenPublishExecution | null {
  return (
    executions.find(
      (execution) =>
        execution.kind === kind &&
        execution.subjectId === subjectId &&
        execution.status === "outcome_unknown",
    ) ?? null
  );
}

export function getPublishLockLabel(lock: PublishLock): string {
  return lock === "awaiting_reconciliation"
    ? "We couldn't confirm it posted. Check LinkedIn, then tell us below."
    : "Posting…";
}
