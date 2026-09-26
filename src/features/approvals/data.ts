import { invokeCommand } from "@/lib/tauri";
import { z } from "zod";
import {
  assertApprovalCanPublishViaLinkedInSchema,
  cancelScheduleSchema,
  createApprovalSchema,
  recordPublishAttemptSchema,
  scheduleApprovalSchema,
  setApprovalStatusSchema,
} from "@/features/approvals/schemas";
import {
  approvalListSnapshotSchema,
  eligibleDraftsSnapshotSchema,
  type ApprovalDetailRow,
  type DraftAuditRecord,
  type DraftSnapshotRow,
} from "@/features/approvals/record-schemas";
import type {
  Approval,
  ApprovalDraftSnapshot,
  ApprovalEligibleDraft,
  ApprovalEligibleDraftPage,
  ApprovalListPage,
  ApprovalVariantSnapshot,
  ApprovalWithDetails,
  AssertApprovalCanPublishViaLinkedInInput,
  CancelScheduleInput,
  CreateApprovalInput,
  PublishAttempt,
  RecordPublishAttemptInput,
  ScheduleApprovalInput,
  ScheduleJob,
  SetApprovalStatusInput,
} from "@/features/approvals/types";
import { getAuditSeverity, mapDraftAudit } from "@/features/drafts/data";
import type {
  DraftAuditFinding,
  DraftAuditSeverity,
} from "@/features/drafts/types";

const approvalIdSchema = z.number().int().positive();
const optionalCampaignIdSchema = z.number().int().positive().optional();

function mapApproval(row: ApprovalDetailRow): Approval {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    draft_id: row.draft_id,
    draft_variant_id: row.draft_variant_id,
    status:
      ["approved", "scheduled"].includes(row.status) &&
      (row.reviewed_content_revision !== row.current_content_revision ||
        row.readiness !== 1)
        ? "changes_requested"
        : row.status,
    reviewed_content_revision: row.reviewed_content_revision,
    reviewer_notes: row.reviewer_notes,
    approved_at: row.approved_at,
    rejected_at: row.rejected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDraftSnapshot(row: DraftSnapshotRow): ApprovalDraftSnapshot {
  return {
    id: row.draft_id,
    campaign_id: row.campaign_id,
    candidate_post_id: row.draft_candidate_post_id,
    angle: row.draft_angle,
    notes: row.draft_notes,
    status: row.draft_status,
    campaign_name: row.campaign_name,
    campaign_status: row.campaign_status,
    candidate_source_keyword: row.candidate_source_keyword,
    target_url: row.target_url,
    target_author_name: row.target_author_name,
    target_author_profile_url: row.target_author_profile_url,
    target_content: row.target_content,
  };
}

function mapVariantSnapshot(
  row: DraftSnapshotRow,
  auditSeverity: DraftAuditSeverity,
): ApprovalVariantSnapshot {
  return {
    id: row.draft_variant_id,
    variant_number: row.variant_number,
    hook: row.variant_hook,
    body: row.variant_body,
    cta: row.variant_cta,
    hashtags: row.variant_hashtags,
    status: row.variant_status,
    auditSeverity,
  };
}

function getAuditSeverityByVariantId(
  variantIds: number[],
  audits: DraftAuditRecord[],
): Map<number, DraftAuditSeverity> {
  const auditsByVariantId = new Map<number, DraftAuditFinding[]>();
  for (const row of audits) {
    const list = auditsByVariantId.get(row.draft_variant_id) ?? [];
    list.push(mapDraftAudit(row));
    auditsByVariantId.set(row.draft_variant_id, list);
  }
  const severityByVariantId = new Map<number, DraftAuditSeverity>();
  for (const variantId of variantIds) {
    severityByVariantId.set(
      variantId,
      getAuditSeverity(auditsByVariantId.get(variantId) ?? []),
    );
  }
  return severityByVariantId;
}

/**
 * Lists approvals with their schedule, publish attempts, linked agent runs
 * and audit severity. Native (`approval_reads.rs`) reads every part from one
 * snapshot; the list is capped at 500 approvals.
 */
export async function listApprovals(
  campaignId?: number,
): Promise<ApprovalWithDetails[]> {
  return (await listApprovalPage(campaignId)).items;
}

/**
 * Same as `listApprovals`, plus `totalCount`: the uncapped number of matching
 * approvals, counted in the same native snapshot so the UI can flag truncation.
 */
export async function listApprovalPage(
  campaignId?: number,
): Promise<ApprovalListPage> {
  const parsedCampaignId = optionalCampaignIdSchema.parse(campaignId);
  const snapshot = approvalListSnapshotSchema.parse(
    await invokeCommand("linkgo_approval_list", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
  const { rows } = snapshot;
  const totalCount = Math.max(snapshot.totalCount, rows.length);
  if (rows.length === 0) return { items: [], totalCount };

  const scheduleByApprovalId = new Map<number, ScheduleJob>();
  for (const row of snapshot.scheduleJobs) {
    scheduleByApprovalId.set(row.approval_id, row);
  }
  const attemptsByApprovalId = new Map<number, PublishAttempt[]>();
  for (const row of snapshot.publishAttempts) {
    const attempts = attemptsByApprovalId.get(row.approval_id) ?? [];
    attempts.push(row);
    attemptsByApprovalId.set(row.approval_id, attempts);
  }
  const linkedAgentRunCountByApprovalId = new Map(
    snapshot.linkedAgentRunCounts.map((row) => [row.approval_id, row.count]),
  );
  const severityByVariantId = getAuditSeverityByVariantId(
    rows.map((row) => row.draft_variant_id),
    snapshot.audits,
  );

  const items = rows.map((row) => ({
    ...mapApproval(row),
    storedStatus: row.status,
    currentContentRevision: row.current_content_revision,
    readyForApproval: row.readiness === 1,
    contentChanged:
      row.reviewed_content_revision !== row.current_content_revision,
    linkedAgentRunCount: linkedAgentRunCountByApprovalId.get(row.id) ?? 0,
    scheduleJob: scheduleByApprovalId.get(row.id) ?? null,
    publishAttempts: attemptsByApprovalId.get(row.id) ?? [],
    draft: mapDraftSnapshot(row),
    variant: mapVariantSnapshot(
      row,
      severityByVariantId.get(row.draft_variant_id) ?? "pass",
    ),
  }));
  return { items, totalCount };
}

/**
 * Lists ready drafts that have no approval yet (not archived, one selected
 * variant, no blocking audit, ready at the current revision). Capped at 200.
 */
export async function listApprovalEligibleDrafts(
  campaignId?: number,
): Promise<ApprovalEligibleDraft[]> {
  return (await listApprovalEligibleDraftPage(campaignId)).items;
}

/**
 * Same as `listApprovalEligibleDrafts`, plus `totalCount`: the uncapped number
 * of eligible drafts, counted in the same native snapshot.
 */
export async function listApprovalEligibleDraftPage(
  campaignId?: number,
): Promise<ApprovalEligibleDraftPage> {
  const parsedCampaignId = optionalCampaignIdSchema.parse(campaignId);
  const snapshot = eligibleDraftsSnapshotSchema.parse(
    await invokeCommand("linkgo_approval_eligible_drafts", {
      input:
        parsedCampaignId === undefined ? {} : { campaignId: parsedCampaignId },
    }),
  );
  const totalCount = Math.max(snapshot.totalCount, snapshot.rows.length);
  if (snapshot.rows.length === 0) return { items: [], totalCount };
  const severityByVariantId = getAuditSeverityByVariantId(
    snapshot.rows.map((row) => row.draft_variant_id),
    snapshot.audits,
  );
  const items = snapshot.rows.map((row) => ({
    ...mapDraftSnapshot(row),
    variant: mapVariantSnapshot(
      row,
      severityByVariantId.get(row.draft_variant_id) ?? "pass",
    ),
  }));
  return { items, totalCount };
}

/**
 * Creates a `needs_review` approval for a ready draft. Eligibility, the
 * duplicate check and the insert settle natively in one transaction.
 */
export async function createApproval(
  input: CreateApprovalInput,
): Promise<number> {
  const parsed = createApprovalSchema.parse(input);
  return approvalIdSchema.parse(
    await invokeCommand<number>("linkgo_approval_create", { input: parsed }),
  );
}

/**
 * Moves an approval through the human review lifecycle. The transition,
 * current-revision readiness and every side effect (draft status, linked
 * agent-run rejection, audit and error queue) settle natively and atomically.
 */
export async function setApprovalStatus(
  input: SetApprovalStatusInput,
): Promise<void> {
  const parsed = setApprovalStatusSchema.parse(input);
  await invokeCommand("linkgo_approval_set_status", { input: parsed });
}

export async function scheduleApproval(
  input: ScheduleApprovalInput,
): Promise<number> {
  const parsed = scheduleApprovalSchema.parse(input);
  return invokeCommand<number>("linkgo_approval_schedule", { input: parsed });
}

export async function cancelSchedule(
  input: CancelScheduleInput,
): Promise<void> {
  const parsed = cancelScheduleSchema.parse(input);
  await invokeCommand("linkgo_approval_cancel_schedule", { input: parsed });
}

/**
 * Read-only publish preflight, run before any LinkedIn call. Native checks,
 * in order: kill switch, approval exists, campaign not archived, status is
 * approved or scheduled, no earlier success, ready at the reviewed revision,
 * and the current scheduled job. The actual publish re-checks natively.
 */
export async function assertApprovalCanPublishViaLinkedIn(
  input: AssertApprovalCanPublishViaLinkedInInput,
): Promise<void> {
  const parsed = assertApprovalCanPublishViaLinkedInSchema.parse(input);
  await invokeCommand("linkgo_approval_publish_preflight", {
    input: {
      approvalId: parsed.approvalId,
      ...(parsed.scheduleJobId === undefined
        ? {}
        : { scheduleJobId: parsed.scheduleJobId }),
    },
  });
}

export async function recordPublishAttempt(
  input: RecordPublishAttemptInput,
): Promise<number> {
  const parsed = recordPublishAttemptSchema.parse(input);
  return approvalIdSchema.parse(
    await invokeCommand<number>("linkgo_approval_record_publish_attempt", {
      input: parsed,
    }),
  );
}
