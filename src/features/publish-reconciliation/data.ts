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
} from "@/features/publish-reconciliation/types";

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
