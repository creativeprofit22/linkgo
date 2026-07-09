import type {
  ApprovalStatus,
  PublishAttemptStatus,
  ScheduleJobStatus,
} from "@/features/approvals/types";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { DraftAuditSeverity } from "@/features/drafts/types";

export type ContentCalendarPurpose =
  | "reach"
  | "trust"
  | "proof"
  | "conversion"
  | "community";

export type ContentCalendarFormat =
  | "text"
  | "image"
  | "carousel"
  | "document"
  | "video"
  | "poll"
  | "event";

export type ContentCalendarSlotStatus = "planned" | "archived";

export interface ContentCalendarSlot {
  id: number;
  campaign_id: number;
  approval_id: number;
  purpose: ContentCalendarPurpose;
  slot_for: string;
  timezone: string;
  format: ContentCalendarFormat;
  angle: string;
  visual_direction: string;
  cta: string;
  notes: string;
  status: ContentCalendarSlotStatus;
  created_at: string;
  updated_at: string;
}

export interface ContentCalendarApprovalSnapshot {
  id: number;
  status: ApprovalStatus;
  reviewer_notes: string;
  approved_at: string | null;
  campaign_id: number;
  campaign_name: string;
  campaign_status: CampaignStatus;
}

export interface ContentCalendarDraftSnapshot {
  id: number;
  angle: string;
  notes: string;
  candidate_post_id: number;
  candidate_source_keyword: string;
  target_url: string;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
}

export interface ContentCalendarVariantSnapshot {
  id: number;
  variant_number: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
  auditSeverity: DraftAuditSeverity;
}

export interface ContentCalendarScheduleSnapshot {
  id: number;
  scheduled_for: string;
  timezone: string;
  status: ScheduleJobStatus;
  attempt_count: number;
  last_error: string;
  updated_at: string;
}

export interface ContentCalendarPublishSnapshot {
  id: number;
  status: PublishAttemptStatus;
  external_post_url: string;
  platform_post_id: string;
  error_message: string;
  created_at: string;
}

export type ContentCalendarSlotWithDetails = ContentCalendarSlot & {
  approval: ContentCalendarApprovalSnapshot;
  draft: ContentCalendarDraftSnapshot;
  variant: ContentCalendarVariantSnapshot;
  scheduleJob: ContentCalendarScheduleSnapshot | null;
  publishAttempt: ContentCalendarPublishSnapshot | null;
};

export type ContentCalendarEligibleApproval =
  ContentCalendarApprovalSnapshot & {
    draft: ContentCalendarDraftSnapshot;
    variant: ContentCalendarVariantSnapshot;
    scheduleJob: ContentCalendarScheduleSnapshot | null;
  };

export interface ContentCalendarSummary {
  planned: number;
  scheduled: number;
  published: number;
  archived: number;
}

export interface CreateContentCalendarSlotInput {
  approvalId: number;
  purpose: ContentCalendarPurpose;
  slotFor: string;
  timezone?: string;
  format: ContentCalendarFormat;
  angle: string;
  visualDirection: string;
  cta: string;
  notes?: string;
}

export interface UpdateContentCalendarSlotInput {
  id: number;
  purpose: ContentCalendarPurpose;
  slotFor: string;
  timezone?: string;
  format: ContentCalendarFormat;
  angle: string;
  visualDirection: string;
  cta: string;
  notes?: string;
}

export interface ArchiveContentCalendarSlotInput {
  id: number;
}

export interface ScheduleContentCalendarSlotInput {
  id: number;
}
