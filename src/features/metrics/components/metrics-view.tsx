import { AlertCircle, BarChart3, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignMemoryCard } from "@/features/metrics/components/campaign-memory-card";
import { LearningEventList } from "@/features/metrics/components/learning-event-list";
import { MetricCard } from "@/features/metrics/components/metric-card";
import { RecordPostMetricDialog } from "@/features/metrics/components/record-post-metric-dialog";
import { useMetrics } from "@/features/metrics/hooks/use-metrics";
import type {
  CampaignMemory,
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
    loading,
    error,
    loadMetrics,
    selectCampaign,
    recordMetric,
    saveMemory,
    setMemoryStatus,
  } = useMetrics();

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const summary = getMetricsSummary(metrics, memory);

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
                Manual post metrics, campaign memory, and learning events. All
                data stays local; no LinkedIn collection happens here.
              </p>
            </div>
          </div>
        </div>
        <RecordPostMetricDialog
          eligibleApprovals={eligibleApprovals}
          selectedCampaignArchived={selectedCampaignArchived}
          disabled={campaigns.length === 0 || eligibleApprovals.length === 0}
          onRecord={recordMetric}
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
          </div>

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

          <LearningEventList events={events} />
        </>
      )}
    </div>
  );
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
