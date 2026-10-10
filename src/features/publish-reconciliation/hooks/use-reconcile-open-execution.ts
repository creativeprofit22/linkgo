import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { reconcilePublishExecution } from "@/features/publish-reconciliation/data";
import { toPlainMessage } from "@/lib/plain-message";
import type { ReconcilePublishExecutionInput } from "@/features/publish-reconciliation/types";

interface UseReconcileOpenExecutionState {
  reconciling: boolean;
  /** Resolves one execution; rejects so the dialog can stay open on errors. */
  reconcile: (input: ReconcilePublishExecutionInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong while saving what happened. Try again.";
}

/**
 * Reconciles one open execution from a post or comment card. Native code
 * validates the fence, resolution, link and typed confirmation; `onSettled`
 * reloads the caller's list so the publish lock clears or stays.
 */
export function useReconcileOpenExecution(
  onSettled: () => Promise<void> | void,
): UseReconcileOpenExecutionState {
  const [reconciling, setReconciling] = useState(false);
  const reconcilingRef = useRef(false);

  const reconcile = useCallback(
    async (input: ReconcilePublishExecutionInput) => {
      if (reconcilingRef.current) return;

      reconcilingRef.current = true;
      setReconciling(true);
      try {
        const result = await reconcilePublishExecution(input);
        toast.success(
          result.status === "reconciled_posted"
            ? "Marked as posted on LinkedIn"
            : "Marked as not posted",
        );
      } catch (caught) {
        toast.error("We couldn't save what happened", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        reconcilingRef.current = false;
        setReconciling(false);
        await onSettled();
      }
    },
    [onSettled],
  );

  return useMemo(() => ({ reconciling, reconcile }), [reconciling, reconcile]);
}
