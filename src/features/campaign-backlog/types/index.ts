import type { CampaignStatus } from "@/features/campaigns/types";

export const CAMPAIGN_BACKLOG_WORK_TYPES = [
  "research",
  "scoring",
  "drafting",
  "approval",
  "scheduling",
  "metrics",
  "retry",
  "other",
] as const;

export const CAMPAIGN_BACKLOG_OWNER_TYPES = ["operator", "linkgo"] as const;
export const CAMPAIGN_BACKLOG_STATUSES = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export const CAMPAIGN_BACKLOG_RECURRENCES = [
  "none",
  "daily",
  "weekly",
] as const;

export const CAMPAIGN_BACKLOG_CREATE_COMMAND = "linkgo_campaign_backlog_create";
export const CAMPAIGN_BACKLOG_UPDATE_COMMAND = "linkgo_campaign_backlog_update";
export const CAMPAIGN_BACKLOG_SET_STATUS_COMMAND =
  "linkgo_campaign_backlog_set_status";

export type CampaignBacklogWorkType =
  (typeof CAMPAIGN_BACKLOG_WORK_TYPES)[number];
export type CampaignBacklogOwnerType =
  (typeof CAMPAIGN_BACKLOG_OWNER_TYPES)[number];
export type CampaignBacklogStatus = (typeof CAMPAIGN_BACKLOG_STATUSES)[number];
export type CampaignBacklogRecurrence =
  (typeof CAMPAIGN_BACKLOG_RECURRENCES)[number];
export type CampaignBacklogView = "open" | "history";
export type CampaignBacklogOwnerFilter = "all" | CampaignBacklogOwnerType;

export const CAMPAIGN_BACKLOG_WORK_TYPE_LABELS: Record<
  CampaignBacklogWorkType,
  string
> = {
  research: "Research",
  scoring: "Scoring",
  drafting: "Drafting",
  approval: "Approval",
  scheduling: "Scheduling",
  metrics: "Metrics",
  retry: "Retry",
  other: "Other",
};

export const CAMPAIGN_BACKLOG_OWNER_LABELS: Record<
  CampaignBacklogOwnerType,
  string
> = {
  operator: "Operator",
  linkgo: "Linkgo",
};

export const CAMPAIGN_BACKLOG_STATUS_LABELS: Record<
  CampaignBacklogStatus,
  string
> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CAMPAIGN_BACKLOG_RECURRENCE_LABELS: Record<
  CampaignBacklogRecurrence,
  string
> = {
  none: "One-off",
  daily: "Daily",
  weekly: "Weekly",
};

export interface CampaignBacklogItem {
  id: number;
  campaign_id: number;
  recurrence_parent_id: number | null;
  work_type: CampaignBacklogWorkType;
  title: string;
  details: string;
  owner_type: CampaignBacklogOwnerType;
  status: CampaignBacklogStatus;
  due_at: string;
  recurrence: CampaignBacklogRecurrence;
  recurrence_timezone: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignBacklogItemDetail extends CampaignBacklogItem {
  campaign_name: string;
  campaign_status: CampaignStatus;
}

export interface CampaignBacklogSummary {
  dueNow: number;
  inProgress: number;
  blocked: number;
  linkgoOwned: number;
}

export interface CampaignBacklogDashboard {
  items: CampaignBacklogItemDetail[];
  summary: CampaignBacklogSummary;
  totalItems: number;
  asOf: string;
}

export interface CampaignBacklogFilters {
  campaignId: number | null;
  owner: CampaignBacklogOwnerFilter;
  view: CampaignBacklogView;
}

export interface CreateCampaignBacklogItemInput {
  campaignId: number;
  workType: CampaignBacklogWorkType;
  title: string;
  details?: string;
  ownerType: CampaignBacklogOwnerType;
  dueAt: string;
  recurrence: CampaignBacklogRecurrence;
  recurrenceTimeZone: string;
}

export interface UpdateCampaignBacklogItemInput {
  id: number;
  workType: CampaignBacklogWorkType;
  title: string;
  details?: string;
  ownerType: CampaignBacklogOwnerType;
  dueAt: string;
  recurrence: CampaignBacklogRecurrence;
  recurrenceTimeZone: string;
}

export interface SetCampaignBacklogItemStatusInput {
  id: number;
  status: CampaignBacklogStatus;
}

export interface CampaignBacklogMutationCommandResult {
  item: CampaignBacklogItemDetail;
}

export interface CampaignBacklogStatusMutationCommandResult extends CampaignBacklogMutationCommandResult {
  successor: CampaignBacklogItemDetail | null;
}

export interface CampaignBacklogStatusResult {
  item: CampaignBacklogItemDetail;
  successor: CampaignBacklogItemDetail | null;
}
