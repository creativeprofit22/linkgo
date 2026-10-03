import { AlertCircle, BarChart3, RefreshCw, Target } from "lucide-react";
import { CreateFirstCampaignButton } from "@/features/campaigns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignMemoryCard } from "@/features/metrics/components/campaign-memory-card";
import { LearningEventList } from "@/features/metrics/components/learning-event-list";
import { MetricCard } from "@/features/metrics/components/metric-card";
import { RecordPostMetricDialog } from "@/features/metrics/components/record-post-metric-dialog";
import { useMetrics } from "@/features/metrics/hooks/use-metrics";
import type {
  CampaignMemory,
  MetricRefreshDashboard,
  MetricRefreshEventSeverity,
  MetricRefreshEventType,
  MetricRefreshJobStatus,
  NativeMetricRefreshStatus,
  PostMetricWithDetails,
} from "@/features/metrics/types";
import { toPlainMessage } from "@/lib/plain-message";

const refreshJobStatusLabels: Record<MetricRefreshJobStatus, string> = {
  active: "On",
  paused: "Paused",
  unavailable: "Not available",
  failed: "Didn't update",
};

const refreshEventTypeLabels: Record<MetricRefreshEventType, string> = {
  refresh_started: "Update started",
  refresh_completed: "Updated",
  refresh_retry_scheduled: "Will try again",
  refresh_unavailable: "Not available",
  refresh_failed: "Didn't update",
  refresh_blocked: "Held back",
  worker_started: "Auto-update turned on",
  worker_stopped: "Auto-update turned off",
  tick_started: "Check started",
  tick_completed: "Check done",
};

const refreshEventSeverityLabels: Record<MetricRefreshEventSeverity, string> = {
  info: "Info",
  warning: "Heads up",
  error: "Problem",
};

export function MetricsView(): React.ReactNode {
  const {
    campaigns,
    selectedCampaignId,
    eligibleApprovals,
    metrics,
    memory,
    events,
    refreshDashboard,
    refreshStatus,
    loading,
    error,
    loadMetrics,
    selectCampaign,
    recordMetric,
    saveMemory,
    setMemoryStatus,
    startRefresh,
    stopRefresh,
    refreshNow,
  } = useMetrics();

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const summary = getMetricsSummary(metrics, memory);
  const refreshStatusLabel = getMetricRefreshStatusLabel(refreshStatus);
  const refreshControlStops =
    refreshStatus?.running === true || refreshStatus?.enabled === true;
  const refreshActionLabel = refreshStatus?.running
    ? "Turn off auto-update"
    : refreshStatus?.enabled
      ? "Turn off auto-update"
      : "Turn on auto-update";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Analytics
              </h2>
              <p className="text-muted-foreground text-sm">
                See how your posts perform and what you&rsquo;ve learned. Linkgo
                never posts without your OK.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMetrics()}
          >
            Reload
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={refreshControlStops ? "outline" : "default"}
              onClick={() =>
                void (refreshControlStops ? stopRefresh() : startRefresh())
              }
              aria-label={`${refreshActionLabel}: ${refreshStatusLabel}`}
            >
              {refreshActionLabel}
            </Button>
            <span className="text-muted-foreground text-sm">
              {refreshStatusLabel}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshNow()}
          >
            <RefreshCw className="size-4" />
            Update from LinkedIn now
          </Button>
          <RecordPostMetricDialog
            eligibleApprovals={eligibleApprovals}
            selectedCampaignArchived={selectedCampaignArchived}
            disabled={campaigns.length === 0 || eligibleApprovals.length === 0}
            onRecord={recordMetric}
          />
        </div>
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
              onClick={() => void loadMetrics()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading analytics…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyNoCampaigns />
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Campaign</p>
              <p className="text-muted-foreground text-xs">
                Your results and what you&rsquo;ve learned stay on this
                computer.
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
                This campaign is archived. You can see its past results, but you
                can&rsquo;t add results or change notes. Restore the campaign
                first.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Posts tracked"
              value={String(summary.measuredPosts)}
            />
            <SummaryCard
              label="Total impressions"
              value={summary.totalImpressions.toLocaleString()}
            />
            <SummaryCard
              label="Average engagement"
              value={formatPercent(summary.averageEngagementRate)}
            />
            <SummaryCard
              label="Active notes"
              value={String(summary.activeMemories)}
            />
            <SummaryCard label="Auto-update" value={refreshStatusLabel} />
            <SummaryCard
              label="Updates due"
              value={String(refreshDashboard?.summary.dueJobs ?? 0)}
            />
            <SummaryCard
              label="Not available"
              value={String(refreshDashboard?.summary.unavailableJobs ?? 0)}
            />
            <SummaryCard
              label="Updates from LinkedIn"
              value={String(refreshDashboard?.summary.apiSnapshots ?? 0)}
            />
          </div>

          <Card className="border-linkgo-blue/30 bg-linkgo-blue/5">
            <CardContent className="text-muted-foreground p-4 text-sm">
              Linkgo can bring in reactions and comments from LinkedIn for you.
              For now, add impressions, profile visits, link clicks, reposts,
              and click-through rate yourself.
            </CardContent>
          </Card>

          {eligibleApprovals.length === 0 && !selectedCampaignArchived && (
            <Card className="bg-card/70 border-dashed">
              <CardContent className="text-muted-foreground p-4 text-sm">
                None of your posts have gone out yet. Post an approved post from
                Approvals first.
              </CardContent>
            </Card>
          )}

          {metrics.length === 0 ? (
            <EmptyMetrics />
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => (
                <MetricCard
                  key={metric.id}
                  metric={metric}
                  selectedCampaignArchived={selectedCampaignArchived}
                  onSaveMemory={saveMemory}
                />
              ))}
            </div>
          )}

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                What we&rsquo;ve learned
              </h3>
              <p className="text-muted-foreground text-sm">
                Lessons you saved from your post results.
              </p>
            </div>
            {memory.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-4 text-sm">
                  Nothing saved yet. Add results for a post, then click Save
                  lesson on it.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {memory.map((item) => (
                  <CampaignMemoryCard
                    key={item.id}
                    memory={item}
                    selectedCampaignArchived={selectedCampaignArchived}
                    onSetStatus={setMemoryStatus}
                  />
                ))}
              </div>
            )}
          </section>

          <MetricRefreshPanel dashboard={refreshDashboard} />

          <LearningEventList events={events} />
        </>
      )}
    </div>
  );
}

function getMetricRefreshStatusLabel(
  status: NativeMetricRefreshStatus | null,
): string {
  if (status?.running === true) return "On";
  if (status?.enabled === true) return "On (paused)";
  return "Off";
}

function getMetricsSummary(
  metrics: PostMetricWithDetails[],
  memory: CampaignMemory[],
): {
  measuredPosts: number;
  totalImpressions: number;
  averageEngagementRate: number | null;
  activeMemories: number;
} {
  const engagementRates = metrics
    .map((metric) => metric.engagementRate)
    .filter((value): value is number => value !== null);
  return {
    measuredPosts: metrics.length,
    totalImpressions: metrics.reduce(
      (total, metric) => total + metric.impressions,
      0,
    ),
    averageEngagementRate:
      engagementRates.length === 0
        ? null
        : engagementRates.reduce((total, value) => total + value, 0) /
          engagementRates.length,
    activeMemories: memory.filter((item) => item.status === "active").length,
  };
}

function MetricRefreshPanel({
  dashboard,
}: {
  dashboard: MetricRefreshDashboard | null;
}): React.ReactNode {
  const jobs = dashboard?.jobs ?? [];
  const events = dashboard?.events ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Updates from LinkedIn</h3>
        <p className="text-muted-foreground text-sm">
          Posts Linkgo checks for new results, and recent activity.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Posts being tracked</p>
            {jobs.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                Nothing tracked yet. After a post goes out, click Update from
                LinkedIn now.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Your post</span>
                      <span className="bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                        {refreshJobStatusLabels[job.status]}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 truncate">
                      {job.last_error || "Tracking this post on LinkedIn"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Next update: {job.next_refresh_at || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/70">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Recent activity</p>
            {events.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                No activity yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {events.slice(0, 6).map((event) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {toPlainMessage(event.summary)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {refreshEventSeverityLabels[event.severity]}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {refreshEventTypeLabels[event.event_type]} ·{" "}
                      {event.created_at}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
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
            Create a campaign to get started. Then you can track results for the
            posts in it.
          </p>
        </div>
        <CreateFirstCampaignButton />
      </CardContent>
    </Card>
  );
}

function EmptyMetrics(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <BarChart3 className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No results yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Post an approved post from Approvals, then click Add results to
            record how it did.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
