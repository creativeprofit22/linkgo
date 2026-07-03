import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CreateMemoryDialog } from "@/features/metrics/components/create-memory-dialog";
import type {
  CreateCampaignMemoryInput,
  PostMetricWithDetails,
} from "@/features/metrics/types";

interface MetricCardProps {
  metric: PostMetricWithDetails;
  selectedCampaignArchived: boolean;
  onSaveMemory: (input: CreateCampaignMemoryInput) => Promise<void>;
}

export function MetricCard({
  metric,
  selectedCampaignArchived,
  onSaveMemory,
}: MetricCardProps): React.ReactNode {
  const authorName = metric.source.author_name || "Unknown author";
  const variantPreview = [
    metric.variant.hook,
    metric.variant.body,
    metric.variant.cta,
    metric.variant.hashtags,
  ]
    .filter(Boolean)
    .join("\n\n");
  const memorySummary = `Post earned ${metric.engagementCount} engagements at ${formatPercent(metric.engagementRate)} engagement.`;
  const memoryEvidence = `Measured ${metric.impressions.toLocaleString()} impressions, ${metric.reactions.toLocaleString()} reactions, ${metric.comments.toLocaleString()} comments, ${metric.reposts.toLocaleString()} reposts, and ${metric.link_clicks.toLocaleString()} link clicks.`;

  return (
    <Card className="linkgo-card bg-card/82 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <CardTitle className="truncate">{authorName}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-sm">
                {metric.campaign.name} · Variant {metric.variant.variant_number}{" "}
                · measured {metric.measured_at}
              </p>
              <span className="bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">
                {metric.collection_source === "linkedin_social_metadata"
                  ? "LinkedIn social metadata"
                  : "Manual"}
              </span>
            </div>
            <a
              href={metric.source.url}
              target="_blank"
              rel="noreferrer"
              className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline"
            >
              <span className="truncate">{metric.source.url}</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
          {!selectedCampaignArchived && (
            <CreateMemoryDialog
              campaignId={metric.campaign_id}
              postMetricId={metric.id}
              initialSummary={memorySummary}
              initialEvidence={memoryEvidence}
              onCreate={onSaveMemory}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <TextBlock label="Selected variant" value={variantPreview} />
          <TextBlock label="Source post" value={metric.source.content} />
        </div>

        {metric.latestPublishAttempt && (
          <div className="bg-muted/30 rounded-xl border p-4">
            <p className="font-medium">Latest publish evidence</p>
            <div className="text-muted-foreground mt-2 space-y-1 text-sm">
              {metric.latestPublishAttempt.external_post_url && (
                <a
                  href={metric.latestPublishAttempt.external_post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate hover:underline"
                >
                  <span className="truncate">
                    {metric.latestPublishAttempt.external_post_url}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              )}
              {metric.latestPublishAttempt.platform_post_id && (
                <p>
                  Platform ID: {metric.latestPublishAttempt.platform_post_id}
                </p>
              )}
              <p>{metric.latestPublishAttempt.created_at}</p>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricValue label="Impressions" value={metric.impressions} />
          <MetricValue label="Reactions" value={metric.reactions} />
          <MetricValue label="Comments" value={metric.comments} />
          <MetricValue label="Reposts" value={metric.reposts} />
          <MetricValue label="Profile visits" value={metric.profile_visits} />
          <MetricValue label="Link clicks" value={metric.link_clicks} />
          <MetricValue
            label="Engagement rate"
            value={formatPercent(metric.engagementRate)}
          />
          <MetricValue label="CTR" value={formatPercent(metric.displayCtr)} />
        </div>

        {metric.collection_source === "linkedin_social_metadata" && (
          <div className="border-linkgo-blue/30 bg-linkgo-blue/5 text-muted-foreground rounded-xl border p-4 text-sm">
            LinkedIn API snapshots include reactions and comments only for
            member posts. Zero impressions, reposts, profile visits, link
            clicks, and CTR mean unavailable here—not zero reach.
          </div>
        )}

        {metric.notes && (
          <>
            <Separator />
            <TextBlock label="Notes" value={metric.notes} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricValue({
  label,
  value,
}: {
  label: string;
  value: number | string;
}): React.ReactNode {
  return (
    <div className="bg-muted/30 rounded-xl border p-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="bg-muted/30 rounded-xl border p-4">
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
