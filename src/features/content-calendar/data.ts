import { scheduleApproval } from "@/features/approvals/data";
import { invokeCommand } from "@/lib/tauri";
import { z } from "zod";
import {
  calendarEligibleApprovalsSchema,
  calendarScheduleTargetSchema,
  calendarSlotListSchema,
  type CalendarApprovalSnapshotRow,
  type CalendarDraftAuditRow,
  type CalendarSlotDetailRow,
} from "@/features/content-calendar/record-schemas";
import {
  archiveContentCalendarSlotSchema,
  createContentCalendarSlotSchema,
  scheduleContentCalendarSlotSchema,
  updateContentCalendarSlotSchema,
} from "@/features/content-calendar/schemas";
import type {
  ArchiveContentCalendarSlotInput,
  ContentCalendarApprovalSnapshot,
  ContentCalendarDraftSnapshot,
  ContentCalendarEligibleApproval,
  ContentCalendarPublishSnapshot,
  ContentCalendarScheduleSnapshot,
  ContentCalendarSlot,
  ContentCalendarSlotWithDetails,
  ContentCalendarVariantSnapshot,
  CreateContentCalendarSlotInput,
  ScheduleContentCalendarSlotInput,
  UpdateContentCalendarSlotInput,
} from "@/features/content-calendar/types";
import { getAuditSeverity, mapDraftAudit } from "@/features/drafts/data";
import type {
  DraftAuditFinding,
  DraftAuditSeverity,
} from "@/features/drafts/types";
type ContentCalendarSlotDetailRow = CalendarSlotDetailRow;
type ContentCalendarEligibleApprovalRow = CalendarApprovalSnapshotRow;

const optionalCampaignIdSchema = z.number().int().positive().optional();
const slotIdResultSchema = z.number().int().positive();

function campaignInput(campaignId?: number): { campaignId?: number } {
  const parsed = optionalCampaignIdSchema.parse(campaignId);
  return parsed === undefined ? {} : { campaignId: parsed };
}

function mapSlot(row: ContentCalendarSlotDetailRow): ContentCalendarSlot {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    approval_id: row.approval_id,
    purpose: row.purpose,
    slot_for: row.slot_for,
    timezone: row.timezone,
    format: row.format,
    angle: row.angle,
    visual_direction: row.visual_direction,
    cta: row.cta,
    notes: row.notes,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapApprovalSnapshot(
  row: ContentCalendarSlotDetailRow | ContentCalendarEligibleApprovalRow,
): ContentCalendarApprovalSnapshot {
  return {
    id: row.approval_id,
    status: row.approval_status,
    reviewer_notes: row.approval_reviewer_notes,
    approved_at: row.approval_approved_at,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    campaign_status: row.campaign_status,
  };
}

function mapDraftSnapshot(
  row: ContentCalendarSlotDetailRow | ContentCalendarEligibleApprovalRow,
): ContentCalendarDraftSnapshot {
  return {
    id: row.draft_id,
    angle: row.draft_angle,
    notes: row.draft_notes,
    candidate_post_id: row.candidate_post_id,
    candidate_source_keyword: row.candidate_source_keyword,
    target_url: row.target_url,
    target_author_name: row.target_author_name,
    target_author_profile_url: row.target_author_profile_url,
    target_content: row.target_content,
  };
}

function mapVariantSnapshot(
  row: ContentCalendarSlotDetailRow | ContentCalendarEligibleApprovalRow,
  auditSeverity: DraftAuditSeverity,
): ContentCalendarVariantSnapshot {
  return {
    id: row.variant_id,
    variant_number: row.variant_number,
    hook: row.variant_hook,
    body: row.variant_body,
    cta: row.variant_cta,
    hashtags: row.variant_hashtags,
    auditSeverity,
  };
}

function mapScheduleSnapshot(
  row: ContentCalendarSlotDetailRow | ContentCalendarEligibleApprovalRow,
): ContentCalendarScheduleSnapshot | null {
  if (row.schedule_job_id === null) return null;
  return {
    id: row.schedule_job_id,
    scheduled_for: row.schedule_scheduled_for ?? "",
    timezone: row.schedule_timezone ?? "local",
    status: row.schedule_status ?? "scheduled",
    attempt_count: row.schedule_attempt_count ?? 0,
    last_error: row.schedule_last_error ?? "",
    updated_at: row.schedule_updated_at ?? "",
  };
}

function mapPublishSnapshot(
  row: ContentCalendarSlotDetailRow,
): ContentCalendarPublishSnapshot | null {
  if (row.publish_attempt_id === null || row.publish_status === null)
    return null;
  return {
    id: row.publish_attempt_id,
    status: row.publish_status,
    external_post_url: row.publish_external_post_url ?? "",
    platform_post_id: row.publish_platform_post_id ?? "",
    error_message: row.publish_error_message ?? "",
    created_at: row.publish_created_at ?? "",
  };
}

function getAuditSeverityByVariantId(
  variantIds: number[],
  rows: CalendarDraftAuditRow[],
): Map<number, DraftAuditSeverity> {
  if (variantIds.length === 0) return new Map();

  const auditsByVariantId = new Map<number, DraftAuditFinding[]>();
  for (const row of rows) {
    const audits = auditsByVariantId.get(row.draft_variant_id) ?? [];
    audits.push(mapDraftAudit(row));
    auditsByVariantId.set(row.draft_variant_id, audits);
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
 * Lists calendar slots natively (`content_calendar.rs`): planned before
 * archived, then by slot time. One snapshot; capped at 500.
 */
export async function listContentCalendarSlots(
  campaignId?: number,
): Promise<ContentCalendarSlotWithDetails[]> {
  const { rows, audits } = calendarSlotListSchema.parse(
    await invokeCommand("linkgo_content_calendar_list", {
      input: campaignInput(campaignId),
    }),
  );
  if (rows.length === 0) return [];
  const severityByVariantId = getAuditSeverityByVariantId(
    rows.map((row) => row.variant_id),
    audits,
  );

  return rows.map((row) => ({
    ...mapSlot(row),
    approval: mapApprovalSnapshot(row),
    draft: mapDraftSnapshot(row),
    variant: mapVariantSnapshot(
      row,
      severityByVariantId.get(row.variant_id) ?? "pass",
    ),
    scheduleJob: mapScheduleSnapshot(row),
    publishAttempt: mapPublishSnapshot(row),
  }));
}

/** Approved/scheduled/published approvals with no slot yet; capped at 200. */
export async function listContentCalendarEligibleApprovals(
  campaignId?: number,
): Promise<ContentCalendarEligibleApproval[]> {
  const { rows, audits } = calendarEligibleApprovalsSchema.parse(
    await invokeCommand("linkgo_content_calendar_eligible_approvals", {
      input: campaignInput(campaignId),
    }),
  );
  if (rows.length === 0) return [];
  const severityByVariantId = getAuditSeverityByVariantId(
    rows.map((row) => row.variant_id),
    audits,
  );

  return rows.map((row) => ({
    ...mapApprovalSnapshot(row),
    draft: mapDraftSnapshot(row),
    variant: mapVariantSnapshot(
      row,
      severityByVariantId.get(row.variant_id) ?? "pass",
    ),
    scheduleJob: mapScheduleSnapshot(row),
  }));
}

/**
 * Creates a slot. Native checks the approval exists, its campaign is not
 * archived, it is approved/scheduled/published and has no slot, then inserts
 * in the same transaction.
 */
export async function createContentCalendarSlot(
  input: CreateContentCalendarSlotInput,
): Promise<number> {
  const parsed = createContentCalendarSlotSchema.parse(input);
  return slotIdResultSchema.parse(
    await invokeCommand("linkgo_content_calendar_create_slot", {
      input: parsed,
    }),
  );
}

/** Edits a planned slot; archived slots and campaigns are rejected natively. */
export async function updateContentCalendarSlot(
  input: UpdateContentCalendarSlotInput,
): Promise<void> {
  const parsed = updateContentCalendarSlotSchema.parse(input);
  await invokeCommand<null>("linkgo_content_calendar_update_slot", {
    input: parsed,
  });
}

export async function archiveContentCalendarSlot(
  input: ArchiveContentCalendarSlotInput,
): Promise<void> {
  const parsed = archiveContentCalendarSlotSchema.parse(input);
  await invokeCommand<null>("linkgo_content_calendar_archive_slot", {
    input: parsed,
  });
}

/**
 * Schedules a slot's approval. A native read-only preflight checks the slot
 * and approval state and returns the time to use; the approval scheduling
 * command then re-validates and writes in its own transaction.
 */
export async function scheduleContentCalendarSlot(
  input: ScheduleContentCalendarSlotInput,
): Promise<void> {
  const parsed = scheduleContentCalendarSlotSchema.parse(input);
  const target = calendarScheduleTargetSchema.parse(
    await invokeCommand("linkgo_content_calendar_schedule_preflight", {
      input: parsed,
    }),
  );
  await scheduleApproval(target);
}
