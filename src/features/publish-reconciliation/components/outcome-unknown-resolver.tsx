import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReconcileExecutionDialog } from "@/features/publish-reconciliation/components/reconcile-execution-dialog";
import { useReconcileOpenExecution } from "@/features/publish-reconciliation/hooks/use-reconcile-open-execution";
import { getPublishLockLabel } from "@/features/publish-reconciliation/publish-lock";
import type { OpenPublishExecution } from "@/features/publish-reconciliation/types";

interface OutcomeUnknownResolverProps {
  execution: OpenPublishExecution;
  /** Reloads the card's list after the answer is saved or rejected. */
  onSettled: () => Promise<void> | void;
}

/**
 * Inline "I checked LinkedIn" answer for a post or comment whose LinkedIn
 * outcome is unknown. Each button opens the existing reconcile dialog with
 * that answer pre-selected; the typed confirmation, link requirement and
 * native checks are unchanged.
 */
export function OutcomeUnknownResolver({
  execution,
  onSettled,
}: OutcomeUnknownResolverProps): React.ReactNode {
  const { reconciling, reconcile } = useReconcileOpenExecution(onSettled);
  const itemLabel = execution.kind === "post" ? "post" : "comment";
  const headingId = `outcome-unknown-${execution.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="border-linkgo-amber/40 bg-linkgo-amber/10 space-y-3 rounded-xl border p-3 text-sm"
    >
      <p id={headingId} className="flex items-center gap-2 font-semibold">
        <AlertTriangle
          className="text-linkgo-amber size-4 shrink-0"
          aria-hidden="true"
        />
        {getPublishLockLabel("awaiting_reconciliation")}
      </p>
      <p className="text-muted-foreground">
        This {itemLabel} may already be on LinkedIn. Don't post it again until
        you've checked.
      </p>
      <div className="flex flex-wrap gap-2">
        <ReconcileExecutionDialog
          execution={execution}
          disabled={reconciling}
          onReconcile={reconcile}
          initialResolution="posted"
          trigger={
            <Button type="button" size="sm" variant="outline">
              I checked LinkedIn: it posted
            </Button>
          }
        />
        <ReconcileExecutionDialog
          execution={execution}
          disabled={reconciling}
          onReconcile={reconcile}
          initialResolution="not_posted"
          trigger={
            <Button type="button" size="sm" variant="outline">
              I checked LinkedIn: it didn't post
            </Button>
          }
        />
      </div>
    </section>
  );
}
