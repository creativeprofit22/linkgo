import { AlertCircle, BarChart3, RefreshCw, Target } from "lucide-react";
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
  NativeMetricRefreshStatus,
  PostMetricWithDetails,
} from "@/features/metrics/types";

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
    ? "Stop metric refresh"
    : refreshStatus?.enabled
      ? "Disable metric refresh"
      : "Start metric refresh";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Metrics</h2>
              <p className="text-muted-foreground text-sm">
                Local snapshots plus opt-in LinkedIn social metadata refresh.
                Publishing and commenting stay human-approved.
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
            Refresh
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
            Refresh LinkedIn metrics now
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
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading metrics…
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
                Metric snapshots and learning events are stored locally.
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
                Archived campaigns keep metric history visible, but new metrics
                and memory changes are blocked. Restore the campaign first.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Measured posts"
              value={String(summary.measuredPosts)}
            />
            <SummaryCard
              label="Total impressions"
              value={summary.totalImpressions.toLocaleString()}
            />
            <SummaryCard
              label="Avg engagement"
              value={formatPercent(summary.averageEngagementRate)}
            />
            <SummaryCard
              label="Active memories"
              value={String(summary.activeMemories)}
            />
            <SummaryCard label="API refresh" value={refreshStatusLabel} />
            <SummaryCard
              label="Due refreshes"
              value={String(refreshDashboard?.summary.dueJobs ?? 0)}
            />
            <SummaryCard
              label="Unavailable"
              value={String(refreshDashboard?.summary.unavailableJobs ?? 0)}
            />
            <SummaryCard
              label="Last API snapshots"
              value={String(refreshDashboard?.summary.apiSnapshots ?? 0)}
            />
          </div>

          <Card className="border-linkgo-blue/30 bg-linkgo-blue/5">
            <CardContent className="text-muted-foreground p-4 text-sm">
              LinkedIn member API refresh collects reactions and comments from
              social metadata. Impressions, profile visits, link clicks,
              reposts, and CTR remain manual until Linkgo supports an approved
              analytics provider.
            </CardContent>
          </Card>

          {eligibleApprovals.length === 0 && !selectedCampaignArchived && (
            <Card className="bg-card/70 border-dashed">
              <CardContent className="text-muted-foreground p-4 text-sm">
                No published posts are ready for metrics. Publish an approved
                post from Approvals first.
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
              <h3 className="text-lg font-semibold">Campaign memory</h3>
              <p className="text-muted-foreground text-sm">
                Human-approved lessons saved from metric evidence.
              </p>
            </div>
            {memory.length === 0 ? (
              <Card className="bg-card/70 border-dashed">
                <CardContent className="text-muted-foreground p-4 text-sm">
                  No campaign memory yet. Save memory from a metric card after
                  recording performance.
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
  if (status?.running === true) return "Running";
  if (status?.enabled === true) return "Enabled (not running)";
  return "Stopped";
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
        <h3 className="text-lg font-semibold">LinkedIn metric refresh</h3>
        <p className="text-muted-foreground text-sm">
          Durable local jobs and recent worker events.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Refresh jobs</p>
            {jobs.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                No refresh jobs yet. Run a refresh after publishing a post.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Approval #{job.approval_id}
                      </span>
                      <span className="bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                        {job.status}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 truncate">
                      {job.target_urn || job.last_error || "No LinkedIn URN"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Next refresh: {job.next_refresh_at || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/70">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Recent refresh events</p>
            {events.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                No refresh events yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {events.slice(0, 6).map((event) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{event.summary}</span>
                      <span className="text-muted-foreground text-xs">
                        {event.severity}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {event.event_type} · {event.created_at}
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
            Open Campaigns first and create a campaign. Metrics attach to
            published approvals inside a campaign.
          </p>
        </div>
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
          <h3 className="text-lg font-semibold">No metrics yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Publish a post from Approvals, then record a manual metric snapshot
            here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
