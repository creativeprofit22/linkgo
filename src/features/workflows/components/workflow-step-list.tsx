import { useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkflowStepStatusBadge } from "@/features/workflows/components/workflow-status-badge";
import type {
  SetWorkflowStepStatusInput,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepStatus,
} from "@/workflows/types";

interface WorkflowStepListProps {
  steps: WorkflowStep[];
  runStatus: WorkflowRunStatus;
  selectedCampaignArchived: boolean;
  onSetStepStatus: (input: SetWorkflowStepStatusInput) => Promise<void>;
}

interface StepAction {
  label: string;
  status: WorkflowStepStatus;
}

interface PendingStepAction {
  step: WorkflowStep;
  action: StepAction;
}

const contextStatuses = ["blocked", "failed"] as const;

function isErrorContextStatus(status: WorkflowStepStatus): boolean {
  return contextStatuses.some((contextStatus) => contextStatus === status);
}

function shouldCollectStepContext(
  currentStatus: WorkflowStepStatus,
  nextStatus: WorkflowStepStatus,
): boolean {
  if (isErrorContextStatus(nextStatus)) return true;
  if (nextStatus === "completed" || nextStatus === "skipped") return true;
  return nextStatus === "running" && currentStatus !== "pending";
}

function getStepActions(status: WorkflowStepStatus): StepAction[] {
  if (status === "pending") {
    return [
      { label: "Start", status: "running" },
      { label: "Skip", status: "skipped" },
    ];
  }
  if (status === "running") {
    return [
      { label: "Complete", status: "completed" },
      { label: "Wait approval", status: "waiting_approval" },
      { label: "Block", status: "blocked" },
      { label: "Fail", status: "failed" },
      { label: "Skip", status: "skipped" },
    ];
  }
  if (status === "waiting_approval") {
    return [
      { label: "Complete", status: "completed" },
      { label: "Block", status: "blocked" },
      { label: "Fail", status: "failed" },
      { label: "Resume", status: "running" },
    ];
  }
  if (status === "blocked") {
    return [
      { label: "Resume", status: "running" },
      { label: "Fail", status: "failed" },
      { label: "Skip", status: "skipped" },
    ];
  }
  if (status === "failed") {
    return [
      { label: "Resume", status: "running" },
      { label: "Skip", status: "skipped" },
    ];
  }
  if (status === "completed" || status === "skipped") {
    return [{ label: "Reopen", status: "running" }];
  }
  return [];
}

export function WorkflowStepList({
  steps,
  runStatus,
  selectedCampaignArchived,
  onSetStepStatus,
}: WorkflowStepListProps): React.ReactNode {
  const [pendingAction, setPendingAction] = useState<PendingStepAction | null>(
    null,
  );
  const [contextText, setContextText] = useState("");
  const [savingContext, setSavingContext] = useState(false);
  const stepMutationsDisabled =
    selectedCampaignArchived || runStatus === "cancelled";
  const contextIsError =
    pendingAction !== null && isErrorContextStatus(pendingAction.action.status);

  function closeContextDialog(): void {
    if (savingContext) return;
    setPendingAction(null);
    setContextText("");
  }

  function buildStepStatusInput(
    stepId: number,
    status: WorkflowStepStatus,
    context: string,
  ): SetWorkflowStepStatusInput {
    const trimmedContext = context.trim();
    return isErrorContextStatus(status)
      ? {
          stepId,
          status,
          outputSummary: "",
          errorMessage: trimmedContext,
        }
      : {
          stepId,
          status,
          outputSummary: trimmedContext,
          errorMessage: "",
        };
  }

  function handleActionClick(step: WorkflowStep, action: StepAction): void {
    if (!shouldCollectStepContext(step.status, action.status)) {
      void onSetStepStatus(buildStepStatusInput(step.id, action.status, ""));
      return;
    }

    setPendingAction({ step, action });
    setContextText(
      isErrorContextStatus(action.status)
        ? step.error_message
        : step.output_summary,
    );
  }

  async function handleContextSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (pendingAction === null) return;

    setSavingContext(true);
    try {
      await onSetStepStatus(
        buildStepStatusInput(
          pendingAction.step.id,
          pendingAction.action.status,
          contextText,
        ),
      );
      setPendingAction(null);
      setContextText("");
    } finally {
      setSavingContext(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {steps.map((step) => (
          <Card key={step.id} className="bg-card/60">
            <CardContent className="p-4">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      {step.sort_order}
                    </span>
                    <h4 className="font-medium">{step.title}</h4>
                    <WorkflowStepStatusBadge status={step.status} />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {step.description}
                  </p>
                  {step.output_summary && (
                    <p className="text-sm whitespace-pre-wrap">
                      {step.output_summary}
                    </p>
                  )}
                  {step.error_message && (
                    <p className="text-destructive text-sm whitespace-pre-wrap">
                      {step.error_message}
                    </p>
                  )}
                </div>
                {!stepMutationsDisabled && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {getStepActions(step.status).map((action) => (
                      <Button
                        key={`${step.id}-${action.label}`}
                        type="button"
                        size="xs"
                        variant={
                          action.status === "failed" ||
                          action.status === "blocked"
                            ? "destructive"
                            : "outline"
                        }
                        onClick={() => handleActionClick(step, action)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={pendingAction !== null} onOpenChange={closeContextDialog}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => void handleContextSubmit(event)}
          >
            <DialogHeader>
              <DialogTitle>
                Update {pendingAction?.step.title ?? "step"}
              </DialogTitle>
              <DialogDescription>
                Store concise context with this manual step status change.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="workflow-step-context">
                {contextIsError ? "Error message" : "Output summary"}
              </Label>
              <Textarea
                id="workflow-step-context"
                value={contextText}
                maxLength={1000}
                rows={4}
                placeholder={
                  contextIsError
                    ? "Why is this step blocked or failed?"
                    : "What changed or what should the next resume use?"
                }
                onChange={(event) => setContextText(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {contextText.length}/1000 characters
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={savingContext}
                onClick={closeContextDialog}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingContext}>
                {savingContext
                  ? "Saving…"
                  : `Save ${pendingAction?.action.label.toLowerCase() ?? "status"}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
