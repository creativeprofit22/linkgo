import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReconcileExecutionDialog } from "@/features/publish-reconciliation/components/reconcile-execution-dialog";
import { usePublishReconciliation } from "@/features/publish-reconciliation/hooks/use-publish-reconciliation";
import type {
  OpenPublishExecution,
  OpenPublishExecutionStatus,
  PublishExecutionRemoteOutcome,
  ReconcilePublishExecutionInput,
} from "@/features/publish-reconciliation/types";

const STATUS_LABELS: Record<OpenPublishExecutionStatus, string> = {
  reserved: "Reserved",
  in_flight: "In flight",
  outcome_unknown: "Outcome unknown",
};

const REMOTE_OUTCOME_LABELS: Record<PublishExecutionRemoteOutcome, string> = {
  "": "No response",
  created: "Created",
  rejected: "Rejected",
  ambiguous: "Ambiguous",
};

interface PublishReconciliationCardProps {
  /** Called after a successful reconciliation so the parent can refresh. */
  onReconciled?: () => Promise<void> | void;
}

export function PublishReconciliationCard({
  onReconciled,
}: PublishReconciliationCardProps): React.ReactNode {
  const {
    executions,
    loading,
    error,
    reconcilingId,
    loadExecutions,
    reconcile,
  } = usePublishReconciliation();

  const handleReconcile = async (
    input: ReconcilePublishExecutionInput,
  ): Promise<void> => {
    await reconcile(input);
    await onReconciled?.();
  };

  return (
    <Card
      className={
        executions.length > 0
          ? "border-linkgo-amber/40 bg-linkgo-amber/5"
          : "bg-card/70"
      }
      aria-labelledby="publish-reconciliation-title"
    >
      <CardHeader className="gap-1 pb-3">
        <CardTitle
          id="publish-reconciliation-title"
          className="flex items-center gap-2 text-base"
        >
          <AlertTriangle
            className="text-linkgo-amber size-4"
            aria-hidden="true"
          />
          Publishing needs reconciliation
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          LinkedIn may have created these items. Check LinkedIn, then record
          what happened. They cannot be published again until reconciled.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadExecutions()}
            >
              Retry
            </Button>
          </div>
        )}
        {loading && executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Loading open publishes…
          </p>
        ) : executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No publishes need reconciliation.
          </p>
        ) : (
          <ul className="space-y-3">
            {executions.map((execution) => (
              <ExecutionRow
                key={execution.id}
                execution={execution}
                disabled={reconcilingId !== null}
                onReconcile={handleReconcile}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ExecutionRow({
  execution,
  disabled,
  onReconcile,
}: {
  execution: OpenPublishExecution;
  disabled: boolean;
  onReconcile: (input: ReconcilePublishExecutionInput) => Promise<void>;
}): React.ReactNode {
  const kindLabel = execution.kind === "post" ? "Post" : "Comment";
  const remote = `${REMOTE_OUTCOME_LABELS[execution.remoteOutcome]}${
    execution.remoteStatusCode === null
      ? ""
      : ` (HTTP ${execution.remoteStatusCode})`
  }`;

  return (
    <li
      className="bg-card/70 space-y-2 rounded-xl border p-3 text-sm"
      aria-label={`${kindLabel} execution ${execution.id}`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <p className="font-medium">
            {kindLabel} #{execution.subjectId} ·{" "}
            {execution.campaignName || "Unknown campaign"}
          </p>
          <p className="text-muted-foreground text-xs">
            Execution #{execution.id} · {execution.caller} · remote: {remote}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              execution.status === "outcome_unknown" ? "warning" : "outline"
            }
          >
            {STATUS_LABELS[execution.status]}
          </Badge>
          {execution.status === "outcome_unknown" ? (
            <ReconcileExecutionDialog
              execution={execution}
              disabled={disabled}
              onReconcile={onReconcile}
            />
          ) : (
            <span className="text-muted-foreground text-xs">In progress</span>
          )}
        </div>
      </div>
      {execution.errorMessage && (
        <p className="break-words">{execution.errorMessage}</p>
      )}
      <p className="text-muted-foreground text-xs">
        Reserved {execution.reservedAt}
        {execution.sentAt ? ` · Sent ${execution.sentAt}` : ""} · Updated{" "}
        {execution.updatedAt}
      </p>
    </li>
  );
}
