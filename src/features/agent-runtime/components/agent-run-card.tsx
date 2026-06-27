import { Bot, ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentEventList } from "@/features/agent-runtime/components/agent-event-list";
import {
  AgentRunStatusBadge,
  AgentToolCallStatusBadge,
} from "@/features/agent-runtime/components/agent-status-badge";
import type {
  AgentRunWithDetails,
  CancelAgentRunInput,
  StartAgentRunInput,
} from "@/features/agent-runtime/types";

interface AgentRunCardProps {
  run: AgentRunWithDetails;
  selectedCampaignArchived: boolean;
  killSwitchEnabled: boolean;
  killSwitchReason: string;
  onStartDryRun: (input: StartAgentRunInput) => Promise<void>;
  onCancelRun: (input: CancelAgentRunInput) => Promise<void>;
}

const terminalStatuses = ["completed", "cancelled"];

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function AgentRunCard({
  run,
  selectedCampaignArchived,
  killSwitchEnabled,
  killSwitchReason,
  onStartDryRun,
  onCancelRun,
}: AgentRunCardProps): React.ReactNode {
  const canStart =
    ["queued", "failed"].includes(run.status) && !killSwitchEnabled;
  const startBlockedByKillSwitch =
    ["queued", "failed"].includes(run.status) &&
    run.provider_key === "dry_run" &&
    killSwitchEnabled;
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
              <Badge variant="outline">{run.provider_key}</Badge>
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
          </div>
          {!selectedCampaignArchived && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {canStart && run.provider_key === "dry_run" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onStartDryRun({ id: run.id })}
                >
                  Start dry-run
                </Button>
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
                No tool calls yet. Start the dry-run to persist validated calls.
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
