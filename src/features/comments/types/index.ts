import type { CampaignStatus } from "@/features/campaigns/types";
import type { CandidateStatus } from "@/features/candidate-queue/types";

export type CommentThreadStatus =
  | "drafting"
  | "needs_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "posted"
  | "cancelled";

export type CommentVariantStatus = "draft" | "selected" | "rejected";

export type CommentAuditSeverity = "pass" | "warning" | "block";

export type CommentAttemptStatus = "succeeded" | "failed";

export interface CommentThread {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  status: CommentThreadStatus;
  operator_notes: string;
  reviewer_notes: string;
  approved_at: string | null;
  rejected_at: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentVariant {
  id: number;
  comment_thread_id: number;
  variant_number: number;
  body: string;
  status: CommentVariantStatus;
  created_at: string;
  updated_at: string;
}

export interface CommentAuditFinding {
  id?: number;
  comment_variant_id?: number;
  rule_key: string;
  severity: CommentAuditSeverity;
  message: string;
  created_at?: string;
}

export interface CommentAttempt {
  id: number;
  comment_thread_id: number;
  platform: "linkedin";
  status: CommentAttemptStatus;
  external_comment_url: string;
  platform_comment_id: string;
  idempotency_key: string;
  error_message: string;
  created_at: string;
}

export type CommentVariantWithAudits = CommentVariant & {
  audits: CommentAuditFinding[];
  auditSeverity: CommentAuditSeverity;
};

export interface CommentTargetSnapshot {
  candidate_id: number;
  candidate_status: CandidateStatus;
  source_keyword: string;
  relevance_score: number | null;
  target_post_id: number;
  target_url: string;
  target_platform_resource_urn: string;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  target_posted_at: string | null;
}

export type CommentThreadWithDetails = CommentThread & {
  campaign_name: string;
  campaign_status: CampaignStatus;
  target: CommentTargetSnapshot;
  variants: CommentVariantWithAudits[];
  attempts: CommentAttempt[];
  selectedVariant: CommentVariantWithAudits | null;
  auditSeverity: CommentAuditSeverity;
};

export interface CommentEligibleCandidate extends CommentTargetSnapshot {
  campaign_id: number;
  campaign_name: string;
  campaign_status: CampaignStatus;
}

export interface CommentVariantInput {
  body: string;
}

export interface CreateCommentThreadInput {
  candidateId: number;
  operatorNotes?: string;
  variants: CommentVariantInput[];
}

export interface UpdateCommentThreadInput {
  id: number;
  operatorNotes?: string;
  reviewerNotes?: string;
}

export interface UpdateCommentVariantInput {
  id: number;
  body?: string;
}

export interface SetCommentVariantStatusInput {
  id: number;
  status: CommentVariantStatus;
}

export interface SetCommentThreadStatusInput {
  id: number;
  status: CommentThreadStatus;
  reviewerNotes?: string;
}

export interface RecordCommentAttemptInput {
  commentThreadId: number;
  status: CommentAttemptStatus;
  externalCommentUrl?: string;
  platformCommentId?: string;
  idempotencyKey?: string;
  errorMessage?: string;
}
