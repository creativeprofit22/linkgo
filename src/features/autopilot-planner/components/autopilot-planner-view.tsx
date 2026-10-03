import {
  AlertCircle,
  ListChecks,
  Play,
  RefreshCw,
  Route,
  Square,
} from "lucide-react";
import { CreateFirstCampaignButton } from "@/features/campaigns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AutopilotPlanCard } from "@/features/autopilot-planner/components/autopilot-plan-card";
import { AutopilotPlannerEventList } from "@/features/autopilot-planner/components/autopilot-planner-event-list";
import { useAutopilotPlanner } from "@/features/autopilot-planner/hooks/use-autopilot-planner";
import { CAMPAIGN_STATUS_LABELS } from "@/features/campaigns/types";

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
      ? "On, not running"
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
              Let Linkgo suggest what to work on next. Autopilot turns your
              imported posts into tasks and automations. It never fetches from
              the web, uses AI, posts, or comments.
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
            {ticking ? "Checking…" : "Check now"}
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
              {saving ? "Stopping…" : "Stop Autopilot"}
            </Button>
          ) : (
            <Button
              type="button"
              className="col-span-full sm:col-auto"
              disabled={controlsDisabled || killSwitchEnabled}
              onClick={() => void start()}
            >
              <Play aria-hidden="true" className="size-4" />
              {saving ? "Starting…" : "Start Autopilot"}
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
                <p className="font-medium">We couldn't load Autopilot</p>
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
              Try again
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
            Loading Autopilot…
          </CardContent>
        </Card>
      ) : dashboard !== null ? (
        <>
          <Card className="bg-card/70 forced-colors:border">
            <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold">Autopilot status: {statusLabel}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Once started, it checks up to{" "}
                  {status?.settings.maxBatchesPerTick ?? 3} imports every{" "}
                  {status?.settings.pollIntervalMinutes ?? 60} minutes.
                </p>
              </div>
              <p className="text-sm font-medium">Nothing is posted</p>
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
                  <p className="font-medium">Pause everything is on</p>
                  <p className="text-muted-foreground text-sm break-words">
                    Autopilot can't start or create new tasks. Your existing
                    tasks and automations stay as they are.
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
                  Show campaign
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Filter the counts, plans, and activity below by campaign.
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
                      {campaign.name} ({CAMPAIGN_STATUS_LABELS[campaign.status]}
                      )
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
                  <p className="font-medium">
                    This campaign is{" "}
                    {CAMPAIGN_STATUS_LABELS[
                      selectedCampaign.status
                    ].toLowerCase()}
                    , so it isn't included in Autopilot
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Make the campaign active so Autopilot can turn its imports
                    into tasks.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <section
            aria-label="Autopilot summary"
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            <SummaryCard
              label="Ready now"
              value={dashboard.summary.eligibleBatches}
            />
            <SummaryCard
              label="Tasks created"
              value={dashboard.summary.plannedBatches}
            />
            <SummaryCard
              label="Skipped"
              value={dashboard.summary.skippedBatches}
            />
            <SummaryCard
              label="Problems · 7 days"
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
                Recent plans
              </h3>
              <p className="text-muted-foreground text-sm">
                Each import Autopilot plans becomes one scoring task and one
                automation.
              </p>
            </div>
            {dashboard.recentPlans.length === 0 ? (
              selectedCampaignId !== null ? (
                <EmptyState
                  title="No plans for this campaign"
                  description="Make sure this campaign is active, included in Autopilot, and has a finished import. Then select Check now."
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
        ? "Include a campaign in Autopilot"
        : "Import posts to get started";
  const description =
    campaignCount === 0
      ? "Create a campaign, make it active, and include it in Autopilot."
      : activeAutopilotCount === 0
        ? "Make a campaign active and include it in Autopilot. Autopilot only creates tasks. It never posts."
        : "Open a campaign that's included in Autopilot and import posts. Autopilot only uses finished imports that passed your idea filters.";
  return (
    <EmptyState
      title={title}
      description={description}
      action={campaignCount === 0 ? <CreateFirstCampaignButton /> : undefined}
    />
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed forced-colors:border">
      <CardContent className="flex flex-col items-center p-8 text-center">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          {description}
        </p>
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
