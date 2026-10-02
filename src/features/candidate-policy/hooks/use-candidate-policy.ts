import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getCandidateIntakePolicy,
  updateCandidateIntakePolicy,
} from "@/features/candidate-policy/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  CandidateIntakePolicy,
  UpdateCandidateIntakePolicyInput,
} from "@/features/candidate-policy/types";

interface UseCandidatePolicyState {
  policy: CandidateIntakePolicy | null;
  loading: boolean;
  pending: boolean;
  error: string | null;
  loadPolicy: () => Promise<void>;
  savePolicy: (
    input: UpdateCandidateIntakePolicyInput,
  ) => Promise<CandidateIntakePolicy>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your idea filters. Please try again.";
}

export function useCandidatePolicy(
  campaignId: number | null,
): UseCandidatePolicyState {
  const [policy, setPolicy] = useState<CandidateIntakePolicy | null>(null);
  const [loading, setLoading] = useState(campaignId !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadPolicy = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    setPolicy(null);

    if (campaignId === null) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const loadedPolicy = await getCandidateIntakePolicy(campaignId);
      if (requestIdRef.current === requestId) {
        setPolicy(loadedPolicy);
      }
    } catch (caught) {
      if (requestIdRef.current === requestId) {
        setError(getErrorMessage(caught));
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadPolicy();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadPolicy]);

  const savePolicy = useCallback(
    async (
      input: UpdateCandidateIntakePolicyInput,
    ): Promise<CandidateIntakePolicy> => {
      setPending(true);
      try {
        const savedPolicy = await updateCandidateIntakePolicy(input);
        if (campaignId === input.campaignId) {
          setPolicy(savedPolicy);
          setError(null);
        }
        toast.success("Idea filters saved");
        return savedPolicy;
      } catch (caught) {
        toast.error("We couldn't save your idea filters", {
          description: getErrorMessage(caught),
        });
        throw caught;
      } finally {
        setPending(false);
      }
    },
    [campaignId],
  );

  return useMemo(
    () => ({ policy, loading, pending, error, loadPolicy, savePolicy }),
    [policy, loading, pending, error, loadPolicy, savePolicy],
  );
}
