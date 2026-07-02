import type { CampaignStatus } from "@/features/campaigns/types";
import type { DraftAuditSeverity } from "@/features/drafts/types";

export type ApprovalStatus =
  | "needs_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "scheduled"
  | "published"
  | "cancelled";

export type ScheduleJobStatus =
  | "scheduled"
  | "cancelled"
  | "completed"
  | "failed";

export type PublishAttemptStatus = "succeeded" | "failed";

export interface Approval {
  id: number;
  campaign_id: number;
  draft_id: number;
  draft_variant_id: number;
  status: ApprovalStatus;
  reviewer_notes: string;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleJob {
  id: number;
  approval_id: number;
  platform: "linkedin";
  scheduled_for: string;
  timezone: string;
  status: ScheduleJobStatus;
  idempotency_key: string;
  attempt_count?: number;
  max_attempts?: number;
  next_attempt_at?: string | null;
  last_attempted_at?: string | null;
  last_error?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishAttempt {
  id: number;
  approval_id: number;
  schedule_job_id: number | null;
  platform: "linkedin";
  status: PublishAttemptStatus;
  external_post_url: string;
  platform_post_id: string;
  error_message: string;
  created_at: string;
}

export interface ApprovalVariantSnapshot {
  id: number;
  variant_number: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
  status: "draft" | "selected" | "rejected";
  auditSeverity: DraftAuditSeverity;
}

export interface ApprovalDraftSnapshot {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  angle: string;
  notes: string;
  status: "drafting" | "needs_revision" | "ready_for_review" | "archived";
  campaign_name: string;
  campaign_status: CampaignStatus;
  candidate_source_keyword: string;
  target_url: string;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
}

export type ApprovalWithDetails = Approval & {
  scheduleJob: ScheduleJob | null;
  publishAttempts: PublishAttempt[];
  draft: ApprovalDraftSnapshot;
  variant: ApprovalVariantSnapshot;
};

export type ApprovalEligibleDraft = ApprovalDraftSnapshot & {
  variant: ApprovalVariantSnapshot;
};

export interface CreateApprovalInput {
  draftId: number;
  reviewerNotes?: string;
}

export interface SetApprovalStatusInput {
  id: number;
  status: ApprovalStatus;
  reviewerNotes?: string;
}

export interface ScheduleApprovalInput {
  approvalId: number;
  scheduledFor: string;
  timezone?: string;
}

export interface CancelScheduleInput {
  id: number;
}

export interface AssertApprovalCanPublishViaLinkedInInput {
  approvalId: number;
  scheduleJobId?: number;
}

export interface RecordPublishAttemptInput {
  approvalId: number;
  scheduleJobId?: number;
  status: PublishAttemptStatus;
  externalPostUrl?: string;
  platformPostId?: string;
  errorMessage?: string;
}
