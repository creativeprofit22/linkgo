import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
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
  /**
   * Untrusted attempt id from a link (e.g. Today). When it is still waiting
   * for a decision its row is highlighted and its dialog opens; otherwise a
   * plain notice explains why. The person still makes the decision.
   */
  linkedExecutionId?: number | undefined;
  /** Called when the linked dialog closes or its notice is dismissed. */
  onLinkDone?: () => void;
}

type LinkState =
  | { kind: "none" }
  | { kind: "open"; executionId: number }
  | { kind: "notice"; message: string };

function resolveLink(
  linkedExecutionId: number | undefined,
  ready: boolean,
  executions: OpenPublishExecution[],
  handledId: number | null,
): LinkState {
  if (linkedExecutionId === undefined || !ready) return { kind: "none" };
  const execution = executions.find((item) => item.id === linkedExecutionId);
  if (execution?.status === "outcome_unknown")
    return { kind: "open", executionId: execution.id };
  // Once its dialog has opened, the row changing means it was sorted.
  if (handledId === linkedExecutionId) return { kind: "none" };
  if (!execution)
    return {
      kind: "notice",
      message: "We couldn't find that post here. It may already be sorted out.",
    };
  return {
    kind: "notice",
    message: "That post is still being sent. Check back in a minute.",
  };
}

export function PublishReconciliationCard({
  onReconciled,
  linkedExecutionId,
  onLinkDone,
}: PublishReconciliationCardProps): React.ReactNode {
  const {
    executions,
    loading,
    error,
    reconcilingId,
    loadExecutions,
    reconcile,
  } = usePublishReconciliation();
  const [handledId, setHandledId] = useState<number | null>(null);
  const link = resolveLink(
    linkedExecutionId,
    !loading && error === null,
    executions,
    handledId,
  );
  const openLinkId = link.kind === "open" ? link.executionId : null;

  useEffect(() => {
    if (openLinkId !== null) setHandledId(openLinkId);
  }, [openLinkId]);

  useEffect(() => {
    if (linkedExecutionId === undefined) setHandledId(null);
  }, [linkedExecutionId]);

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
        {link.kind === "notice" && (
          <div
            role="status"
            data-testid="safety-link-notice"
            className="bg-muted/50 text-muted-foreground flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center"
          >
            <span className="flex items-center gap-2">
              <Info aria-hidden="true" className="size-4 shrink-0" />
              {link.message}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onLinkDone?.()}
            >
              OK
            </Button>
          </div>
        )}
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
                linked={execution.id === linkedExecutionId}
                linkOpen={execution.id === openLinkId}
                onLinkDone={onLinkDone}
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
  linked,
  linkOpen,
  onLinkDone,
}: {
  execution: OpenPublishExecution;
  disabled: boolean;
  onReconcile: (input: ReconcilePublishExecutionInput) => Promise<void>;
  linked: boolean;
  linkOpen: boolean;
  onLinkDone: (() => void) | undefined;
}): React.ReactNode {
  const kindLabel = execution.kind === "post" ? "Post" : "Comment";
  const remote = REMOTE_OUTCOME_LABELS[execution.remoteOutcome];
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (linked) rowRef.current?.scrollIntoView({ block: "center" });
  }, [linked]);

  return (
    <li
      ref={rowRef}
      data-linked={linked ? "true" : undefined}
      className={`bg-card/70 space-y-2 rounded-xl border p-3 text-sm ${
        linked ? "border-linkgo-blue ring-linkgo-blue/30 ring-2" : ""
      }`}
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
              {...(linkOpen
                ? {
                    open: true,
                    onOpenChange: (next: boolean) => {
                      if (!next) onLinkDone?.();
                    },
                  }
                : {})}
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
