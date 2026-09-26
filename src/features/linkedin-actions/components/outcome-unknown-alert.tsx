import { AlertTriangle } from "lucide-react";

interface OutcomeUnknownAlertProps {
  itemLabel: string;
  message: string;
  executionId: number;
}

export const OUTCOME_UNKNOWN_TITLE = "Outcome unknown — check LinkedIn";

export function OutcomeUnknownAlert({
  itemLabel,
  message,
  executionId,
}: OutcomeUnknownAlertProps): React.ReactNode {
  return (
    <div
      role="alert"
      className="border-linkgo-amber/40 bg-linkgo-amber/10 rounded-xl border p-3 text-sm"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle
          className="text-linkgo-amber size-4"
          aria-hidden="true"
        />
        {OUTCOME_UNKNOWN_TITLE}
      </p>
      <p className="mt-2">
        LinkedIn may have created this {itemLabel}. Do not publish it again.
        Check LinkedIn, then reconcile execution #{executionId} in Safety →
        Publishing needs reconciliation.
      </p>
      {message && (
        <p className="text-muted-foreground mt-2 break-words">{message}</p>
      )}
    </div>
  );
}
