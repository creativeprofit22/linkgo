import { Bot, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_PROVIDER_LABELS, getAgentPlaybook } from "@/agent";
import { AgentEventList } from "@/features/agent-runtime/components/agent-event-list";
import {
  AgentRunStatusBadge,
  AgentToolCallStatusBadge,
} from "@/features/agent-runtime/components/agent-status-badge";
import { getAssistantActionLabel } from "@/lib/assistant-action-labels";
import { toPlainMessage } from "@/lib/plain-message";
import type { ApprovalStatus } from "@/features/approvals/types";
import type {
  AgentRunWithDetails,
  CancelAgentRunInput,
  ResumeAgentRunInput,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";

interface AgentRunCardProps {
  run: AgentRunWithDetails;
  selectedCampaignArchived: boolean;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  providerConnected: boolean;
  resuming: boolean;
  onStartRun: (input: StartAgentRunInput) => Promise<void>;
  onResumeRun: (input: ResumeAgentRunInput) => Promise<void>;
  onCancelRun: (input: CancelAgentRunInput) => Promise<void>;
}

const terminalStatuses = ["completed", "cancelled"];

const roleLabels: Record<string, string> = {
  researcher: "Find ideas",
  scorer: "Score ideas",
  drafter: "Write drafts",
  auditor: "Check drafts",
  scheduler: "Plan schedule",
  analyst: "Review results",
};

const approvalStatusLabels: Record<ApprovalStatus, string> = {
  needs_review: "Waiting for approval",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  published: "Posted",
  cancelled: "Cancelled",
};

const campaignStatusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getCheckpointGuidance(run: AgentRunWithDetails): string {
  const checkpoint = run.checkpoint;
  if (checkpoint === null) return "";
  if (checkpoint.phase === "continuation_ready") {
    return "Your approved result is saved. Pick up where it stopped — the approved action won't run twice. Nothing was scheduled or posted.";
  }
  if (checkpoint.approval_status === "approved") {
    return "You approved this. Choose Continue to save the result and let the AI service carry on. This doesn't schedule or post anything.";
  }
  if (
    checkpoint.approval_status === "needs_review" ||
    checkpoint.approval_status === "changes_requested"
  ) {
    return "Review this item in Approvals. The AI assistant stays paused. Nothing is sent to the AI service, scheduled, or posted until you do.";
  }
  return "This item is no longer approved, so the task can't continue.";
}

export function AgentRunCard({
  run,
  selectedCampaignArchived,
  killSwitchEnabled,
  killSwitchReason,
  providerConnected,
  resuming,
  onStartRun,
  onResumeRun,
  onCancelRun,
}: AgentRunCardProps): React.ReactNode {
  const checkpoint = run.checkpoint;
  const restartableStatus =
    checkpoint === null && ["queued", "failed"].includes(run.status);
  // Native start rejects quality-loop agents that are no longer active.
  const startBlockedByQualityLoop =
    restartableStatus && run.qualityStartBlocked;
  const startableStatus = restartableStatus && !run.qualityStartBlocked;
  const providerLabel = AGENT_PROVIDER_LABELS[run.provider_key];
  const startLabel =
    run.provider_key === "dry_run"
      ? "Start practice run"
      : `Start ${providerLabel}`;
  const playbook = getAgentPlaybook(run.playbook_key);
  const canStart = startableStatus && !killSwitchEnabled && providerConnected;
  const startBlockedByKillSwitch = startableStatus && killSwitchEnabled;
  const startBlockedByMissingProvider =
    startableStatus && !killSwitchEnabled && !providerConnected;
  const canResume =
    checkpoint !== null &&
    checkpoint.approval_status === "approved" &&
    !killSwitchEnabled &&
    providerConnected &&
    !selectedCampaignArchived;
  const resumeLabel =
    checkpoint?.phase === "continuation_ready"
      ? "Pick up where it stopped"
      : "Continue approved task";
  const canCancel = !terminalStatuses.includes(run.status);

  return (
    <Card className="bg-card/75">
      <CardHeader className="space-y-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Bot className="text-linkgo-blue size-5" />{" "}
                {roleLabels[run.agent_role] ?? run.agent_role}
              </CardTitle>
              <AgentRunStatusBadge status={run.status} />
              <Badge variant="outline">{providerLabel}</Badge>
              {run.playbook_key && (
                <Badge variant="outline">
                  Brand voice: {playbook?.label ?? run.playbook_key}
                </Badge>
              )}
              {run.workflowRun && (
                <Badge variant="outline">
                  Automation: {run.workflowRun.title}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {run.campaign.name} ·{" "}
              {campaignStatusLabels[run.campaign.status] ?? run.campaign.status}{" "}
              campaign · {run.model_name}
            </p>
            <p className="text-muted-foreground text-sm">
              Rounds: {run.iteration_count} · Created {run.created_at}
            </p>
            {run.input_summary && (
              <p className="max-w-3xl text-sm whitespace-pre-wrap">
                {run.input_summary}
              </p>
            )}
            {run.output_summary && (
              <p className="text-linkgo-green max-w-3xl text-sm whitespace-pre-wrap">
                {run.output_summary}
              </p>
            )}
            {run.error_message && (
              <p className="text-destructive max-w-3xl text-sm whitespace-pre-wrap">
                {toPlainMessage(run.error_message)}
              </p>
            )}
            {checkpoint && (
              <div
                className="bg-muted/40 max-w-3xl space-y-2 rounded-lg border p-3 text-sm"
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="text-linkgo-blue size-4" />
                  <span className="font-medium">
                    Approval needed · reference {checkpoint.approval_id}
                  </span>
                  <Badge variant="outline">
                    {approvalStatusLabels[checkpoint.approval_status]}
                  </Badge>
                  <Badge variant="outline">
                    {checkpoint.phase === "continuation_ready"
                      ? "Result saved"
                      : checkpoint.approval_status === "approved"
                        ? "Ready to continue"
                        : "Paused until you approve"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {getCheckpointGuidance(run)}
                </p>
                {killSwitchEnabled && (
                  <p className="text-muted-foreground">
                    Can't continue while the emergency pause is on.
                    {killSwitchReason ? ` ${killSwitchReason}` : ""}
                  </p>
                )}
                {!killSwitchEnabled && !providerConnected && (
                  <p className="text-muted-foreground">
                    Connect {providerLabel} in Connected accounts before you
                    continue.
                  </p>
                )}
              </div>
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
                  {startLabel}
                </Button>
              )}
              {canResume && (
                <Button
                  type="button"
                  size="sm"
                  disabled={resuming}
                  aria-label={`${resumeLabel} for assistant task ${run.id}`}
                  onClick={() => void onResumeRun({ id: run.id })}
                >
                  <RefreshCw
                    className={
                      resuming ? "size-4 motion-safe:animate-spin" : "size-4"
                    }
                  />
                  {resuming ? "Continuing…" : resumeLabel}
                </Button>
              )}
              {startBlockedByQualityLoop && (
                <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                  This task belongs to draft checks — continue it from Drafts.
                </p>
              )}
              {startBlockedByMissingProvider && (
                <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                  Connect {providerLabel} in Connected accounts first.
                </p>
              )}
              {startBlockedByKillSwitch && (
                <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                  Emergency pause is on.
                  {killSwitchReason ? ` ${killSwitchReason}` : ""}
                </p>
              )}
              {canCancel && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={resuming}
                  onClick={() => void onCancelRun({ id: run.id })}
                >
                  Cancel task
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="text-linkgo-blue size-4" /> Assistant actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {run.toolCalls.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No actions yet. Start the task to see what the assistant does.
              </p>
            ) : (
              <div className="space-y-3">
                {run.toolCalls.map((toolCall) => (
                  <div
                    key={toolCall.id}
                    className="bg-muted/30 rounded-xl border p-3 text-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {getAssistantActionLabel(toolCall.tool_name)}
                      </span>
                      {toolCall.provider_tool_call_id && (
                        <Badge variant="outline">
                          {toolCall.provider_tool_call_id}
                        </Badge>
                      )}
                      <AgentToolCallStatusBadge status={toolCall.status} />
                      {toolCall.requires_approval === 1 && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="size-3" /> Requires approval
                        </Badge>
                      )}
                    </div>
                    {toolCall.error_message && (
                      <p className="text-destructive mb-2">
                        {toPlainMessage(toolCall.error_message)}
                      </p>
                    )}
                    <details className="space-y-2">
                      <summary className="text-muted-foreground cursor-pointer text-xs font-medium uppercase">
                        Technical details
                      </summary>
                      <pre className="bg-background/80 mt-2 overflow-auto rounded-lg border p-3 text-xs">
                        {formatJson({
                          input: toolCall.input,
                          output: toolCall.output,
                        })}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <AgentEventList events={run.events} />
      </CardContent>
    </Card>
  );
}
