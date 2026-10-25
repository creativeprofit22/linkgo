import type { ApprovalStatus } from "@/features/approvals/types";
import type { CampaignStatus } from "@/features/campaigns/types";

/** Link params for `#/metrics`; `approvalId` always comes with its campaign. */
export type MetricsRouteParams =
  | { campaignId?: number | undefined; approvalId?: undefined }
  | { campaignId: number; approvalId: number };
import type { DraftVariantStatus } from "@/features/drafts/types";

export type MemorySignal = "winner" | "underperformer" | "insight" | "avoid";

export type CampaignMemoryStatus = "active" | "archived";

export type MetricCollectionSource = "manual" | "linkedin_social_metadata";

export type MetricRefreshJobStatus =
  | "active"
  | "paused"
  | "unavailable"
  | "failed";

export type MetricRefreshEventType =
  | "refresh_started"
  | "refresh_completed"
  | "refresh_retry_scheduled"
  | "refresh_unavailable"
  | "refresh_failed"
  | "refresh_blocked"
  | "worker_started"
  | "worker_stopped"
  | "tick_started"
  | "tick_completed"
  | "tick_failed";

export type MetricRefreshEventSeverity = "info" | "warning" | "error";

export type LearningEventType =
  | "metric_recorded"
  | "memory_created"
  | "memory_archived"
  | "memory_restored";

export interface PostMetric {
  id: number;
  campaign_id: number;
  approval_id: number;
  publish_attempt_id: number | null;
  platform: "linkedin";
  measured_at: string;
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  profile_visits: number;
  link_clicks: number;
  ctr: number | null;
  notes: string;
  collection_source: MetricCollectionSource;
  raw_payload_json: string;
  created_at: string;
  updated_at: string;
}

export interface MetricVariantSnapshot {
  id: number;
  variant_number: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
  status: DraftVariantStatus;
}

export interface MetricDraftSnapshot {
  id: number;
  angle: string;
  notes: string;
}

export interface MetricSourceSnapshot {
  author_name: string;
  author_profile_url: string;
  content: string;
  url: string;
}

export interface MetricPublishSnapshot {
  id: number;
  external_post_url: string;
  platform_post_id: string;
  created_at: string;
}

export interface MetricApprovalSnapshot {
  id: number;
  status: ApprovalStatus;
}

export interface MetricCampaignSnapshot {
  id: number;
  name: string;
  status: CampaignStatus;
}

export interface MetricDerivedValues {
  engagementCount: number;
  engagementRate: number | null;
  displayCtr: number | null;
}

export type PostMetricWithDetails = PostMetric &
  MetricDerivedValues & {
    campaign: MetricCampaignSnapshot;
    approval: MetricApprovalSnapshot;
    draft: MetricDraftSnapshot;
    variant: MetricVariantSnapshot;
    source: MetricSourceSnapshot;
    latestPublishAttempt: MetricPublishSnapshot | null;
  };

export interface MetricEligibleApproval {
  campaign: MetricCampaignSnapshot;
  approval: MetricApprovalSnapshot;
  draft: MetricDraftSnapshot;
  variant: MetricVariantSnapshot;
  source: MetricSourceSnapshot;
  latestPublishAttempt: MetricPublishSnapshot;
}

/** A posted LinkedIn post that has no results recorded yet. */
export interface PostMissingResults {
  approvalId: number;
  campaignId: number;
  campaignName: string;
  /** The post's hook, or "Untitled post". */
  postTitle: string;
  /** ISO 8601 UTC time of the latest successful publish attempt. */
  publishedAt: string;
}

/** The newest posts missing results (capped) plus the uncapped total. */
export interface PostsMissingResultsPage {
  items: PostMissingResults[];
  totalCount: number;
}

/**
 * Hours after a post goes out before Linkgo asks "How did it do?". Earlier
 * numbers are mostly noise, so the post is not listed as missing results yet.
 */
export const RESULTS_PROMPT_DELAY_HOURS = 48;

export interface PostsMissingResultsInput {
  signal?: AbortSignal;
  /** Clock for the prompt delay; defaults to the current time. */
  now?: Date;
}

/** What a result pattern compares posts by. */
export type ResultPatternDimension =
  | "opening"
  | "format"
  | "weekday"
  | "timeOfDay";

/** One bucket of posts, e.g. "Opens with a question". */
export interface ResultPatternGroup {
  key: string;
  label: string;
  postCount: number;
  /** Average reactions + comments + reposts per post. */
  averageEngagement: number;
}

/**
 * - `thin`: not enough data to say anything (`few-posts`: under the minimum
 *   measured posts; `one-kind`: fewer than two groups have enough posts).
 * - `no-difference`: groups exist but none clearly did better.
 * - `found`: `best` beat `runnerUp` by at least the minimum lift.
 */
export type ResultPattern =
  | {
      kind: "thin";
      dimension: ResultPatternDimension;
      sampleSize: number;
      neededPosts: number;
      reason: "few-posts" | "one-kind";
    }
  | {
      kind: "no-difference";
      dimension: ResultPatternDimension;
      sampleSize: number;
      groups: ResultPatternGroup[];
    }
  | {
      kind: "found";
      dimension: ResultPatternDimension;
      sampleSize: number;
      best: ResultPatternGroup;
      runnerUp: ResultPatternGroup;
      groups: ResultPatternGroup[];
    };

export interface ResultPatternsReport {
  /** Measured posts considered (latest result per post). */
  sampleSize: number;
  patterns: ResultPattern[];
}

export interface CampaignMemory {
  id: number;
  campaign_id: number;
  post_metric_id: number | null;
  signal: MemorySignal;
  summary: string;
  evidence: string;
  confidence: number;
  status: CampaignMemoryStatus;
  created_at: string;
  updated_at: string;
}

export interface LearningEvent {
  id: number;
  campaign_id: number;
  post_metric_id: number | null;
  campaign_memory_id: number | null;
  event_type: LearningEventType;
  summary: string;
  created_at: string;
}

export interface RecordPostMetricInput {
  campaignId: number;
  approvalId: number;
  publishAttemptId?: number;
  measuredAt: string;
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  profileVisits: number;
  linkClicks: number;
  ctr?: number | null;
  notes?: string;
}

export interface CreateCampaignMemoryInput {
  campaignId: number;
  postMetricId?: number;
  signal: MemorySignal;
  summary: string;
  evidence?: string;
  confidence?: number;
}

export interface SetCampaignMemoryStatusInput {
  id: number;
  status: CampaignMemoryStatus;
}

export interface MetricRefreshSettings {
  id: 1;
  enabled: number;
  poll_interval_minutes: number;
  max_jobs_per_tick: number;
  refresh_interval_hours: number;
  retry_backoff_minutes: number;
  updated_at: string;
}

export interface MetricRefreshJob {
  id: number;
  campaign_id: number;
  approval_id: number;
  publish_attempt_id: number | null;
  platform: "linkedin";
  target_urn: string;
  status: MetricRefreshJobStatus;
  next_refresh_at: string;
  last_refreshed_at: string | null;
  last_attempted_at: string | null;
  attempt_count: number;
  max_attempts: number;
  failure_count: number;
  last_error: string;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricRefreshEvent {
  id: number;
  campaign_id: number | null;
  approval_id: number | null;
  metric_refresh_job_id: number | null;
  post_metric_id: number | null;
  event_type: MetricRefreshEventType;
  severity: MetricRefreshEventSeverity;
  summary: string;
  metadata_json: string;
  created_at: string;
}

export interface NativeMetricRefreshSettings {
  enabled: boolean;
  pollIntervalMinutes: number;
  maxJobsPerTick: number;
  refreshIntervalHours: number;
  retryBackoffMinutes: number;
  updatedAt: string;
}

export interface NativeMetricRefreshStatus {
  enabled: boolean;
  running: boolean;
  runnerId: string | null;
  settings: NativeMetricRefreshSettings;
}

export interface NativeMetricRefreshTickResult {
  claimed: number;
  refreshed: number;
  retryScheduled: number;
  unavailable: number;
  failed: number;
  blocked: number;
  seeded: number;
}

export interface MetricRefreshDashboardSummary {
  totalJobs: number;
  activeJobs: number;
  dueJobs: number;
  unavailableJobs: number;
  failedJobs: number;
  apiSnapshots: number;
}

export interface MetricRefreshDashboard {
  settings: MetricRefreshSettings | null;
  jobs: MetricRefreshJob[];
  events: MetricRefreshEvent[];
  summary: MetricRefreshDashboardSummary;
}
