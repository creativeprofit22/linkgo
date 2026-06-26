import { AlertCircle, Bot, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgentRunCard } from "@/features/agent-runtime/components/agent-run-card";
import { AgentToolContractList } from "@/features/agent-runtime/components/agent-tool-contract-list";
import { CreateAgentRunDialog } from "@/features/agent-runtime/components/create-agent-run-dialog";
import { useAgentRuntime } from "@/features/agent-runtime/hooks/use-agent-runtime";
import type { AgentRunWithDetails } from "@/features/agent-runtime/types";

export function AgentRuntimeView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    workflowRuns,
    agentRuns,
    toolContracts,
    loading,
    error,
    loadAgentRuntime,
    selectCampaign,
    createRun,
    startDryRun,
    cancelRun,
  } = useAgentRuntime();

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const summary = getAgentSummary(agentRuns);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <Bot className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Agent Runtime
              </h2>
              <p className="text-muted-foreground text-sm">
                Typed local model/tool loop, dry-run provider, and
                approval-gated tool contracts.
              </p>
            </div>
          </div>
        </div>
        <CreateAgentRunDialog
          campaigns={campaigns}
          workflowRuns={workflowRuns}
          selectedCampaignId={selectedCampaignId}
          selectedCampaignArchived={selectedCampaignArchived}
          onCreate={createRun}
        />
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadAgentRuntime()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading agent runtime…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyNoCampaigns />
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Selected campaign</p>
              <p className="text-muted-foreground text-xs">
                Agent runs, tool calls, and runtime events are stored locally.
              </p>
            </div>
            <select
              value={selectedCampaignId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                selectCampaign(Number.isFinite(nextId) ? nextId : null);
              }}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 min-w-60 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  {campaign.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedCampaignArchived && (
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="text-muted-foreground p-4 text-sm">
                Archived campaigns keep agent runtime history visible, but new
                runs and runtime changes are blocked. Restore the campaign
                first.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Active runs"
              value={String(summary.activeRuns)}
            />
            <SummaryCard
              label="Waiting approval"
              value={String(summary.waitingApproval)}
            />
            <SummaryCard label="Completed" value={String(summary.completed)} />
            <SummaryCard label="Failed" value={String(summary.failed)} />
          </div>

          <AgentToolContractList toolContracts={toolContracts} />

          {agentRuns.length === 0 ? (
            <EmptyRuns />
          ) : (
            <div className="space-y-4">
              {agentRuns.map((run) => (
                <AgentRunCard
                  key={run.id}
                  run={run}
                  selectedCampaignArchived={selectedCampaignArchived}
                  onStartDryRun={startDryRun}
                  onCancelRun={cancelRun}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getAgentSummary(runs: AgentRunWithDetails[]): {
  activeRuns: number;
  waitingApproval: number;
  completed: number;
  failed: number;
} {
  return {
    activeRuns: runs.filter((run) => ["queued", "running"].includes(run.status))
      .length,
    waitingApproval: runs.filter((run) => run.status === "waiting_approval")
      .length,
    completed: runs.filter((run) => run.status === "completed").length,
    failed: runs.filter((run) => run.status === "failed").length,
  };
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyNoCampaigns(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-green/10 text-linkgo-green flex size-14 items-center justify-center rounded-2xl">
          <Target className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No campaigns yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Open Campaigns first and create a campaign. Agent runs attach to one
            campaign.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRuns(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <Bot className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No agent runs yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Create a dry-run to validate the local provider loop, typed tool
            contracts, and approval gates.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
