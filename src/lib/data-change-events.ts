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
