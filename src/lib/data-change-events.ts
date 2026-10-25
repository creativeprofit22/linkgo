/**
 * A tiny in-window signal that saved data changed, so views derived from
 * several features (like the setup checklist) can re-read without polling.
 */
export const DATA_CHANGED_EVENT = "linkgo:data-changed";

export type DataChangeTopic = "campaigns" | "playbooks" | "accounts";

export interface DataChangeDetail {
  topic: DataChangeTopic;
}

/** Call only after a mutation has succeeded. */
export function announceDataChange(topic: DataChangeTopic): void {
  window.dispatchEvent(
    new CustomEvent<DataChangeDetail>(DATA_CHANGED_EVENT, {
      detail: { topic },
    }),
  );
}

/**
 * Regaining window focus only *might* mean data went stale, so views re-read
 * on focus at most this often. Saved-data announcements always re-read.
 */
export const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

/** Tracks the last re-read so focus events don't refetch on every alt-tab. */
export interface FocusRefreshGate {
  /** Records that a re-read just started. */
  markRefreshed: () => void;
  /** True when a focus-triggered re-read is due. */
  isDue: () => boolean;
}

export function createFocusRefreshGate(
  minIntervalMs: number = FOCUS_REFRESH_MIN_INTERVAL_MS,
  now: () => number = Date.now,
): FocusRefreshGate {
  let lastRefreshAt: number | null = null;
  return {
    markRefreshed: () => {
      lastRefreshAt = now();
    },
    isDue: () =>
      lastRefreshAt === null || now() - lastRefreshAt >= minIntervalMs,
  };
}

/** Subscribes to every data-change announcement; returns the unsubscribe. */
export function subscribeDataChange(
  handler: (detail: DataChangeDetail) => void,
): () => void {
  const listener = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      typeof detail === "object" &&
      detail !== null &&
      "topic" in detail &&
      (detail.topic === "campaigns" ||
        detail.topic === "playbooks" ||
        detail.topic === "accounts")
    ) {
      handler({ topic: detail.topic });
    }
  };
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}
