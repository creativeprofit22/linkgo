import type { PublishAttempt, ScheduleJob } from "@/features/approvals/types";

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
