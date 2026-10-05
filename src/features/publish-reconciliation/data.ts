import { invokeCommand } from "@/lib/tauri";
import {
  openPublishExecutionListSchema,
  reconcilePublishExecutionInputSchema,
  reconcilePublishExecutionResultSchema,
} from "@/features/publish-reconciliation/schemas";
import type {
  OpenPublishExecution,
  ReconcilePublishExecutionInput,
  ReconcilePublishExecutionResult,
  UnclearPublishOutcome,
  UnclearPublishOutcomesInput,
} from "@/features/publish-reconciliation/types";

/**
 * Pure: only `outcome_unknown` executions need a person; reserved and
 * in-flight ones settle on their own. Oldest first so the longest wait leads.
 */
export function deriveUnclearPublishOutcomes(
  executions: readonly OpenPublishExecution[],
): UnclearPublishOutcome[] {
  return executions
    .filter((execution) => execution.status === "outcome_unknown")
    .map((execution) => ({
      executionId: execution.id,
      kind: execution.kind,
      subjectId: execution.subjectId,
      campaignId: execution.campaignId,
      campaignName: execution.campaignName,
      sentAt: execution.sentAt,
      updatedAt: execution.updatedAt,
    }))
    .sort((a, b) =>
      a.updatedAt === b.updatedAt
        ? a.executionId - b.executionId
        : a.updatedAt < b.updatedAt
          ? -1
          : 1,
    );
}

/** Read-only: posts or comments where we can't tell if LinkedIn got them. */
export async function listUnclearPublishOutcomes(
  input: UnclearPublishOutcomesInput = {},
): Promise<UnclearPublishOutcome[]> {
  const executions = await listOpenPublishExecutions();
  input.signal?.throwIfAborted();
  return deriveUnclearPublishOutcomes(executions);
}

/**
 * Lists durable publish executions that are not settled yet (reserved,
 * in flight, or awaiting operator reconciliation).
 */
export async function listOpenPublishExecutions(): Promise<
  OpenPublishExecution[]
> {
  return openPublishExecutionListSchema.parse(
    await invokeCommand("linkgo_publish_execution_list_open"),
  );
}

/**
 * Resolves an `outcome_unknown` execution after the operator checked
 * LinkedIn. Native code settles the attempt, subject, audit, and error queue
 * in one transaction and rejects stale fences.
 */
export async function reconcilePublishExecution(
  input: ReconcilePublishExecutionInput,
): Promise<ReconcilePublishExecutionResult> {
  const parsed = reconcilePublishExecutionInputSchema.parse(input);
  return reconcilePublishExecutionResultSchema.parse(
    await invokeCommand("linkgo_publish_execution_reconcile", {
      input: parsed,
    }),
  );
}
