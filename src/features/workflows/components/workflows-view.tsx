import { AlertCircle, Target, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateWorkflowRunDialog } from "@/features/workflows/components/create-workflow-run-dialog";
import { WorkflowRunCard } from "@/features/workflows/components/workflow-run-card";
import { useWorkflows } from "@/features/workflows/hooks/use-workflows";
import type { WorkflowRunWithDetails } from "@/workflows/types";

export function WorkflowsView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    runs,
    loading,
    error,
    loadWorkflows,
    selectCampaign,
    createRun,
    startRun,
    executeRun,
    resumeRun,
    setStepStatus,
    cancelRun,
    addNote,
  } = useWorkflows();

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const summary = getWorkflowSummary(runs);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <Workflow className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Workflows
              </h2>
              <p className="text-muted-foreground text-sm">
                Resumable content pipeline runs, planner origins, manual
                executor controls, and local event history.
              </p>
            </div>
          </div>
        </div>
        <CreateWorkflowRunDialog
          campaigns={campaigns}
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
              onClick={() => void loadWorkflows()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading workflows…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyNoCampaigns />
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <label
                htmlFor="workflow-campaign-filter"
                className="text-sm font-medium"
              >
                Selected campaign
              </label>
              <p className="text-muted-foreground text-xs">
                Workflow runs and event history are stored locally.
              </p>
            </div>
            <select
              id="workflow-campaign-filter"
              value={selectedCampaignId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                selectCampaign(Number.isFinite(nextId) ? nextId : null);
              }}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto sm:min-w-60 forced-colors:border"
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
                Archived campaigns keep workflow history visible, but new runs
                and step changes are blocked. Restore the campaign first.
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
            <SummaryCard
              label="Blocked/failed"
              value={String(summary.blockedFailed)}
            />
            <SummaryCard label="Completed" value={String(summary.completed)} />
          </div>

          {runs.length === 0 ? (
            <EmptyRuns />
          ) : (
            <div className="space-y-4">
              {runs.map((run) => (
                <WorkflowRunCard
                  key={run.id}
                  run={run}
                  selectedCampaignArchived={selectedCampaignArchived}
                  onStartRun={startRun}
                  onExecuteRun={executeRun}
                  onResumeRun={resumeRun}
                  onCancelRun={cancelRun}
                  onSetStepStatus={setStepStatus}
                  onAddNote={addNote}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getWorkflowSummary(runs: WorkflowRunWithDetails[]): {
  activeRuns: number;
  waitingApproval: number;
  blockedFailed: number;
  completed: number;
} {
  return {
    activeRuns: runs.filter((run) => ["queued", "running"].includes(run.status))
      .length,
    waitingApproval: runs.filter((run) => run.status === "waiting_approval")
      .length,
    blockedFailed: runs.filter((run) =>
      ["blocked", "failed"].includes(run.status),
    ).length,
    completed: runs.filter((run) => run.status === "completed").length,
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
            Open Campaigns first and create a campaign. Workflows attach to one
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
          <Workflow className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No workflow runs yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Create a content pipeline run to track research, scoring, drafting,
            approval, scheduling, and measurement.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
