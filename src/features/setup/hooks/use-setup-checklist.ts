import { useCallback, useEffect, useState } from "react";
import {
  loadSetupChecklist,
  readSetupPreferences,
  writeSetupPreferences,
} from "@/features/setup/data";
import type { SetupChecklist } from "@/features/setup/types";
import { subscribeDataChange } from "@/lib/data-change-events";

/** Fired when setup preferences change so every checklist view agrees. */
const SETUP_CHANGED_EVENT = "linkgo:setup-changed";

export interface SetupChecklistState {
  /** `null` until the first read finishes. */
  checklist: SetupChecklist | null;
  dismissed: boolean;
  dismiss: () => void;
  resume: () => void;
}

/**
 * Loads the setup checklist and keeps it fresh: it re-reads when the link
 * changes, the window regains focus, or a saved account, guide or campaign
 * is announced, so finishing a step anywhere updates the progress.
 */
export function useSetupChecklist(): SetupChecklistState {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [dismissed, setDismissed] = useState(
    () => readSetupPreferences().dismissed,
  );

  useEffect(() => {
    let controller = new AbortController();
    const reload = async (): Promise<void> => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      try {
        const next = await loadSetupChecklist(signal);
        if (next && !signal.aborted) setChecklist(next);
      } catch {
        // Each source already degrades to "unknown"; keep the last view.
      }
    };
    const onChange = (): void => {
      setDismissed(readSetupPreferences().dismissed);
      void reload();
    };
    void reload();
    window.addEventListener("hashchange", onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener(SETUP_CHANGED_EVENT, onChange);
    const unsubscribeDataChange = subscribeDataChange(onChange);
    return () => {
      controller.abort();
      unsubscribeDataChange();
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("focus", onChange);
      window.removeEventListener(SETUP_CHANGED_EVENT, onChange);
    };
  }, []);

  const setPreference = useCallback((nextDismissed: boolean): void => {
    writeSetupPreferences({ dismissed: nextDismissed });
    setDismissed(nextDismissed);
    window.dispatchEvent(new Event(SETUP_CHANGED_EVENT));
  }, []);

  const dismiss = useCallback(() => setPreference(true), [setPreference]);
  const resume = useCallback(() => setPreference(false), [setPreference]);

  return { checklist, dismissed, dismiss, resume };
}
