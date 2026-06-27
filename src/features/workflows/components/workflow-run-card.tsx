import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { WorkflowEventList } from "@/features/workflows/components/workflow-event-list";
import { WorkflowRunStatusBadge } from "@/features/workflows/components/workflow-status-badge";
import { WorkflowStepList } from "@/features/workflows/components/workflow-step-list";
import type {
  AddWorkflowNoteInput,
  CancelWorkflowRunInput,
  SetWorkflowStepStatusInput,
  StartWorkflowRunInput,
  WorkflowRunWithDetails,
} from "@/workflows/types";

interface WorkflowRunCardProps {
  run: WorkflowRunWithDetails;
  selectedCampaignArchived: boolean;
  onStartRun: (input: StartWorkflowRunInput) => Promise<void>;
  onExecuteRun: (input: StartWorkflowRunInput) => Promise<void>;
  onResumeRun: (input: StartWorkflowRunInput) => Promise<void>;
  onCancelRun: (input: CancelWorkflowRunInput) => Promise<void>;
  onSetStepStatus: (input: SetWorkflowStepStatusInput) => Promise<void>;
  onAddNote: (input: AddWorkflowNoteInput) => Promise<void>;
}

const terminalStatuses = ["completed", "cancelled"];

export function WorkflowRunCard({
  run,
  selectedCampaignArchived,
  onStartRun,
  onExecuteRun,
  onResumeRun,
  onCancelRun,
  onSetStepStatus,
  onAddNote,
}: WorkflowRunCardProps): React.ReactNode {
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const canStart = ["queued", "blocked", "failed"].includes(run.status);
  const canExecute = ["queued", "running"].includes(run.status);
  const canResume = ["blocked", "failed"].includes(run.status);
  const canCancel = !terminalStatuses.includes(run.status);

  async function handleAddNote(): Promise<void> {
    const trimmed = note.trim();
    if (!trimmed) return;
    setSavingNote(true);
    try {
      await onAddNote({ workflowRunId: run.id, note: trimmed });
      setNote("");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Card className="bg-card/75">
      <CardHeader className="space-y-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{run.title}</CardTitle>
              <WorkflowRunStatusBadge status={run.status} />
            </div>
            <p className="text-muted-foreground text-sm">
              {run.campaign.name} · {run.campaign.status} campaign
            </p>
            <p className="text-sm">
              Current step: {run.currentStep?.title ?? run.current_step_key}
            </p>
            <p className="text-muted-foreground text-sm">
              {run.completedStepCount}/{run.totalStepCount} steps complete ·{" "}
              {run.progressPercent}%
            </p>
            {run.context_summary && (
              <p className="text-muted-foreground max-w-3xl text-sm whitespace-pre-wrap">
                {run.context_summary}
              </p>
            )}
          </div>
          {!selectedCampaignArchived && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {canStart && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onStartRun({ id: run.id })}
                >
                  Start run
                </Button>
              )}
              {canExecute && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void onExecuteRun({ id: run.id })}
                >
                  Run executor
                </Button>
              )}
              {canResume && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void onResumeRun({ id: run.id })}
                >
                  Resume executor
                </Button>
              )}
              {canCancel && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onCancelRun({ id: run.id })}
                >
                  Cancel run
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorkflowStepList
          steps={run.steps}
          runStatus={run.status}
          selectedCampaignArchived={selectedCampaignArchived}
          onSetStepStatus={onSetStepStatus}
        />

        {!selectedCampaignArchived && (
          <div className="bg-muted/20 rounded-xl border p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                placeholder="Add note to workflow history"
                aria-label="Workflow note"
                className="min-h-16"
              />
              <Button
                type="button"
                variant="outline"
                disabled={savingNote || note.trim() === ""}
                onClick={() => void handleAddNote()}
              >
                Add note
              </Button>
            </div>
          </div>
        )}

        <WorkflowEventList events={run.events} />
      </CardContent>
    </Card>
  );
}
