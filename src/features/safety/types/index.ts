export type SafetyAuditSubjectType =
  | "campaign"
  | "approval"
  | "schedule_job"
  | "publish_attempt"
  | "agent_run"
  | "workflow_run"
  | "error_queue_item"
  | "safety_settings";

export type SafetyAuditEventType =
  | "kill_switch_enabled"
  | "kill_switch_disabled"
  | "schedule_allowed"
  | "schedule_blocked"
  | "schedule_cancelled"
  | "publish_succeeded"
  | "publish_failed"
  | "approval_rejected"
  | "agent_run_started"
  | "agent_run_failed"
  | "error_item_created"
  | "error_item_updated";

export type SafetyAuditSeverity = "info" | "warning" | "block";

export type RateLimitAction =
  | "schedule_post"
  | "publish_post"
  | "comment"
  | "agent_run";

export type RateLimitDecision = "allowed" | "blocked";

export type ErrorQueueSourceType =
  | "approval"
  | "publish_attempt"
  | "schedule_job"
  | "agent_run"
  | "workflow_run"
  | "manual";

export type ErrorQueueSeverity = "warning" | "error" | "critical";

export type ErrorQueueStatus =
  | "open"
  | "in_progress"
  | "awaiting_review"
  | "resolved"
  | "failed";

export interface SafetySettings {
  id: 1;
  global_kill_switch: number;
  kill_switch_reason: string;
  updated_at: string;
}

export interface SafetyAuditEvent {
  id: number;
  campaign_id: number | null;
  subject_type: SafetyAuditSubjectType;
  subject_id: number | null;
  event_type: SafetyAuditEventType;
  severity: SafetyAuditSeverity;
  summary: string;
  metadata_json: string;
  created_at: string;
}

export interface RateLimitEvent {
  id: number;
  campaign_id: number;
  action: RateLimitAction;
  window_key: string;
  limit_value: number;
  current_count: number;
  decision: RateLimitDecision;
  summary: string;
  created_at: string;
}

export interface ErrorQueueItem {
  id: number;
  campaign_id: number | null;
  source_type: ErrorQueueSourceType;
  source_id: number | null;
  title: string;
  detail: string;
  severity: ErrorQueueSeverity;
  status: ErrorQueueStatus;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  campaign_status?: string | null;
}

export interface SafetyDashboardSummary {
  openErrors: number;
  blockedToday: number;
  allowedToday: number;
  auditEvents: number;
}

export interface SafetyDashboard {
  settings: SafetySettings;
  summary: SafetyDashboardSummary;
  errorQueueItems: ErrorQueueItem[];
  rateLimitEvents: RateLimitEvent[];
  auditEvents: SafetyAuditEvent[];
}

export interface SetGlobalKillSwitchInput {
  enabled: boolean;
  reason?: string;
}

export interface SetErrorQueueItemStatusInput {
  id: number;
  status: ErrorQueueStatus;
  resolutionNotes?: string;
}

export interface RecordSafetyAuditEventInput {
  campaignId?: number | null;
  subjectType: SafetyAuditSubjectType;
  subjectId?: number | null;
  eventType: SafetyAuditEventType;
  severity?: SafetyAuditSeverity;
  summary: string;
  metadata?: unknown;
}

export interface RecordRateLimitEventInput {
  campaignId: number;
  action: RateLimitAction;
  windowKey: string;
  limitValue: number;
  currentCount: number;
  decision: RateLimitDecision;
  summary: string;
}

export interface UpsertErrorQueueItemInput {
  campaignId?: number | null;
  sourceType: ErrorQueueSourceType;
  sourceId?: number | null;
  title: string;
  detail?: string;
  severity?: ErrorQueueSeverity;
}

export interface SafetyKillSwitchContext {
  campaignId?: number | null;
  subjectType: SafetyAuditSubjectType;
  subjectId?: number | null;
  summary: string;
}

export interface AssertSchedulePostLimitInput {
  campaignId: number;
  scheduledFor: string;
  approvalId?: number;
  limitValue?: number;
}

export interface AssertCommentLimitInput {
  campaignId: number;
  commentedAt?: string;
  commentThreadId?: number;
  limitValue?: number;
}

export interface SchedulePostLimitDecision {
  campaignId: number;
  windowKey: string;
  limitValue: number;
  currentCount: number;
  allowed: boolean;
  summary: string;
}

export type CommentLimitDecision = SchedulePostLimitDecision;
