import type { CampaignStatus } from "@/features/campaigns/types";
import type {
  SourceImportBatchStatus,
  SourceImportSourceType,
} from "@/features/source-imports/types";
import type { WorkflowRunStatus, WorkflowStepKey } from "@/workflows/types";

export interface AutopilotPlannerSettings {
  id: 1;
  enabled: number;
  poll_interval_minutes: number;
  max_batches_per_tick: number;
  updated_at: string;
}

export interface AutopilotPlannerSettingsPayload {
  enabled: boolean;
  pollIntervalMinutes: number;
  maxBatchesPerTick: number;
  updatedAt: string;
}

export interface AutopilotPlannerStatusPayload {
  enabled: boolean;
  running: boolean;
  runnerId: string | null;
  settings: AutopilotPlannerSettingsPayload;
}

export interface AutopilotPlannerTickResult {
  claimed: number;
  planned: number;
  skipped: number;
  failed: number;
  blocked: number;
}

export type AutopilotPlanStatus = "planned" | "skipped";

export interface AutopilotPlan {
  id: number;
  campaign_id: number;
  source_import_batch_id: number;
  source_type: SourceImportSourceType;
  status: AutopilotPlanStatus;
  campaign_backlog_item_id: number | null;
  workflow_run_id: number | null;
  candidate_count: number;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface AutopilotPlanDashboardItem extends AutopilotPlan {
  campaign_name: string;
  campaign_status: CampaignStatus;
  source_batch_status: SourceImportBatchStatus | null;
  source_total_count: number | null;
  source_accepted_count: number | null;
  current_candidate_count: number;
  backlog_title: string | null;
  backlog_status: string | null;
  backlog_work_type: string | null;
  workflow_title: string | null;
  workflow_status: WorkflowRunStatus | null;
  workflow_current_step_key: WorkflowStepKey | null;
}

export type AutopilotPlannerEventType =
  | "planner_started"
  | "planner_stopped"
  | "tick_started"
  | "tick_completed"
  | "tick_failed"
  | "batch_planned"
  | "batch_skipped"
  | "batch_failed"
  | "planner_blocked";

export type AutopilotPlannerEventSeverity = "info" | "warning" | "error";

export interface AutopilotPlannerEvent {
  id: number;
  campaign_id: number | null;
  source_import_batch_id: number | null;
  autopilot_plan_id: number | null;
  event_type: AutopilotPlannerEventType;
  severity: AutopilotPlannerEventSeverity;
  summary: string;
  metadata_json: string;
  created_at: string;
  campaign_name: string | null;
  campaign_status: CampaignStatus | null;
}

export interface AutopilotPlannerDashboardSummary {
  eligibleBatches: number;
  plannedBatches: number;
  skippedBatches: number;
  recentFailures: number;
}

export interface AutopilotPlannerDashboard {
  summary: AutopilotPlannerDashboardSummary;
  recentPlans: AutopilotPlanDashboardItem[];
  recentEvents: AutopilotPlannerEvent[];
  globalKillSwitchEnabled: boolean;
  killSwitchReason: string;
}
