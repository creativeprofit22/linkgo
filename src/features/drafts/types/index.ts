import type { CandidateWithTarget } from "@/features/candidate-queue/types";

export type DraftStatus =
  | "drafting"
  | "needs_revision"
  | "ready_for_review"
  | "archived";

export type DraftVariantStatus = "draft" | "selected" | "rejected";

export type DraftAuditSeverity = "pass" | "warning" | "block";

export interface Draft {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  angle: string;
  notes: string;
  status: DraftStatus;
  created_at: string;
  updated_at: string;
}

export interface DraftVariant {
  id: number;
  draft_id: number;
  variant_number: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
  status: DraftVariantStatus;
  created_at: string;
  updated_at: string;
}

export interface DraftAuditFinding {
  id?: number;
  draft_variant_id?: number;
  rule_key: string;
  severity: DraftAuditSeverity;
  message: string;
  created_at?: string;
}

export type DraftVariantWithAudits = DraftVariant & {
  audits: DraftAuditFinding[];
  auditSeverity: DraftAuditSeverity;
};

export type DraftWithDetails = Draft & {
  campaign_name: string;
  candidate: CandidateWithTarget;
  variants: DraftVariantWithAudits[];
};

export interface DraftVariantInput {
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string;
}

export interface CreateDraftInput {
  candidateId: number;
  angle?: string;
  notes?: string;
  variants: DraftVariantInput[];
}

export interface UpdateDraftInput {
  id: number;
  angle?: string;
  notes?: string;
  status?: DraftStatus;
}

export interface UpdateDraftVariantInput {
  id: number;
  hook?: string;
  body?: string;
  cta?: string;
  hashtags?: string;
}

export interface SetDraftVariantStatusInput {
  id: number;
  status: DraftVariantStatus;
}
