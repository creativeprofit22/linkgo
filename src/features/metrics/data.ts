import { invoke } from "@tauri-apps/api/core";
import { getDb, type LinkgoDatabase } from "@/lib/db";
import { IS_TEST } from "@/lib/env";
import {
  createCampaignMemorySchema,
  nativeMetricRefreshStatusSchema,
  nativeMetricRefreshTickResultSchema,
  recordPostMetricSchema,
  setCampaignMemoryStatusSchema,
} from "@/features/metrics/schemas";
import type {
  CampaignMemory,
  CampaignMemoryStatus,
  CreateCampaignMemoryInput,
  LearningEvent,
  MetricApprovalSnapshot,
  MetricCampaignSnapshot,
  MetricDerivedValues,
  MetricDraftSnapshot,
  MetricEligibleApproval,
  MetricPublishSnapshot,
  MetricRefreshDashboard,
  MetricRefreshEvent,
  MetricRefreshJob,
  MetricRefreshSettings,
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

interface ApprovalMetricValidationRow {
  approval_id: number;
  campaign_id: number;
  campaign_status: CampaignStatus;
  status: ApprovalStatus;
}

interface PublishAttemptValidationRow {
  id: number;
  approval_id: number;
  status: "succeeded" | "failed";
}

interface CampaignStatusRow {
  id: number;
  status: CampaignStatus;
}

interface PostMetricCampaignRow {
  id: number;
  campaign_id: number;
}

interface CampaignMemoryValidationRow {
  id: number;
  campaign_id: number;
  status: CampaignMemoryStatus;
  campaign_status: CampaignStatus;
}

interface MetricRefreshSummaryRow {
  total_jobs: number;
  active_jobs: number;
  due_jobs: number;
  unavailable_jobs: number;
  failed_jobs: number;
  api_snapshots: number;
}

function getCampaignFilter(
  alias: string,
  campaignId: number | undefined,
  keyword: "WHERE" | "AND",
): { clause: string; values: unknown[] } {
  if (campaignId === undefined) return { clause: "", values: [] };
  return {
    clause: `${keyword} ${alias}.campaign_id = $1`,
    values: [campaignId],
  };
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

export async function listMetricEligibleApprovals(
  campaignId?: number,
): Promise<MetricEligibleApproval[]> {
  const db = await getDb();
  const { clause, values } = getCampaignFilter("a", campaignId, "AND");
  const rows = await db.select<MetricEligibleApprovalRow[]>(
    `SELECT
      c.id AS campaign_id,
      c.name AS campaign_name,
      c.status AS campaign_status,
      a.id AS approval_id,
      a.status AS approval_status,
      d.id AS draft_id,
      d.angle AS draft_angle,
      d.notes AS draft_notes,
      dv.id AS variant_id,
      dv.variant_number,
      dv.hook AS variant_hook,
      dv.body AS variant_body,
      dv.cta AS variant_cta,
      dv.hashtags AS variant_hashtags,
      dv.status AS variant_status,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      tp.url AS target_url,
      pa.id AS publish_attempt_id,
      pa.external_post_url AS publish_external_post_url,
      pa.platform_post_id AS publish_platform_post_id,
      pa.created_at AS publish_created_at
    FROM approvals a
    INNER JOIN campaigns c ON c.id = a.campaign_id
    INNER JOIN drafts d ON d.id = a.draft_id
    INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    INNER JOIN publish_attempts pa ON pa.id = (
      SELECT latest_pa.id FROM publish_attempts latest_pa
      WHERE latest_pa.approval_id = a.id AND latest_pa.status = 'succeeded'
      ORDER BY datetime(latest_pa.created_at) DESC, latest_pa.id DESC
      LIMIT 1
    )
    WHERE a.status = 'published'
      AND c.status <> 'archived'
      ${clause}
    ORDER BY datetime(pa.created_at) DESC, a.id DESC`,
    values,
  );
  return rows.map(mapEligibleApproval);
}

export async function listPostMetrics(
  campaignId?: number,
): Promise<PostMetricWithDetails[]> {
  const db = await getDb();
  const { clause, values } = getCampaignFilter("pm", campaignId, "WHERE");
  const rows = await db.select<MetricDetailRow[]>(
    `SELECT
      pm.*,
      c.name AS campaign_name,
      c.status AS campaign_status,
      a.status AS approval_status,
      d.id AS draft_id,
      d.angle AS draft_angle,
      d.notes AS draft_notes,
      dv.id AS variant_id,
      dv.variant_number,
      dv.hook AS variant_hook,
      dv.body AS variant_body,
      dv.cta AS variant_cta,
      dv.hashtags AS variant_hashtags,
      dv.status AS variant_status,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      tp.url AS target_url,
      pa.external_post_url AS publish_external_post_url,
      pa.platform_post_id AS publish_platform_post_id,
      pa.created_at AS publish_created_at
    FROM post_metrics pm
    INNER JOIN campaigns c ON c.id = pm.campaign_id
    INNER JOIN approvals a ON a.id = pm.approval_id
    INNER JOIN drafts d ON d.id = a.draft_id
    INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    LEFT JOIN publish_attempts pa ON pa.id = pm.publish_attempt_id
    ${clause}
    ORDER BY datetime(pm.measured_at) DESC, pm.id DESC`,
    values,
  );
  return rows.map(mapPostMetricWithDetails);
}

export async function listCampaignMemory(
  campaignId?: number,
): Promise<CampaignMemory[]> {
  const db = await getDb();
  const { clause, values } = getCampaignFilter("cm", campaignId, "WHERE");
  return db.select<CampaignMemory[]>(
    `SELECT * FROM campaign_memory cm
    ${clause}
    ORDER BY status = 'archived', datetime(updated_at) DESC, id DESC`,
    values,
  );
}

export async function listLearningEvents(
  campaignId?: number,
): Promise<LearningEvent[]> {
  const db = await getDb();
  const { clause, values } = getCampaignFilter("le", campaignId, "WHERE");
  return db.select<LearningEvent[]>(
    `SELECT * FROM learning_events le
    ${clause}
    ORDER BY datetime(created_at) DESC, id DESC`,
    values,
  );
}

async function getSuccessfulPublishAttempt(
  db: LinkgoDatabase,
  approvalId: number,
  publishAttemptId?: number,
): Promise<PublishAttemptValidationRow> {
  const rows = await db.select<PublishAttemptValidationRow[]>(
    publishAttemptId === undefined
      ? `SELECT id, approval_id, status FROM publish_attempts
        WHERE approval_id = $1 AND status = 'succeeded'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1`
      : `SELECT id, approval_id, status FROM publish_attempts
        WHERE id = $1 AND status = 'succeeded'
        LIMIT 1`,
    publishAttemptId === undefined ? [approvalId] : [publishAttemptId],
  );
  const publishAttempt = rows[0];
  if (
    publishAttempt === undefined ||
    publishAttempt.approval_id !== approvalId
  ) {
    throw new Error("Published approval needs a successful publish attempt");
  }
  return publishAttempt;
}

export async function recordPostMetric(
  input: RecordPostMetricInput,
): Promise<number> {
  const parsed = recordPostMetricSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const approvalRows = await db.select<ApprovalMetricValidationRow[]>(
      `SELECT
        a.id AS approval_id,
        a.campaign_id,
        c.status AS campaign_status,
        a.status
      FROM approvals a
      INNER JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.id = $1
      LIMIT 1`,
      [parsed.approvalId],
    );
    const approval = approvalRows[0];
    if (approval === undefined) throw new Error("Approval was not found");
    if (approval.campaign_id !== parsed.campaignId) {
      throw new Error("Approval does not belong to this campaign");
    }
    if (approval.campaign_status === "archived") {
      throw new Error("Campaign is archived");
    }
    if (approval.status !== "published") {
      throw new Error("Only published approvals can record metrics");
    }

    const publishAttempt = await getSuccessfulPublishAttempt(
      db,
      parsed.approvalId,
      parsed.publishAttemptId,
    );

    const result = await db.execute(
      `INSERT INTO post_metrics (
        campaign_id,
        approval_id,
        publish_attempt_id,
        platform,
        measured_at,
        impressions,
        reactions,
        comments,
        reposts,
        profile_visits,
        link_clicks,
        ctr,
        notes,
        collection_source,
        raw_payload_json,
        updated_at
      ) VALUES ($1, $2, $3, 'linkedin', $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', '', datetime('now'))`,
      [
        parsed.campaignId,
        parsed.approvalId,
        publishAttempt.id,
        parsed.measuredAt,
        parsed.impressions,
        parsed.reactions,
        parsed.comments,
        parsed.reposts,
        parsed.profileVisits,
        parsed.linkClicks,
        parsed.ctr,
        parsed.notes,
      ],
    );

    await db.execute(
      `INSERT INTO learning_events (
        campaign_id,
        post_metric_id,
        campaign_memory_id,
        event_type,
        summary
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        parsed.campaignId,
        result.lastInsertId,
        null,
        "metric_recorded",
        `Metric snapshot recorded for approval #${parsed.approvalId}`,
      ],
    );

    await db.execute("COMMIT");
    return result.lastInsertId;
  } catch (error) {
    await rollbackMetricsTransaction(db);
    throw error;
  }
}

export async function createCampaignMemory(
  input: CreateCampaignMemoryInput,
): Promise<number> {
  const parsed = createCampaignMemorySchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const campaignRows = await db.select<CampaignStatusRow[]>(
      `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
      [parsed.campaignId],
    );
    const campaign = campaignRows[0];
    if (campaign === undefined) throw new Error("Campaign was not found");
    if (campaign.status === "archived") throw new Error("Campaign is archived");

    if (parsed.postMetricId !== undefined) {
      const metricRows = await db.select<PostMetricCampaignRow[]>(
        `SELECT id, campaign_id FROM post_metrics WHERE id = $1 LIMIT 1`,
        [parsed.postMetricId],
      );
      const metric = metricRows[0];
      if (metric === undefined) throw new Error("Post metric was not found");
      if (metric.campaign_id !== parsed.campaignId) {
        throw new Error("Post metric does not belong to this campaign");
      }
    }

    const result = await db.execute(
      `INSERT INTO campaign_memory (
        campaign_id,
        post_metric_id,
        signal,
        summary,
        evidence,
        confidence,
        status,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', datetime('now'))`,
      [
        parsed.campaignId,
        parsed.postMetricId ?? null,
        parsed.signal,
        parsed.summary,
        parsed.evidence,
        parsed.confidence,
      ],
    );

    await db.execute(
      `INSERT INTO learning_events (
        campaign_id,
        post_metric_id,
        campaign_memory_id,
        event_type,
        summary
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        parsed.campaignId,
        parsed.postMetricId ?? null,
        result.lastInsertId,
        "memory_created",
        `Campaign memory created: ${parsed.summary}`,
      ],
    );

    await db.execute("COMMIT");
    return result.lastInsertId;
  } catch (error) {
    await rollbackMetricsTransaction(db);
    throw error;
  }
}

export async function setCampaignMemoryStatus(
  input: SetCampaignMemoryStatusInput,
): Promise<void> {
  const parsed = setCampaignMemoryStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const memoryRows = await db.select<CampaignMemoryValidationRow[]>(
      `SELECT
        cm.id,
        cm.campaign_id,
        cm.status,
        c.status AS campaign_status
      FROM campaign_memory cm
      INNER JOIN campaigns c ON c.id = cm.campaign_id
      WHERE cm.id = $1
      LIMIT 1`,
      [parsed.id],
    );
    const memory = memoryRows[0];
    if (memory === undefined) throw new Error("Campaign memory was not found");
    if (memory.campaign_status === "archived") {
      throw new Error("Campaign is archived");
    }

    await db.execute(
      `UPDATE campaign_memory
      SET status = $1, updated_at = datetime('now')
      WHERE id = $2`,
      [parsed.status, parsed.id],
    );

    const eventType =
      parsed.status === "archived" ? "memory_archived" : "memory_restored";
    await db.execute(
      `INSERT INTO learning_events (
        campaign_id,
        post_metric_id,
        campaign_memory_id,
        event_type,
        summary
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        memory.campaign_id,
        null,
        parsed.id,
        eventType,
        `Campaign memory ${parsed.status === "archived" ? "archived" : "restored"}`,
      ],
    );

    await db.execute("COMMIT");
  } catch (error) {
    await rollbackMetricsTransaction(db);
    throw error;
  }
}

export async function getMetricRefreshStatus(): Promise<NativeMetricRefreshStatus> {
  const payload = await invoke<unknown>("linkgo_metric_refresh_status");
  return nativeMetricRefreshStatusSchema.parse(
    payload,
  ) as NativeMetricRefreshStatus;
}

export async function startMetricRefresh(): Promise<NativeMetricRefreshStatus> {
  const payload = await invoke<unknown>("linkgo_metric_refresh_start");
  return nativeMetricRefreshStatusSchema.parse(
    payload,
  ) as NativeMetricRefreshStatus;
}

export async function stopMetricRefresh(): Promise<NativeMetricRefreshStatus> {
  const payload = await invoke<unknown>("linkgo_metric_refresh_stop");
  return nativeMetricRefreshStatusSchema.parse(
    payload,
  ) as NativeMetricRefreshStatus;
}

export async function runMetricRefreshTick(): Promise<NativeMetricRefreshTickResult> {
  const payload = await invoke<unknown>("linkgo_metric_refresh_tick");
  return nativeMetricRefreshTickResultSchema.parse(payload);
}

export async function listMetricRefreshDashboard(
  campaignId?: number,
): Promise<MetricRefreshDashboard> {
  const db = await getDb();
  const settingsRows = await db.select<MetricRefreshSettings[]>(
    "SELECT * FROM metric_refresh_settings WHERE id = 1 LIMIT 1",
  );
  const { clause: jobClause, values: jobValues } = getCampaignFilter(
    "mrj",
    campaignId,
    "WHERE",
  );
  const jobs = await db.select<MetricRefreshJob[]>(
    `SELECT * FROM metric_refresh_jobs mrj
    ${jobClause}
    ORDER BY status = 'active' DESC, datetime(next_refresh_at) ASC, id ASC`,
    jobValues,
  );

  const { clause: eventClause, values: eventValues } = getCampaignFilter(
    "mre",
    campaignId,
    "WHERE",
  );
  const events = await db.select<MetricRefreshEvent[]>(
    `SELECT * FROM metric_refresh_events mre
    ${eventClause}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 20`,
    eventValues,
  );

  const campaignPredicate =
    campaignId === undefined ? "" : "WHERE campaign_id = $1";
  const summaryRows = await db.select<MetricRefreshSummaryRow[]>(
    `SELECT
      (SELECT COUNT(*) FROM metric_refresh_jobs ${campaignPredicate}) AS total_jobs,
      (SELECT COUNT(*) FROM metric_refresh_jobs ${campaignPredicate} ${campaignId === undefined ? "WHERE" : "AND"} status = 'active') AS active_jobs,
      (SELECT COUNT(*) FROM metric_refresh_jobs ${campaignPredicate} ${campaignId === undefined ? "WHERE" : "AND"} status = 'active' AND datetime(next_refresh_at) <= datetime('now')) AS due_jobs,
      (SELECT COUNT(*) FROM metric_refresh_jobs ${campaignPredicate} ${campaignId === undefined ? "WHERE" : "AND"} status = 'unavailable') AS unavailable_jobs,
      (SELECT COUNT(*) FROM metric_refresh_jobs ${campaignPredicate} ${campaignId === undefined ? "WHERE" : "AND"} status = 'failed') AS failed_jobs,
      (SELECT COUNT(*) FROM post_metrics ${campaignPredicate} ${campaignId === undefined ? "WHERE" : "AND"} collection_source = 'linkedin_social_metadata') AS api_snapshots`,
    campaignId === undefined ? [] : [campaignId],
  );
  const summary = summaryRows[0] ?? {
    total_jobs: 0,
    active_jobs: 0,
    due_jobs: 0,
    unavailable_jobs: 0,
    failed_jobs: 0,
    api_snapshots: 0,
  };

  return {
    settings: settingsRows[0] ?? null,
    jobs,
    events,
    summary: {
      totalJobs: summary.total_jobs,
      activeJobs: summary.active_jobs,
      dueJobs: summary.due_jobs,
      unavailableJobs: summary.unavailable_jobs,
      failedJobs: summary.failed_jobs,
      apiSnapshots: summary.api_snapshots,
    },
  };
}

export async function rollbackMetricsTransaction(
  db: LinkgoDatabase,
): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
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
