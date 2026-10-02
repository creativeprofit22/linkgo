import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  addWatchlistEntry,
  cancelBrightDataRun,
  getBrightDataStatus,
  listBrightDataRuns,
  listWatchlistEntries,
  removeWatchlistEntry,
  resumeBrightDataRun,
  setBrightDataEnabled,
  startBrightDataRun,
  updateWatchlistEntry,
} from "@/features/source-imports/brightdata-data";
import type {
  AddWatchlistEntryInput,
  BrightDataRun,
  BrightDataRunRequest,
  BrightDataStatus,
  UpdateWatchlistEntryInput,
  WatchlistEntry,
} from "@/features/source-imports/types/brightdata";

export interface UseBrightDataRunsState {
  status: BrightDataStatus | null;
  runs: BrightDataRun[];
  watchlist: WatchlistEntry[];
  loading: boolean;
  /** A run, resume, or cancel is in flight from this window. */
  runPending: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  startRun: (request: BrightDataRunRequest) => Promise<BrightDataRun | null>;
  resumeRun: (runId: number) => Promise<void>;
  cancelRun: (runId: number) => Promise<void>;
  addEntry: (
    input: Omit<AddWatchlistEntryInput, "campaignId">,
  ) => Promise<boolean>;
  updateEntry: (input: UpdateWatchlistEntryInput) => Promise<void>;
  removeEntry: (id: number) => Promise<void>;
}

const RUN_POLL_MS = 1500;

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong with Bright Data. Please try again.";
}

function describeRun(run: BrightDataRun): string {
  if (run.status === "imported") {
    return `${run.rowCount} post${run.rowCount === 1 ? "" : "s"} added to your imports.`;
  }
  return run.errorMessage || "Bright Data fetch finished.";
}

function announceRun(run: BrightDataRun): void {
  const description = describeRun(run);
  if (run.status === "imported") {
    toast.success("Bright Data posts imported", { description });
  } else if (run.status === "failed") {
    toast.error("Bright Data fetch failed", { description });
  } else if (run.status === "cancelled") {
    toast.warning("Bright Data fetch cancelled", { description });
  } else {
    toast.info("Bright Data is still collecting", { description });
  }
}

/**
 * Bright Data connector state for one campaign. `onImported` lets the page
 * refresh the queue and source-import history after a run writes a batch.
 */
export function useBrightDataRuns(
  campaignId: number | null,
  onImported?: () => Promise<void>,
): UseBrightDataRunsState {
  const [status, setStatus] = useState<BrightDataStatus | null>(null);
  const [runs, setRuns] = useState<BrightDataRun[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(campaignId !== null);
  const [runPending, setRunPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const onImportedRef = useRef(onImported);
  useEffect(() => {
    onImportedRef.current = onImported;
  }, [onImported]);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    if (campaignId === null) {
      setStatus(null);
      setRuns([]);
      setWatchlist([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Runs first: listing recovers interrupted runs before status counts.
      const nextRuns = await listBrightDataRuns(campaignId);
      const [nextStatus, nextWatchlist] = await Promise.all([
        getBrightDataStatus(campaignId),
        listWatchlistEntries(campaignId),
      ]);
      if (requestIdRef.current === requestId) {
        setRuns(nextRuns);
        setStatus(nextStatus);
        setWatchlist(nextWatchlist);
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
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  // While a run blocks in native code, refresh the history so the active run
  // and its Cancel button are visible. Listing skips recovery for campaigns
  // with a run in this process.
  useEffect(() => {
    if (!runPending || campaignId === null) return undefined;
    let stopped = false;
    const refresh = async (): Promise<void> => {
      try {
        const nextRuns = await listBrightDataRuns(campaignId);
        if (!stopped) setRuns(nextRuns);
      } catch {
        // The final reload after the run reports errors.
      }
    };
    const timer = window.setInterval(() => void refresh(), RUN_POLL_MS);
    void refresh();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [campaignId, runPending]);

  const afterRun = useCallback(
    async (run: BrightDataRun) => {
      announceRun(run);
      await reload();
      if (run.sourceImportBatchId !== null) {
        await onImportedRef.current?.();
      }
    },
    [reload],
  );

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      try {
        await setBrightDataEnabled(enabled);
        toast.success(
          enabled ? "Bright Data turned on" : "Bright Data turned off",
        );
      } catch (caught) {
        toast.error("We couldn't save this Bright Data setting", {
          description: getErrorMessage(caught),
        });
      }
      await reload();
    },
    [reload],
  );

  const startRun = useCallback(
    async (request: BrightDataRunRequest): Promise<BrightDataRun | null> => {
      if (campaignId === null) return null;
      setRunPending(true);
      try {
        const run = await startBrightDataRun({ campaignId, request });
        await afterRun(run);
        return run;
      } catch (caught) {
        toast.error("We couldn't start the Bright Data fetch", {
          description: getErrorMessage(caught),
        });
        await reload();
        return null;
      } finally {
        setRunPending(false);
      }
    },
    [afterRun, campaignId, reload],
  );

  const resumeRun = useCallback(
    async (runId: number) => {
      setRunPending(true);
      try {
        await afterRun(await resumeBrightDataRun(runId));
      } catch (caught) {
        toast.error("We couldn't continue the Bright Data fetch", {
          description: getErrorMessage(caught),
        });
        await reload();
      } finally {
        setRunPending(false);
      }
    },
    [afterRun, reload],
  );

  const cancelRun = useCallback(
    async (runId: number) => {
      try {
        const run = await cancelBrightDataRun(runId);
        if (run.status === "cancelled") {
          toast.warning("Bright Data fetch cancelled");
        } else {
          toast.info("Cancelling Bright Data fetch");
        }
      } catch (caught) {
        toast.error("We couldn't cancel this fetch", {
          description: getErrorMessage(caught),
        });
      }
      await reload();
    },
    [reload],
  );

  const addEntry = useCallback(
    async (input: Omit<AddWatchlistEntryInput, "campaignId">) => {
      if (campaignId === null) return false;
      try {
        await addWatchlistEntry({ ...input, campaignId });
        await reload();
        return true;
      } catch (caught) {
        toast.error("We couldn't add this to your watchlist", {
          description: getErrorMessage(caught),
        });
        return false;
      }
    },
    [campaignId, reload],
  );

  const updateEntry = useCallback(
    async (input: UpdateWatchlistEntryInput) => {
      try {
        await updateWatchlistEntry(input);
      } catch (caught) {
        toast.error("We couldn't update this watchlist entry", {
          description: getErrorMessage(caught),
        });
      }
      await reload();
    },
    [reload],
  );

  const removeEntry = useCallback(
    async (id: number) => {
      try {
        await removeWatchlistEntry(id);
      } catch (caught) {
        toast.error("We couldn't remove this watchlist entry", {
          description: getErrorMessage(caught),
        });
      }
      await reload();
    },
    [reload],
  );

  return useMemo(
    () => ({
      status,
      runs,
      watchlist,
      loading,
      runPending,
      error,
      reload,
      setEnabled,
      startRun,
      resumeRun,
      cancelRun,
      addEntry,
      updateEntry,
      removeEntry,
    }),
    [
      status,
      runs,
      watchlist,
      loading,
      runPending,
      error,
      reload,
      setEnabled,
      startRun,
      resumeRun,
      cancelRun,
      addEntry,
      updateEntry,
      removeEntry,
    ],
  );
}
