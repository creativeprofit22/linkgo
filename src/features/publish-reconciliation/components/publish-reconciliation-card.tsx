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
import { toPlainMessage } from "@/lib/plain-message";

const STATUS_LABELS: Record<OpenPublishExecutionStatus, string> = {
  reserved: "Getting ready",
  in_flight: "Posting…",
  outcome_unknown: "Couldn't confirm",
};

const REMOTE_OUTCOME_LABELS: Record<PublishExecutionRemoteOutcome, string> = {
  "": "No reply",
  created: "Posted",
  rejected: "Turned down",
  ambiguous: "Unclear",
};

const CALLER_LABELS: Record<OpenPublishExecution["caller"], string> = {
  manual: "You",
  scheduler: "Auto-posting",
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
          Check what happened to these posts
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          These may already be on LinkedIn. Check LinkedIn, then tell us what
          happened. You can't post them again until you do.
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
              Try again
            </Button>
          </div>
        )}
        {loading && executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Loading posts in progress…
          </p>
        ) : executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing to check right now.
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
  const remote = REMOTE_OUTCOME_LABELS[execution.remoteOutcome];

  return (
    <li
      className="bg-card/70 space-y-2 rounded-xl border p-3 text-sm"
      aria-label={`${kindLabel} attempt ${execution.id}`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <p className="font-medium">
            {kindLabel} #{execution.subjectId} ·{" "}
            {execution.campaignName || "Campaign not known"}
          </p>
          <p className="text-muted-foreground text-xs">
            Attempt #{execution.id} · Started by:{" "}
            {CALLER_LABELS[execution.caller]} · LinkedIn reply: {remote}
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
        <p className="break-words">{toPlainMessage(execution.errorMessage)}</p>
      )}
      <p className="text-muted-foreground text-xs">
        Started {execution.reservedAt}
        {execution.sentAt ? ` · Sent ${execution.sentAt}` : ""} · Updated{" "}
        {execution.updatedAt}
      </p>
    </li>
  );
}
