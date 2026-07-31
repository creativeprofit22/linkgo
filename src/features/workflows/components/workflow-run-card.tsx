import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { WorkflowEventList } from "@/features/workflows/components/workflow-event-list";
import { ScoreWorkflowDialog } from "@/features/workflows/components/score-workflow-dialog";
import { WorkflowRunStatusBadge } from "@/features/workflows/components/workflow-status-badge";
import { WorkflowStepList } from "@/features/workflows/components/workflow-step-list";
import type { ConnectedAccount } from "@/features/integrations/types";
import type {
  AddWorkflowNoteInput,
  CancelWorkflowRunInput,
  ExecuteWorkflowRunInput,
  SetWorkflowStepStatusInput,
  StartWorkflowRunInput,
  WorkflowRunWithDetails,
} from "@/workflows/types";

interface WorkflowRunCardProps {
  run: WorkflowRunWithDetails;
  selectedCampaignArchived: boolean;
  connectedAccounts: ConnectedAccount[];
  activeRunId: number | null;
  killSwitchEnabled: boolean;
  onStartRun: (input: StartWorkflowRunInput) => Promise<void>;
  onExecuteRun: (input: ExecuteWorkflowRunInput) => Promise<void>;
  onResumeRun: (input: StartWorkflowRunInput) => Promise<void>;
  onCancelRun: (input: CancelWorkflowRunInput) => Promise<void>;
  onSetStepStatus: (input: SetWorkflowStepStatusInput) => Promise<void>;
  onAddNote: (input: AddWorkflowNoteInput) => Promise<void>;
}

const terminalStatuses = ["completed", "cancelled"];

function getArtifactChipLabel(
  artifact: WorkflowRunWithDetails["artifacts"][number],
): string {
  const baseLabel = `Agent run #${artifact.artifact_id}`;
  const details = [artifact.agent_role, artifact.agent_status].filter(Boolean);
  return details.length > 0
    ? `${baseLabel} · ${details.join(" · ")}`
    : baseLabel;
}

export function WorkflowRunCard({
  run,
  selectedCampaignArchived,
  connectedAccounts,
  activeRunId,
  killSwitchEnabled,
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
  const actionPending = activeRunId === run.id;
  const plannerScoreStep =
    run.autopilot_plan_id !== null &&
    run.candidateScope !== null &&
    run.currentStep?.step_key === "score" &&
    !terminalStatuses.includes(run.status);
  const unscopedScoreStep =
    run.currentStep?.step_key === "score" && run.candidateScope === null;
  const agentArtifacts = run.artifacts.filter(
    (artifact) => artifact.artifact_type === "agent_run",
  );
  const autopilotOrigin =
    run.autopilot_plan_id == null
      ? null
      : `Autopilot plan #${run.autopilot_plan_id} · source batch #${run.source_import_batch_id}.`;

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
            {autopilotOrigin ? (
              <p className="text-muted-foreground max-w-3xl border-s-2 ps-3 text-xs leading-relaxed break-words">
                {autopilotOrigin} The local planner created this run; executor
                work and external actions remain operator-triggered or
                approval-gated.
              </p>
            ) : null}
            <p className="text-sm">
              Current step: {run.currentStep?.title ?? run.current_step_key}
            </p>
            {unscopedScoreStep ? (
              <p className="text-muted-foreground text-xs">
                Scoring is disabled because no candidate scope is attached.
              </p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              {run.completedStepCount}/{run.totalStepCount} steps complete ·{" "}
              {run.progressPercent}%
            </p>
            {run.context_summary && (
              <p className="text-muted-foreground max-w-3xl text-sm whitespace-pre-wrap">
                {run.context_summary}
              </p>
            )}
            {run.candidateScope !== null || agentArtifacts.length > 0 ? (
              <div
                className="flex max-w-3xl flex-wrap gap-2"
                aria-label="Workflow artifacts"
              >
                {run.candidateScope !== null ? (
                  <Badge variant="outline">
                    Candidate scope: {run.candidateScope.current} current,{" "}
                    {run.candidateScope.unscored} unscored,{" "}
                    {run.candidateScope.removed} removed
                  </Badge>
                ) : null}
                {agentArtifacts.map((artifact) => (
                  <Badge key={artifact.id} variant="outline">
                    {getArtifactChipLabel(artifact)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          {!selectedCampaignArchived && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {plannerScoreStep ? (
                <ScoreWorkflowDialog
                  run={run}
                  connectedAccounts={connectedAccounts}
                  pending={actionPending}
                  disabled={selectedCampaignArchived}
                  killSwitchEnabled={killSwitchEnabled}
                  onExecute={onExecuteRun}
                />
              ) : unscopedScoreStep ? (
                <Button type="button" size="sm" disabled>
                  No candidate scope
                </Button>
              ) : (
                <>
                  {canStart ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={actionPending}
                      onClick={() => void onStartRun({ id: run.id })}
                    >
                      Start run
                    </Button>
                  ) : null}
                  {canExecute ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actionPending}
                      onClick={() => void onExecuteRun({ id: run.id })}
                    >
                      {actionPending ? "Running executor…" : "Run executor"}
                    </Button>
                  ) : null}
                  {canResume ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actionPending}
                      onClick={() => void onResumeRun({ id: run.id })}
                    >
                      {actionPending ? "Resuming…" : "Resume executor"}
                    </Button>
                  ) : null}
                </>
              )}
              {canCancel && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={actionPending}
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
