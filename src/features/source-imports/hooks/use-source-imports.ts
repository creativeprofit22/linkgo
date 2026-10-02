import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createSourceImportBatch,
  listSourceImportBatches,
} from "@/features/source-imports/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  CreateSourceImportBatchInput,
  SourceImportBatchDetail,
  SourceImportBatchResult,
} from "@/features/source-imports/types";

interface UseSourceImportsState {
  batches: SourceImportBatchDetail[];
  loading: boolean;
  pending: boolean;
  error: string | null;
  lastResult: SourceImportBatchResult | null;
  loadImports: () => Promise<void>;
  submitImport: (
    input: CreateSourceImportBatchInput,
  ) => Promise<SourceImportBatchResult>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "We couldn't import these posts. Please try again.";
}

function getResultSummary(result: SourceImportBatchResult): string {
  return `${result.acceptedCount} accepted, ${result.duplicateCount} duplicate, ${result.rejectedCount} rejected`;
}

export function useSourceImports(
  campaignId: number | null,
): UseSourceImportsState {
  const [batches, setBatches] = useState<SourceImportBatchDetail[]>([]);
  const [loading, setLoading] = useState(campaignId !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SourceImportBatchResult | null>(
    null,
  );
  const requestIdRef = useRef(0);

  const loadImports = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setBatches([]);
    setError(null);

    if (campaignId === null) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const dashboard = await listSourceImportBatches(campaignId);
      if (requestIdRef.current === requestId) {
        setBatches(dashboard.batches);
      }
    } catch (caught) {
      if (requestIdRef.current === requestId) {
        setError(getErrorMessage(caught));
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [campaignId]);

  useEffect(() => {
    setLastResult(null);
    void loadImports();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadImports]);

  const submitImport = useCallback(
    async (
      input: CreateSourceImportBatchInput,
    ): Promise<SourceImportBatchResult> => {
      setPending(true);
      setError(null);
      try {
        const result = await createSourceImportBatch(input);
        setLastResult(result);
        const description = getResultSummary(result);
        if (result.status === "failed") {
          toast.error("Source import stopped", { description });
        } else if (result.status === "completed_with_errors") {
          toast.warning("Source import completed with review items", {
            description,
          });
        } else {
          toast.success("Source import completed", { description });
        }
        return result;
      } catch (caught) {
        const message = getErrorMessage(caught);
        toast.error("We couldn't import these posts", { description: message });
        throw caught;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      batches,
      loading,
      pending,
      error,
      lastResult,
      loadImports,
      submitImport,
    }),
    [batches, loading, pending, error, lastResult, loadImports, submitImport],
  );
}
