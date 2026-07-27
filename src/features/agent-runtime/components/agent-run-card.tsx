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

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getCheckpointGuidance(run: AgentRunWithDetails): string {
  const checkpoint = run.checkpoint;
  if (checkpoint === null) return "";
  if (checkpoint.phase === "continuation_ready") {
    return "The approved metadata result is saved. Recover to continue without executing the approved tool again. No schedule or publish action was created.";
  }
  if (checkpoint.approval_status === "approved") {
    return "Approval is confirmed. Resume explicitly to record metadata and continue the provider conversation. This does not schedule or publish.";
  }
  if (
    checkpoint.approval_status === "needs_review" ||
    checkpoint.approval_status === "changes_requested"
  ) {
    return "Review this item in Approvals. The agent remains paused and no provider, schedule, or publish action will run.";
  }
  return "The linked approval is no longer approved, so this continuation cannot resume.";
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
  const startableStatus =
    checkpoint === null && ["queued", "failed"].includes(run.status);
  const providerLabel = AGENT_PROVIDER_LABELS[run.provider_key];
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
      ? "Recover continuation"
      : "Resume approved run";
  const canCancel = !terminalStatuses.includes(run.status);

  return (
    <Card className="bg-card/75">
      <CardHeader className="space-y-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Bot className="text-linkgo-blue size-5" /> {run.agent_role}
              </CardTitle>
              <AgentRunStatusBadge status={run.status} />
              <Badge variant="outline">{providerLabel}</Badge>
              {run.playbook_key && (
                <Badge variant="outline">
                  Playbook: {playbook?.label ?? run.playbook_key}
                </Badge>
              )}
              {run.workflowRun && (
                <Badge variant="outline">
                  Workflow: {run.workflowRun.title}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {run.campaign.name} · {run.campaign.status} campaign ·{" "}
              {run.model_name}
            </p>
            <p className="text-muted-foreground text-sm">
              Iterations: {run.iteration_count} · Created {run.created_at}
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
                {run.error_message}
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
                    Approval #{checkpoint.approval_id}
                  </span>
                  <Badge variant="outline">
                    {checkpoint.approval_status.replace(/_/gu, " ")}
                  </Badge>
                  <Badge variant="outline">
                    {checkpoint.phase === "continuation_ready"
                      ? "Continuation saved"
                      : checkpoint.approval_status === "approved"
                        ? "Ready to resume"
                        : "Review required"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {getCheckpointGuidance(run)}
                </p>
                {killSwitchEnabled && (
                  <p className="text-muted-foreground">
                    Resume is blocked by the global kill switch.
                    {killSwitchReason ? ` ${killSwitchReason}` : ""}
                  </p>
                )}
                {!killSwitchEnabled && !providerConnected && (
                  <p className="text-muted-foreground">
                    Connect {providerLabel} in Integrations before resuming.
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
                  Start {providerLabel}
                </Button>
              )}
              {canResume && (
                <Button
                  type="button"
                  size="sm"
                  disabled={resuming}
                  aria-label={`${resumeLabel} for agent run ${run.id}`}
                  onClick={() => void onResumeRun({ id: run.id })}
                >
                  <RefreshCw
                    className={
                      resuming ? "size-4 motion-safe:animate-spin" : "size-4"
                    }
                  />
                  {resuming ? "Resuming…" : resumeLabel}
                </Button>
              )}
              {startBlockedByMissingProvider && (
                <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                  Connect {providerLabel} in Integrations first.
                </p>
              )}
              {startBlockedByKillSwitch && (
                <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                  Global kill switch is enabled.
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
                  Cancel run
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
              <Wrench className="text-linkgo-blue size-4" /> Tool calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {run.toolCalls.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No tool calls yet. Start the run to persist validated calls.
              </p>
            ) : (
              <div className="space-y-3">
                {run.toolCalls.map((toolCall) => (
                  <div
                    key={toolCall.id}
                    className="bg-muted/30 rounded-xl border p-3 text-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{toolCall.tool_name}</span>
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
                        {toolCall.error_message}
                      </p>
                    )}
                    <details className="space-y-2">
                      <summary className="text-muted-foreground cursor-pointer text-xs font-medium uppercase">
                        JSON payloads
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
