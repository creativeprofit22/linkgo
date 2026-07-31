import {
  AlertCircle,
  ListChecks,
  Play,
  RefreshCw,
  Route,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AutopilotPlanCard } from "@/features/autopilot-planner/components/autopilot-plan-card";
import { AutopilotPlannerEventList } from "@/features/autopilot-planner/components/autopilot-planner-event-list";
import { useAutopilotPlanner } from "@/features/autopilot-planner/hooks/use-autopilot-planner";

export function AutopilotPlannerView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    dashboard,
    status,
    loading,
    saving,
    ticking,
    error,
    resultSummary,
    refresh,
    selectCampaign,
    start,
    stop,
    tick,
  } = useAutopilotPlanner();
  const killSwitchEnabled = dashboard?.globalKillSwitchEnabled === true;
  const selectedCampaign = campaigns.find(
    (campaign) => campaign.id === selectedCampaignId,
  );
  const activeAutopilotCampaigns = campaigns.filter(
    (campaign) => campaign.status === "active" && campaign.auto_pilot === 1,
  );
  const statusLabel = status?.running
    ? "Running while Linkgo is open"
    : status?.enabled
      ? "Enabled, not running"
      : "Stopped";
  const controlsDisabled = loading || saving || ticking;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6" aria-busy={loading}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 shrink-0 items-center justify-center rounded-xl forced-colors:border">
            <Route aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">Autopilot</h2>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
              Converts approved local source batches into linked backlog and
              queued workflow records. It never fetches externally, runs a
              model, publishes, or comments.
            </p>
          </div>
        </div>
        <div className="grid w-full [grid-template-columns:repeat(auto-fit,minmax(min(8rem,100%),1fr))] gap-2 sm:w-auto sm:grid-cols-3 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={controlsDisabled}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={controlsDisabled}
            onClick={() => void tick()}
          >
            <ListChecks aria-hidden="true" className="size-4" />
            {ticking ? "Planning…" : "Plan now"}
          </Button>
          {status?.running ? (
            <Button
              type="button"
              variant="outline"
              className="col-span-full sm:col-auto"
              disabled={controlsDisabled}
              onClick={() => void stop()}
            >
              <Square aria-hidden="true" className="size-4" />
              {saving ? "Stopping…" : "Stop planner"}
            </Button>
          ) : (
            <Button
              type="button"
              className="col-span-full sm:col-auto"
              disabled={controlsDisabled || killSwitchEnabled}
              onClick={() => void start()}
            >
              <Play aria-hidden="true" className="size-4" />
              {saving ? "Starting…" : "Start planner"}
            </Button>
          )}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {resultSummary}
      </p>

      {error ? (
        <Card className="border-destructive forced-colors:border">
          <CardContent className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <AlertCircle
                aria-hidden="true"
                className="text-destructive mt-0.5 size-5 shrink-0"
              />
              <div className="min-w-0">
                <p className="font-medium">
                  Autopilot planner could not be loaded
                </p>
                <p className="text-muted-foreground text-sm break-words">
                  {error}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading && dashboard === null ? (
        <Card className="bg-card/70">
          <CardContent
            className="text-muted-foreground p-8 text-center text-sm"
            role="status"
          >
            Loading autopilot planner…
          </CardContent>
        </Card>
      ) : dashboard !== null ? (
        <>
          <Card className="bg-card/70 forced-colors:border">
            <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold">Planner status: {statusLabel}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Checks up to {status?.settings.maxBatchesPerTick ?? 3} source
                  batches every {status?.settings.pollIntervalMinutes ?? 60}{" "}
                  minutes after you start it.
                </p>
              </div>
              <p className="text-sm font-medium">Local records only</p>
            </CardContent>
          </Card>

          {killSwitchEnabled ? (
            <Card className="border-destructive forced-colors:border">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertCircle
                  aria-hidden="true"
                  className="text-destructive mt-0.5 size-5 shrink-0"
                />
                <div>
                  <p className="font-medium">Global kill switch is enabled</p>
                  <p className="text-muted-foreground text-sm break-words">
                    Planner starts and work creation are blocked. Existing
                    backlog items and workflows stay unchanged.
                    {dashboard.killSwitchReason
                      ? ` Reason: ${dashboard.killSwitchReason}`
                      : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <section
            aria-labelledby="autopilot-scope-heading"
            className="bg-card/60 rounded-xl border p-4 forced-colors:border"
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] sm:items-end">
              <div>
                <h3
                  id="autopilot-scope-heading"
                  className="text-sm font-semibold"
                >
                  Planner scope
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Filter counts, source-to-work plans, and campaign-linked
                  events.
                </p>
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="autopilot-campaign-filter"
                  className="text-sm font-medium"
                >
                  Campaign
                </label>
                <select
                  id="autopilot-campaign-filter"
                  value={selectedCampaignId ?? "all"}
                  onChange={(event) => {
                    const value = event.target.value;
                    selectCampaign(value === "all" ? null : Number(value));
                  }}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  <option value="all">All campaigns</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name} ({campaign.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {selectedCampaign && selectedCampaign.status !== "active" ? (
            <Card className="forced-colors:border">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                <div>
                  <p className="font-medium capitalize">
                    {selectedCampaign.status} campaign is not eligible
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Make the campaign active before the local planner can
                    convert its completed source batches.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <section
            aria-label="Autopilot planner summary"
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            <SummaryCard
              label="Eligible now"
              value={dashboard.summary.eligibleBatches}
            />
            <SummaryCard
              label="Planned"
              value={dashboard.summary.plannedBatches}
            />
            <SummaryCard
              label="Skipped"
              value={dashboard.summary.skippedBatches}
            />
            <SummaryCard
              label="Failures · 7 days"
              value={dashboard.summary.recentFailures}
            />
          </section>

          <section
            className="space-y-3"
            aria-labelledby="recent-autopilot-plans-heading"
          >
            <div>
              <h3
                id="recent-autopilot-plans-heading"
                className="text-lg font-semibold"
              >
                Recent source-to-work plans
              </h3>
              <p className="text-muted-foreground text-sm">
                Each planned batch owns one Linkgo scoring item and one queued
                content workflow.
              </p>
            </div>
            {dashboard.recentPlans.length === 0 ? (
              selectedCampaignId !== null ? (
                <EmptyState
                  title="No plans for this campaign"
                  description="Run a manual planner tick after this campaign is active, opted in, and has a completed approved source batch."
                />
              ) : (
                <FirstUseState
                  campaignCount={campaigns.length}
                  activeAutopilotCount={activeAutopilotCampaigns.length}
                />
              )
            ) : (
              <div className="space-y-4">
                {dashboard.recentPlans.map((plan) => (
                  <AutopilotPlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            )}
          </section>

          <AutopilotPlannerEventList events={dashboard.recentEvents} />
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.ReactNode {
  return (
    <Card className="bg-card/70 forced-colors:border">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function FirstUseState({
  campaignCount,
  activeAutopilotCount,
}: {
  campaignCount: number;
  activeAutopilotCount: number;
}): React.ReactNode {
  const title =
    campaignCount === 0
      ? "Create a campaign first"
      : activeAutopilotCount === 0
        ? "Enable planner eligibility"
        : "Import an approved source batch";
  const description =
    campaignCount === 0
      ? "Create a campaign, make it active, and enable Autopilot intent."
      : activeAutopilotCount === 0
        ? "Make a campaign active and enable Autopilot intent. This opts it into local planning only."
        : "Open an eligible campaign and import approved local JSON. The planner only sees completed policy-enforced batches.";
  return <EmptyState title={title} description={description} />;
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed forced-colors:border">
      <CardContent className="flex flex-col items-center p-8 text-center">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
