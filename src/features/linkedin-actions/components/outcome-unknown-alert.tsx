import { AlertTriangle } from "lucide-react";
import { toPlainMessage } from "@/lib/plain-message";

interface OutcomeUnknownAlertProps {
  itemLabel: string;
  message: string;
}

export const OUTCOME_UNKNOWN_TITLE =
  "We couldn't confirm it posted — check LinkedIn";

export function OutcomeUnknownAlert({
  itemLabel,
  message,
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
        This {itemLabel} may already be on LinkedIn. Don't post it again. Close
        this, check LinkedIn, then use &ldquo;I checked LinkedIn&rdquo; on the{" "}
        {itemLabel}.
      </p>
      {message && (
        <p className="text-muted-foreground mt-2 break-words">
          {toPlainMessage(message)}
        </p>
      )}
    </div>
  );
}
