import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listOpenPublishExecutions,
  reconcilePublishExecution,
} from "@/features/publish-reconciliation/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  OpenPublishExecution,
  ReconcilePublishExecutionInput,
} from "@/features/publish-reconciliation/types";

interface UsePublishReconciliationState {
  executions: OpenPublishExecution[];
  loading: boolean;
  error: string | null;
  reconcilingId: number | null;
  loadExecutions: () => Promise<void>;
  /** Resolves one execution; rejects so the dialog can stay open on errors. */
  reconcile: (input: ReconcilePublishExecutionInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong while checking these posts. Try again.";
}

export function usePublishReconciliation(): UsePublishReconciliationState {
  const [executions, setExecutions] = useState<OpenPublishExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<number | null>(null);
  const reconcilingRef = useRef(false);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setExecutions(await listOpenPublishExecutions());
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  const reconcile = useCallback(
    async (input: ReconcilePublishExecutionInput) => {
      if (reconcilingRef.current) return;

      reconcilingRef.current = true;
      setReconcilingId(input.executionId);
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
        setReconcilingId(null);
        await loadExecutions();
      }
    },
    [loadExecutions],
  );

  return useMemo(
    () => ({
      executions,
      loading,
      error,
      reconcilingId,
      loadExecutions,
      reconcile,
    }),
    [executions, loading, error, reconcilingId, loadExecutions, reconcile],
  );
}
