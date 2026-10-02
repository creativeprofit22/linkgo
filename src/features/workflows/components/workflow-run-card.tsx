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

const draftIntentLabels: Record<string, string> = {
  event: "Event post",
  launch: "Launch post",
  idea: "Idea post",
  community: "Community post",
};

const draftStatusLabels: Record<string, string> = {
  drafting: "Draft",
  needs_revision: "Needs changes",
  ready_for_review: "Ready for review",
  archived: "Archived",
};

const agentRoleLabels: Record<string, string> = {
  researcher: "Finding ideas",
  scorer: "Scoring ideas",
  drafter: "Writing drafts",
  auditor: "Checking drafts",
  scheduler: "Scheduling",
  analyst: "Reviewing results",
};

const agentStatusLabels: Record<string, string> = {
  queued: "Not started",
  running: "In progress",
  waiting_approval: "Waiting for approval",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

const campaignStatusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

const stepKeyLabels: Record<string, string> = {
  research: "Find ideas",
  score: "Score ideas",
  draft: "Write drafts",
  audit: "Check drafts",
  approve: "Approve",
  schedule: "Schedule",
  measure: "Check results",
};

function labelFor(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value.replace(/_/g, " ");
}

function getArtifactChipLabel(
  artifact: WorkflowRunWithDetails["artifacts"][number],
): string {
  if (artifact.artifact_type === "draft") {
    if (artifact.draft_removed) return "Draft · removed";
    const intent = labelFor(
      draftIntentLabels,
      artifact.draft_content_intent ?? "idea",
    );
    const status =
      artifact.draft_status === null
        ? "Status unknown"
        : labelFor(draftStatusLabels, artifact.draft_status);
    return `Draft · ${intent} · ${status}`;
  }
  const baseLabel = `AI assistant task #${artifact.artifact_id}`;
  const details = [
    artifact.agent_role === null
      ? null
      : labelFor(agentRoleLabels, artifact.agent_role),
    artifact.agent_status === null
      ? null
      : labelFor(agentStatusLabels, artifact.agent_status),
  ].filter(Boolean);
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
  const plannerDraftStep =
    run.autopilot_plan_id !== null &&
    run.currentStep?.step_key === "draft" &&
    !terminalStatuses.includes(run.status);
  const plannerAuditStep =
    run.autopilot_plan_id !== null &&
    run.currentStep?.step_key === "audit" &&
    !terminalStatuses.includes(run.status);
  const unscopedScoreStep =
    run.currentStep?.step_key === "score" && run.candidateScope === null;
  const visibleArtifacts = run.artifacts.filter((artifact) =>
    ["agent_run", "draft"].includes(artifact.artifact_type),
  );
  const autopilotOrigin =
    run.autopilot_plan_id == null
      ? null
      : "Started by Autopilot from your imported ideas.";

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
              {run.campaign.name} ·{" "}
              {labelFor(campaignStatusLabels, run.campaign.status)} campaign
            </p>
            {autopilotOrigin ? (
              <p className="text-muted-foreground max-w-3xl border-s-2 ps-3 text-xs leading-relaxed break-words">
                {autopilotOrigin} Each step still waits for you to start it, and
                nothing is posted without your OK.
              </p>
            ) : null}
            <p className="text-sm">
              Current step:{" "}
              {run.currentStep?.title ??
                labelFor(stepKeyLabels, run.current_step_key)}
            </p>
            {unscopedScoreStep ? (
              <p className="text-muted-foreground text-xs">
                Scoring is off because no ideas are attached.
              </p>
            ) : null}
            {plannerDraftStep ? (
              <p className="text-muted-foreground text-xs">
                Finish this step in Drafts: write versions and save one. Then
                come back here to check it.
              </p>
            ) : null}
            {plannerAuditStep ? (
              <p className="text-muted-foreground text-xs">
                Checks the latest copy of every saved version, using the same AI
                service that wrote the drafts.
              </p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              {run.completedStepCount} of {run.totalStepCount} steps done ·{" "}
              {run.progressPercent}%
            </p>
            {run.context_summary && (
              <p className="text-muted-foreground max-w-3xl text-sm whitespace-pre-wrap">
                {run.context_summary}
              </p>
            )}
            {run.candidateScope !== null || visibleArtifacts.length > 0 ? (
              <div
                className="flex max-w-3xl flex-wrap gap-2"
                aria-label="Linked items"
              >
                {run.candidateScope !== null ? (
                  <Badge variant="outline">
                    Ideas: {run.candidateScope.current} attached,{" "}
                    {run.candidateScope.unscored} not scored yet,{" "}
                    {run.candidateScope.removed} removed
                  </Badge>
                ) : null}
                {visibleArtifacts.map((artifact) => (
                  <Badge key={artifact.id} variant="outline">
                    {getArtifactChipLabel(artifact)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          {!selectedCampaignArchived && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {plannerDraftStep ? (
                <Button type="button" size="sm" disabled>
                  Continue in Drafts
                </Button>
              ) : plannerScoreStep ? (
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
                  No ideas attached
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
                      Start automation
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
                      {actionPending
                        ? plannerAuditStep
                          ? "Checking saved versions…"
                          : "Working on next step…"
                        : plannerAuditStep
                          ? "Check all saved versions"
                          : "Do next step"}
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
                      {actionPending
                        ? plannerAuditStep
                          ? "Continuing checks…"
                          : "Continuing…"
                        : plannerAuditStep
                          ? "Continue checks"
                          : "Continue automation"}
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
                  Stop automation
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
          saveOnlyStepId={
            plannerDraftStep ? (run.currentStep?.id ?? null) : null
          }
          onSetStepStatus={onSetStepStatus}
        />

        {!selectedCampaignArchived && (
          <div className="bg-muted/20 rounded-xl border p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                placeholder="Add a note to this automation's history"
                aria-label="Automation note"
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
