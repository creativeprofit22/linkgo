import { invokeCommand } from "@/lib/tauri";
import { z } from "zod";
import {
  campaignMemoryListSchema,
  learningEventListSchema,
  metricEligibleApprovalListSchema,
  metricRefreshDashboardRecordSchema,
  postMetricDetailListSchema,
} from "@/features/metrics/record-schemas";
import { IS_TEST } from "@/lib/env";
import {
  createCampaignMemorySchema,
  metricsMutationResultSchema,
  nativeMetricRefreshStatusSchema,
  nativeMetricRefreshTickResultSchema,
  recordPostMetricSchema,
  setCampaignMemoryStatusSchema,
} from "@/features/metrics/schemas";
import type {
  CampaignMemory,
  CreateCampaignMemoryInput,
  LearningEvent,
  MetricApprovalSnapshot,
  MetricCampaignSnapshot,
  MetricDerivedValues,
  MetricDraftSnapshot,
  MetricEligibleApproval,
  MetricPublishSnapshot,
  MetricRefreshDashboard,
  MetricSourceSnapshot,
  MetricVariantSnapshot,
  NativeMetricRefreshStatus,
  NativeMetricRefreshTickResult,
  PostMetric,
  PostMetricWithDetails,
  RecordPostMetricInput,
  SetCampaignMemoryStatusInput,
} from "@/features/metrics/types";
import type { ApprovalStatus } from "@/features/approvals/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { DraftVariantStatus } from "@/features/drafts/types";

interface MetricDetailRow extends PostMetric {
  campaign_name: string;
  campaign_status: CampaignStatus;
  approval_status: ApprovalStatus;
  draft_id: number;
  draft_angle: string;
  draft_notes: string;
  variant_id: number;
  variant_number: number;
  variant_hook: string;
  variant_body: string;
  variant_cta: string;
  variant_hashtags: string;
  variant_status: DraftVariantStatus;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  target_url: string;
  publish_external_post_url: string | null;
  publish_platform_post_id: string | null;
  publish_created_at: string | null;
}

interface MetricEligibleApprovalRow {
  campaign_id: number;
  campaign_name: string;
  campaign_status: CampaignStatus;
  approval_id: number;
  approval_status: ApprovalStatus;
  draft_id: number;
  draft_angle: string;
  draft_notes: string;
  variant_id: number;
  variant_number: number;
  variant_hook: string;
  variant_body: string;
  variant_cta: string;
  variant_hashtags: string;
  variant_status: DraftVariantStatus;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  target_url: string;
  publish_attempt_id: number;
  publish_external_post_url: string;
  publish_platform_post_id: string;
  publish_created_at: string;
}

const optionalCampaignIdSchema = z.number().int().positive().optional();

function campaignInput(campaignId?: number): { campaignId?: number } {
  const parsed = optionalCampaignIdSchema.parse(campaignId);
  return parsed === undefined ? {} : { campaignId: parsed };
}

function mapCampaignSnapshot(row: {
  campaign_id: number;
  campaign_name: string;
  campaign_status: CampaignStatus;
}): MetricCampaignSnapshot {
  return {
    id: row.campaign_id,
    name: row.campaign_name,
    status: row.campaign_status,
  };
}

function mapApprovalSnapshot(row: {
  approval_id?: number;
  id?: number;
  approval_status: ApprovalStatus;
}): MetricApprovalSnapshot {
  return {
    id: row.approval_id ?? row.id ?? 0,
    status: row.approval_status,
  };
}

function mapDraftSnapshot(row: {
  draft_id: number;
  draft_angle: string;
  draft_notes: string;
}): MetricDraftSnapshot {
  return {
    id: row.draft_id,
    angle: row.draft_angle,
    notes: row.draft_notes,
  };
}

function mapVariantSnapshot(row: {
  variant_id: number;
  variant_number: number;
  variant_hook: string;
  variant_body: string;
  variant_cta: string;
  variant_hashtags: string;
  variant_status: DraftVariantStatus;
}): MetricVariantSnapshot {
  return {
    id: row.variant_id,
    variant_number: row.variant_number,
    hook: row.variant_hook,
    body: row.variant_body,
    cta: row.variant_cta,
    hashtags: row.variant_hashtags,
    status: row.variant_status,
  };
}

function mapSourceSnapshot(row: {
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  target_url: string;
}): MetricSourceSnapshot {
  return {
    author_name: row.target_author_name,
    author_profile_url: row.target_author_profile_url,
    content: row.target_content,
    url: row.target_url,
  };
}

function mapPublishSnapshot(row: {
  publish_attempt_id?: number | null;
  publish_external_post_url: string | null;
  publish_platform_post_id: string | null;
  publish_created_at: string | null;
}): MetricPublishSnapshot | null {
  if (row.publish_attempt_id === null || row.publish_attempt_id === undefined) {
    return null;
  }
  return {
    id: row.publish_attempt_id,
    external_post_url: row.publish_external_post_url ?? "",
    platform_post_id: row.publish_platform_post_id ?? "",
    created_at: row.publish_created_at ?? "",
  };
}

function getDerivedValues(metric: {
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  link_clicks: number;
  ctr: number | null;
}): MetricDerivedValues {
  const engagementCount = metric.reactions + metric.comments + metric.reposts;
  return {
    engagementCount,
    engagementRate:
      metric.impressions > 0
        ? (engagementCount / metric.impressions) * 100
        : null,
    displayCtr:
      metric.ctr ??
      (metric.impressions > 0
        ? (metric.link_clicks / metric.impressions) * 100
        : null),
  };
}

function mapPostMetric(row: MetricDetailRow): PostMetric {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    approval_id: row.approval_id,
    publish_attempt_id: row.publish_attempt_id,
    platform: row.platform,
    measured_at: row.measured_at,
    impressions: row.impressions,
    reactions: row.reactions,
    comments: row.comments,
    reposts: row.reposts,
    profile_visits: row.profile_visits,
    link_clicks: row.link_clicks,
    ctr: row.ctr,
    notes: row.notes,
    collection_source: row.collection_source ?? "manual",
    raw_payload_json: row.raw_payload_json ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPostMetricWithDetails(row: MetricDetailRow): PostMetricWithDetails {
  const metric = mapPostMetric(row);
  return {
    ...metric,
    ...getDerivedValues(metric),
    campaign: mapCampaignSnapshot(row),
    approval: mapApprovalSnapshot({
      approval_id: row.approval_id,
      approval_status: row.approval_status,
    }),
    draft: mapDraftSnapshot(row),
    variant: mapVariantSnapshot(row),
    source: mapSourceSnapshot(row),
    latestPublishAttempt: mapPublishSnapshot({
      publish_attempt_id: row.publish_attempt_id,
      publish_external_post_url: row.publish_external_post_url,
      publish_platform_post_id: row.publish_platform_post_id,
      publish_created_at: row.publish_created_at,
    }),
  };
}

function mapEligibleApproval(
  row: MetricEligibleApprovalRow,
): MetricEligibleApproval {
  return {
    campaign: mapCampaignSnapshot(row),
    approval: mapApprovalSnapshot({
      approval_id: row.approval_id,
      approval_status: row.approval_status,
    }),
    draft: mapDraftSnapshot(row),
    variant: mapVariantSnapshot(row),
    source: mapSourceSnapshot(row),
    latestPublishAttempt: {
      id: row.publish_attempt_id,
      external_post_url: row.publish_external_post_url,
      platform_post_id: row.publish_platform_post_id,
      created_at: row.publish_created_at,
    },
  };
}

/** Published approvals with a successful attempt, newest first; capped at 500. */
export async function listMetricEligibleApprovals(
  campaignId?: number,
): Promise<MetricEligibleApproval[]> {
  const rows = metricEligibleApprovalListSchema.parse(
    await invokeCommand("linkgo_metrics_eligible_approvals", {
      input: campaignInput(campaignId),
    }),
  );
  return rows.map(mapEligibleApproval);
}

/** Recorded post metrics with their draft/source snapshot; capped at 500. */
export async function listPostMetrics(
  campaignId?: number,
): Promise<PostMetricWithDetails[]> {
  const rows = postMetricDetailListSchema.parse(
    await invokeCommand("linkgo_metrics_post_metrics_list", {
      input: campaignInput(campaignId),
    }),
  );
  return rows.map(mapPostMetricWithDetails);
}

/** Campaign memory, active before archived; capped at 500. */
export async function listCampaignMemory(
  campaignId?: number,
): Promise<CampaignMemory[]> {
  return campaignMemoryListSchema.parse(
    await invokeCommand("linkgo_metrics_campaign_memory_list", {
      input: campaignInput(campaignId),
    }),
  );
}

/** Learning events, newest first; capped at 500. */
export async function listLearningEvents(
  campaignId?: number,
): Promise<LearningEvent[]> {
  return learningEventListSchema.parse(
    await invokeCommand("linkgo_metrics_learning_events_list", {
      input: campaignInput(campaignId),
    }),
  );
}

/**
 * Records a manual metric snapshot. Approval/campaign ownership, the
 * published + successful-attempt checks, the insert and its learning event
 * settle natively in one transaction. Resolves to the new metric id.
 */
export async function recordPostMetric(
  input: RecordPostMetricInput,
): Promise<number> {
  const parsed = recordPostMetricSchema.parse(input);
  return metricsMutationResultSchema.parse(
    await invokeCommand("linkgo_metrics_record_post_metric", {
      input: parsed,
    }),
  ).id;
}

/** Creates campaign memory natively (ownership checked); resolves to its id. */
export async function createCampaignMemory(
  input: CreateCampaignMemoryInput,
): Promise<number> {
  const parsed = createCampaignMemorySchema.parse(input);
  return metricsMutationResultSchema.parse(
    await invokeCommand("linkgo_metrics_create_campaign_memory", {
      input: parsed,
    }),
  ).id;
}

/** Archives or restores campaign memory natively with its learning event. */
export async function setCampaignMemoryStatus(
  input: SetCampaignMemoryStatusInput,
): Promise<void> {
  const parsed = setCampaignMemoryStatusSchema.parse(input);
  metricsMutationResultSchema.parse(
    await invokeCommand("linkgo_metrics_set_campaign_memory_status", {
      input: parsed,
    }),
  );
}

export async function getMetricRefreshStatus(): Promise<NativeMetricRefreshStatus> {
  const payload = await invokeCommand("linkgo_metric_refresh_status");
  return nativeMetricRefreshStatusSchema.parse(
    payload,
  ) as NativeMetricRefreshStatus;
}

export async function startMetricRefresh(): Promise<NativeMetricRefreshStatus> {
  const payload = await invokeCommand("linkgo_metric_refresh_start");
  return nativeMetricRefreshStatusSchema.parse(
    payload,
  ) as NativeMetricRefreshStatus;
}

export async function stopMetricRefresh(): Promise<NativeMetricRefreshStatus> {
  const payload = await invokeCommand("linkgo_metric_refresh_stop");
  return nativeMetricRefreshStatusSchema.parse(
    payload,
  ) as NativeMetricRefreshStatus;
}

export async function runMetricRefreshTick(): Promise<NativeMetricRefreshTickResult> {
  const payload = await invokeCommand("linkgo_metric_refresh_tick");
  return nativeMetricRefreshTickResultSchema.parse(payload);
}

/**
 * Metric-refresh dashboard: settings, up to 500 jobs, the 20 newest events
 * and summary counts, all read natively from one transaction.
 */
export async function listMetricRefreshDashboard(
  campaignId?: number,
): Promise<MetricRefreshDashboard> {
  return metricRefreshDashboardRecordSchema.parse(
    await invokeCommand("linkgo_metrics_refresh_dashboard", {
      input: campaignInput(campaignId),
    }),
  );
}

if (IS_TEST && typeof window !== "undefined") {
  (
    window as unknown as {
      __LINKGO_METRICS_TEST_API__?: {
        recordPostMetric: typeof recordPostMetric;
        createCampaignMemory: typeof createCampaignMemory;
        setCampaignMemoryStatus: typeof setCampaignMemoryStatus;
        getMetricRefreshStatus: typeof getMetricRefreshStatus;
        startMetricRefresh: typeof startMetricRefresh;
        stopMetricRefresh: typeof stopMetricRefresh;
        runMetricRefreshTick: typeof runMetricRefreshTick;
        listMetricRefreshDashboard: typeof listMetricRefreshDashboard;
      };
    }
  ).__LINKGO_METRICS_TEST_API__ = {
    recordPostMetric,
    createCampaignMemory,
    setCampaignMemoryStatus,
    getMetricRefreshStatus,
    startMetricRefresh,
    stopMetricRefresh,
    runMetricRefreshTick,
    listMetricRefreshDashboard,
  };
}
