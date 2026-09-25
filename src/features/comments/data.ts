import { invokeCommand } from "@/lib/tauri";
import { z } from "zod";
import {
  commentEligibleCandidateListSchema,
  commentThreadsSnapshotSchema,
} from "@/features/comments/record-schemas";
import {
  commentMutationResultSchema,
  commentPublishPreflightSchema,
  createCommentThreadSchema,
  recordCommentAttemptSchema,
  setCommentThreadStatusSchema,
  setCommentVariantStatusSchema,
  updateCommentThreadSchema,
  updateCommentVariantSchema,
} from "@/features/comments/schemas";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { CandidateStatus } from "@/features/candidate-queue/types";
import type {
  CommentAttempt,
  CommentAuditFinding,
  CommentAuditSeverity,
  CommentEligibleCandidate,
  CommentThread,
  CommentThreadListPage,
  CommentThreadStatus,
  CommentThreadWithDetails,
  CommentVariant,
  CommentVariantStatus,
  CommentVariantWithAudits,
  CreateCommentThreadInput,
  RecordCommentAttemptInput,
  SetCommentThreadStatusInput,
  SetCommentVariantStatusInput,
  UpdateCommentThreadInput,
  UpdateCommentVariantInput,
} from "@/features/comments/types";

interface CommentThreadRow {
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
  campaign_name: string;
  campaign_status: CampaignStatus;
  candidate_status: CandidateStatus;
  candidate_source_keyword: string;
  candidate_relevance_score: number | null;
  target_post_id: number;
  target_url: string;
  target_platform_resource_urn: string;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  target_posted_at: string | null;
}

interface CommentVariantRow {
  id: number;
  comment_thread_id: number;
  variant_number: number;
  body: string;
  status: CommentVariantStatus;
  created_at: string;
  updated_at: string;
}

interface CommentAuditRow {
  id: number;
  comment_variant_id: number;
  rule_key: string;
  severity: CommentAuditSeverity;
  message: string;
  created_at: string;
}

interface CommentCandidateRow {
  candidate_id: number;
  campaign_id: number;
  campaign_name: string;
  campaign_status: CampaignStatus;
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

const SEVERITY_RANK: Record<CommentAuditSeverity, number> = {
  block: 0,
  warning: 1,
  pass: 2,
};

interface CommentPublishPreflightInput {
  commentThreadId: number;
  commentary: string;
  targetUrn: string;
  idempotencyKey: string;
}

const optionalCampaignIdSchema = z.number().int().positive().optional();

function campaignInput(campaignId?: number): { campaignId?: number } {
  const parsed = optionalCampaignIdSchema.parse(campaignId);
  return parsed === undefined ? {} : { campaignId: parsed };
}

/** Runs a native comment mutation and returns the affected row id. */
async function invokeCommentMutation(
  command: string,
  input: unknown,
): Promise<number> {
  return commentMutationResultSchema.parse(
    await invokeCommand(command, { input }),
  ).id;
}

function mapThread(row: CommentThreadRow): CommentThread {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    candidate_post_id: row.candidate_post_id,
    status: row.status,
    operator_notes: row.operator_notes,
    reviewer_notes: row.reviewer_notes,
    approved_at: row.approved_at,
    rejected_at: row.rejected_at,
    posted_at: row.posted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapVariant(row: CommentVariantRow): CommentVariant {
  return {
    id: row.id,
    comment_thread_id: row.comment_thread_id,
    variant_number: row.variant_number,
    body: row.body,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAudit(row: CommentAuditRow): CommentAuditFinding {
  return {
    id: row.id,
    comment_variant_id: row.comment_variant_id,
    rule_key: row.rule_key,
    severity: row.severity,
    message: row.message,
    created_at: row.created_at,
  };
}

function mapAttempt(row: CommentAttempt): CommentAttempt {
  return row;
}

function mapEligibleCandidate(
  row: CommentCandidateRow,
): CommentEligibleCandidate {
  return {
    candidate_id: row.candidate_id,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    campaign_status: row.campaign_status,
    candidate_status: row.candidate_status,
    source_keyword: row.source_keyword,
    relevance_score: row.relevance_score,
    target_post_id: row.target_post_id,
    target_url: row.target_url,
    target_platform_resource_urn: row.target_platform_resource_urn,
    target_author_name: row.target_author_name,
    target_author_profile_url: row.target_author_profile_url,
    target_content: row.target_content,
    target_posted_at: row.target_posted_at,
  };
}

export function getCommentAuditSeverity(
  findings: CommentAuditFinding[],
): CommentAuditSeverity {
  if (findings.some((finding) => finding.severity === "block")) return "block";
  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }
  return "pass";
}

/**
 * Lists comment threads (open first, newest first; capped at 500) with their
 * variants, audits and attempts, read natively from one snapshot.
 */
export async function listCommentThreads(
  campaignId?: number,
): Promise<CommentThreadWithDetails[]> {
  return (await listCommentThreadPage(campaignId)).items;
}

/**
 * Same as `listCommentThreads`, plus `totalCount`: the uncapped number of
 * matching threads, so callers can tell when `items` was truncated.
 */
export async function listCommentThreadPage(
  campaignId?: number,
): Promise<CommentThreadListPage> {
  const snapshot = commentThreadsSnapshotSchema.parse(
    await invokeCommand("linkgo_comment_thread_list", {
      input: campaignInput(campaignId),
    }),
  );
  return {
    items: mapThreadSnapshot(snapshot),
    totalCount: Math.max(snapshot.totalCount, snapshot.threads.length),
  };
}

function mapThreadSnapshot(
  snapshot: z.infer<typeof commentThreadsSnapshotSchema>,
): CommentThreadWithDetails[] {
  const rows = snapshot.threads;
  if (rows.length === 0) return [];
  const variantRows = snapshot.variants;
  const auditRows = snapshot.audits;
  const attemptRows = snapshot.attempts;

  const auditsByVariantId = new Map<number, CommentAuditFinding[]>();
  for (const auditRow of auditRows) {
    const audits = auditsByVariantId.get(auditRow.comment_variant_id) ?? [];
    audits.push(mapAudit(auditRow));
    auditsByVariantId.set(auditRow.comment_variant_id, audits);
  }
  for (const audits of auditsByVariantId.values()) {
    audits.sort(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        left.rule_key.localeCompare(right.rule_key),
    );
  }

  const variantsByThreadId = new Map<number, CommentVariantWithAudits[]>();
  for (const variantRow of variantRows) {
    const audits = auditsByVariantId.get(variantRow.id) ?? [];
    const variants = variantsByThreadId.get(variantRow.comment_thread_id) ?? [];
    variants.push({
      ...mapVariant(variantRow),
      audits,
      auditSeverity: getCommentAuditSeverity(audits),
    });
    variantsByThreadId.set(variantRow.comment_thread_id, variants);
  }

  const attemptsByThreadId = new Map<number, CommentAttempt[]>();
  for (const attemptRow of attemptRows) {
    const attempts = attemptsByThreadId.get(attemptRow.comment_thread_id) ?? [];
    attempts.push(mapAttempt(attemptRow));
    attemptsByThreadId.set(attemptRow.comment_thread_id, attempts);
  }

  return rows.map((row) => {
    const variants = variantsByThreadId.get(row.id) ?? [];
    const selectedVariant =
      variants.find((variant) => variant.status === "selected") ?? null;
    return {
      ...mapThread(row),
      campaign_name: row.campaign_name,
      campaign_status: row.campaign_status,
      target: {
        candidate_id: row.candidate_post_id,
        candidate_status: row.candidate_status,
        source_keyword: row.candidate_source_keyword,
        relevance_score: row.candidate_relevance_score,
        target_post_id: row.target_post_id,
        target_url: row.target_url,
        target_platform_resource_urn: row.target_platform_resource_urn,
        target_author_name: row.target_author_name,
        target_author_profile_url: row.target_author_profile_url,
        target_content: row.target_content,
        target_posted_at: row.target_posted_at,
      },
      variants,
      attempts: attemptsByThreadId.get(row.id) ?? [],
      selectedVariant,
      auditSeverity:
        selectedVariant?.auditSeverity ??
        getCommentAuditSeverity(variants.flatMap((variant) => variant.audits)),
    };
  });
}

/** Shortlisted/drafted candidates with no thread yet; capped at 200. */
export async function listCommentEligibleCandidates(
  campaignId?: number,
): Promise<CommentEligibleCandidate[]> {
  const rows = commentEligibleCandidateListSchema.parse(
    await invokeCommand("linkgo_comment_eligible_candidates", {
      input: campaignInput(campaignId),
    }),
  );
  return rows.map(mapEligibleCandidate);
}

/** Creates a thread and its variants; native computes and stores audits. */
export async function createCommentThread(
  input: CreateCommentThreadInput,
): Promise<number> {
  const parsed = createCommentThreadSchema.parse(input);
  return invokeCommentMutation("linkgo_comment_thread_create", parsed);
}

export async function updateCommentThread(
  input: UpdateCommentThreadInput,
): Promise<void> {
  const parsed = updateCommentThreadSchema.parse(input);
  await invokeCommentMutation("linkgo_comment_thread_update", parsed);
}

/** Edits a variant body; native re-audits it and requests changes if reviewing. */
export async function updateCommentVariant(
  input: UpdateCommentVariantInput,
): Promise<void> {
  const parsed = updateCommentVariantSchema.parse(input);
  await invokeCommentMutation("linkgo_comment_variant_update", parsed);
}

export async function setCommentVariantStatus(
  input: SetCommentVariantStatusInput,
): Promise<void> {
  const parsed = setCommentVariantStatusSchema.parse(input);
  await invokeCommentMutation("linkgo_comment_variant_set_status", parsed);
}

export async function setCommentThreadStatus(
  input: SetCommentThreadStatusInput,
): Promise<void> {
  const parsed = setCommentThreadStatusSchema.parse(input);
  await invokeCommentMutation("linkgo_comment_thread_set_status", parsed);
}

/**
 * Native publish gate. Rejects unless the thread is approved with one ready
 * selected variant matching `commentary`, the target URN and idempotency key
 * match, and no attempt already succeeded. Kill-switch and daily-limit
 * rejections durably record a blocked rate-limit event.
 */
export async function assertCommentCanPublishViaLinkedIn(
  input: CommentPublishPreflightInput,
): Promise<void> {
  const parsed = commentPublishPreflightSchema.parse(input);
  await invokeCommand<null>("linkgo_comment_assert_can_publish", {
    input: parsed,
  });
}

export async function recordCommentAttempt(
  input: RecordCommentAttemptInput,
): Promise<number> {
  const parsed = recordCommentAttemptSchema.parse(input);
  return invokeCommand<number>("linkgo_comment_record_attempt", {
    input: parsed,
  });
}
