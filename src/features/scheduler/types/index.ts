import type {
  ApprovalWithDetails,
  PublishAttempt,
  ScheduleJob,
  ScheduleJobStatus,
} from "@/features/approvals/types";

/** The next post due to go out, named in plain words. */
export interface NextScheduledPost {
  approvalId: number;
  campaignId: number;
  campaignName: string;
  /** The post's hook, or "Untitled post". */
  postTitle: string;
  scheduledFor: string;
  timezone: string;
}

/** Optional preloaded approvals so callers can share one read. */
export interface NextScheduledPostInput {
  approvals?: readonly ApprovalWithDetails[];
  signal?: AbortSignal;
}

export interface SchedulerSettings {
  id: 1;
  enabled: number;
  poll_interval_seconds: number;
  max_jobs_per_tick: number;
  retry_backoff_minutes: number;
  updated_at: string;
}

export interface SchedulerSettingsPayload {
  enabled: boolean;
  pollIntervalSeconds: number;
  maxJobsPerTick: number;
  retryBackoffMinutes: number;
  updatedAt: string;
}

export interface SchedulerStatusPayload {
  enabled: boolean;
  running: boolean;
  runnerId: string | null;
  settings: SchedulerSettingsPayload;
}

export interface SchedulerTickResult {
  claimed: number;
  published: number;
  retryScheduled: number;
  failed: number;
  blocked: number;
}

export type SchedulerEventType =
  | "scheduler_started"
  | "scheduler_stopped"
  | "tick_started"
  | "tick_completed"
  | "job_claimed"
  | "job_blocked"
  | "job_published"
  | "job_retry_scheduled"
  | "job_failed";

export type SchedulerEventSeverity = "info" | "warning" | "error";

export interface SchedulerEvent {
  id: number;
  campaign_id: number | null;
  approval_id: number | null;
  schedule_job_id: number | null;
  event_type: SchedulerEventType;
  severity: SchedulerEventSeverity;
  summary: string;
  metadata_json: string;
  created_at: string;
  campaign_name?: string | null;
}

export type DueScheduleCardItem = ScheduleJob & {
  campaign_id: number;
  campaign_name: string;
  approval_status: string;
  campaign_status: string;
  variant_hook: string;
};

export type SchedulerPublishAttempt = PublishAttempt & {
  campaign_id: number | null;
  campaign_name: string | null;
  /** The approved post's opening line; empty when the variant is gone. */
  variant_hook: string;
  /** Live job/approval/campaign status (null when the row is gone), not attempt-time history. */
  schedule_job_status: ScheduleJobStatus | null;
  approval_status: string | null;
  campaign_status: string | null;
};

export interface SchedulerDashboardSummary {
  pendingJobs: number;
  dueJobs: number;
  failedJobs: number;
  recentAttempts: number;
}

export interface SchedulerDashboard {
  settings: SchedulerSettings;
  summary: SchedulerDashboardSummary;
  dueJobs: DueScheduleCardItem[];
  recentEvents: SchedulerEvent[];
  recentAttempts: SchedulerPublishAttempt[];
  globalKillSwitchEnabled: boolean;
  killSwitchReason: string;
}
