import { useCallback, useEffect, useRef, useState } from "react";
import { loadToday } from "@/features/today/data";
import type { TodaySnapshot } from "@/features/today/types";
import { subscribeDataChange } from "@/lib/data-change-events";

export type TodayState =
  | { status: "loading"; snapshot: null }
  | { status: "error"; snapshot: null }
  | { status: "ready"; snapshot: TodaySnapshot };

export interface UseTodayResult {
  state: TodayState;
  /** True while a refresh runs over an already shown list. */
  refreshing: boolean;
  reload: () => void;
}

/** Every source failing is the full error; anything less is partial. */
const SOURCE_COUNT = 4;

/**
 * Loads Today and keeps it fresh: re-reads when the window regains focus or
 * another screen announces saved data. A failed refresh keeps the last list.
 */
export function useToday(): UseTodayResult {
  const [state, setState] = useState<TodayState>({
    status: "loading",
    snapshot: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback((): void => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    setRefreshing(true);
    const run = async (): Promise<void> => {
      try {
        const snapshot = await loadToday({ signal });
        if (signal.aborted) return;
        if (snapshot.failed.length >= SOURCE_COUNT) {
          setState((previous) =>
            previous.status === "ready"
              ? previous
              : { status: "error", snapshot: null },
          );
        } else {
          setState({ status: "ready", snapshot });
        }
      } catch {
        if (signal.aborted) return;
        setState((previous) =>
          previous.status === "ready"
            ? previous
            : { status: "error", snapshot: null },
        );
      } finally {
        if (!signal.aborted) setRefreshing(false);
      }
    };
    void run();
  }, []);

  const retry = useCallback((): void => {
    setState((previous) =>
      previous.status === "error"
        ? { status: "loading", snapshot: null }
        : previous,
    );
    reload();
  }, [reload]);

  useEffect(() => {
    reload();
    window.addEventListener("focus", reload);
    const unsubscribe = subscribeDataChange(reload);
    return () => {
      controllerRef.current?.abort();
      unsubscribe();
      window.removeEventListener("focus", reload);
    };
  }, [reload]);

  return { state, refreshing, reload: retry };
}
