import { scheduleApproval } from "@/features/approvals/data";
import type {
  ApprovalStatus,
  ScheduleJobStatus,
} from "@/features/approvals/types";
import type { CampaignStatus } from "@/features/campaigns/types";
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
  ContentCalendarFormat,
  ContentCalendarPublishSnapshot,
  ContentCalendarPurpose,
  ContentCalendarScheduleSnapshot,
  ContentCalendarSlot,
  ContentCalendarSlotStatus,
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
import { getDb, type LinkgoDatabase } from "@/lib/db";

interface ContentCalendarSlotDetailRow {
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
  approval_status: ApprovalStatus;
  approval_reviewer_notes: string;
  approval_approved_at: string | null;
  campaign_name: string;
  campaign_status: CampaignStatus;
  draft_id: number;
  draft_angle: string;
  draft_notes: string;
  candidate_post_id: number;
  candidate_source_keyword: string;
  target_url: string;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  variant_id: number;
  variant_number: number;
  variant_hook: string;
  variant_body: string;
  variant_cta: string;
  variant_hashtags: string;
  schedule_job_id: number | null;
  schedule_scheduled_for: string | null;
  schedule_timezone: string | null;
  schedule_status: ScheduleJobStatus | null;
  schedule_attempt_count: number | null;
  schedule_last_error: string | null;
  schedule_updated_at: string | null;
  publish_attempt_id: number | null;
  publish_status: "succeeded" | "failed" | null;
  publish_external_post_url: string | null;
  publish_platform_post_id: string | null;
  publish_error_message: string | null;
  publish_created_at: string | null;
}

interface ContentCalendarEligibleApprovalRow extends Omit<
  ContentCalendarSlotDetailRow,
  | "id"
  | "purpose"
  | "slot_for"
  | "timezone"
  | "format"
  | "angle"
  | "visual_direction"
  | "cta"
  | "notes"
  | "status"
  | "created_at"
  | "updated_at"
  | "publish_attempt_id"
  | "publish_status"
  | "publish_external_post_url"
  | "publish_platform_post_id"
  | "publish_error_message"
  | "publish_created_at"
> {}

interface ContentCalendarValidationRow {
  id: number;
  approval_id: number;
  campaign_id: number;
  campaign_status: CampaignStatus;
  approval_status: ApprovalStatus;
  status: ContentCalendarSlotStatus;
  slot_for: string;
  timezone: string;
}

interface ApprovalValidationRow {
  id: number;
  campaign_id: number;
  campaign_status: CampaignStatus;
  approval_status: ApprovalStatus;
  slot_count: number;
}

interface DraftAuditRow {
  id: number;
  draft_variant_id: number;
  rule_key: string;
  severity: DraftAuditSeverity;
  message: string;
  created_at: string;
}

function getPlaceholders(ids: number[]): string {
  return ids.map((_, index) => `$${index + 1}`).join(", ");
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

async function getAuditSeverityByVariantId(
  db: LinkgoDatabase,
  variantIds: number[],
): Promise<Map<number, DraftAuditSeverity>> {
  if (variantIds.length === 0) return new Map();

  const rows = await db.select<DraftAuditRow[]>(
    `SELECT * FROM draft_audits
    WHERE draft_variant_id IN (${getPlaceholders(variantIds)})`,
    variantIds,
  );

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

export async function listContentCalendarSlots(
  campaignId?: number,
): Promise<ContentCalendarSlotWithDetails[]> {
  const db = await getDb();
  const values = campaignId === undefined ? [] : [campaignId];
  const campaignFilter =
    campaignId === undefined ? "" : "WHERE ccs.campaign_id = $1";

  const rows = await db.select<ContentCalendarSlotDetailRow[]>(
    `SELECT
      ccs.*,
      a.status AS approval_status,
      a.reviewer_notes AS approval_reviewer_notes,
      a.approved_at AS approval_approved_at,
      c.name AS campaign_name,
      c.status AS campaign_status,
      d.id AS draft_id,
      d.angle AS draft_angle,
      d.notes AS draft_notes,
      d.candidate_post_id,
      cp.source_keyword AS candidate_source_keyword,
      tp.url AS target_url,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      dv.id AS variant_id,
      dv.variant_number,
      dv.hook AS variant_hook,
      dv.body AS variant_body,
      dv.cta AS variant_cta,
      dv.hashtags AS variant_hashtags,
      sj.id AS schedule_job_id,
      sj.scheduled_for AS schedule_scheduled_for,
      sj.timezone AS schedule_timezone,
      sj.status AS schedule_status,
      sj.attempt_count AS schedule_attempt_count,
      sj.last_error AS schedule_last_error,
      sj.updated_at AS schedule_updated_at,
      pa.id AS publish_attempt_id,
      pa.status AS publish_status,
      pa.external_post_url AS publish_external_post_url,
      pa.platform_post_id AS publish_platform_post_id,
      pa.error_message AS publish_error_message,
      pa.created_at AS publish_created_at
    FROM content_calendar_slots ccs
    INNER JOIN campaigns c ON c.id = ccs.campaign_id
    INNER JOIN approvals a ON a.id = ccs.approval_id
    INNER JOIN drafts d ON d.id = a.draft_id
    INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    LEFT JOIN schedule_jobs sj ON sj.id = (
      SELECT latest_sj.id FROM schedule_jobs latest_sj
      WHERE latest_sj.approval_id = a.id
      ORDER BY datetime(latest_sj.updated_at) DESC, latest_sj.id DESC
      LIMIT 1
    )
    LEFT JOIN publish_attempts pa ON pa.id = (
      SELECT latest_pa.id FROM publish_attempts latest_pa
      WHERE latest_pa.approval_id = a.id AND latest_pa.status = 'succeeded'
      ORDER BY datetime(latest_pa.created_at) DESC, latest_pa.id DESC
      LIMIT 1
    )
    ${campaignFilter}
    ORDER BY ccs.status = 'archived', datetime(ccs.slot_for) ASC, ccs.id ASC`,
    values,
  );

  if (rows.length === 0) return [];
  const severityByVariantId = await getAuditSeverityByVariantId(
    db,
    rows.map((row) => row.variant_id),
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

export async function listContentCalendarEligibleApprovals(
  campaignId?: number,
): Promise<ContentCalendarEligibleApproval[]> {
  const db = await getDb();
  const values = campaignId === undefined ? [] : [campaignId];
  const campaignFilter =
    campaignId === undefined ? "" : "AND a.campaign_id = $1";

  const rows = await db.select<ContentCalendarEligibleApprovalRow[]>(
    `SELECT
      a.id AS approval_id,
      a.campaign_id,
      a.status AS approval_status,
      a.reviewer_notes AS approval_reviewer_notes,
      a.approved_at AS approval_approved_at,
      c.name AS campaign_name,
      c.status AS campaign_status,
      d.id AS draft_id,
      d.angle AS draft_angle,
      d.notes AS draft_notes,
      d.candidate_post_id,
      cp.source_keyword AS candidate_source_keyword,
      tp.url AS target_url,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      dv.id AS variant_id,
      dv.variant_number,
      dv.hook AS variant_hook,
      dv.body AS variant_body,
      dv.cta AS variant_cta,
      dv.hashtags AS variant_hashtags,
      sj.id AS schedule_job_id,
      sj.scheduled_for AS schedule_scheduled_for,
      sj.timezone AS schedule_timezone,
      sj.status AS schedule_status,
      sj.attempt_count AS schedule_attempt_count,
      sj.last_error AS schedule_last_error,
      sj.updated_at AS schedule_updated_at
    FROM approvals a
    INNER JOIN campaigns c ON c.id = a.campaign_id
    INNER JOIN drafts d ON d.id = a.draft_id
    INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    LEFT JOIN content_calendar_slots ccs ON ccs.approval_id = a.id
    LEFT JOIN schedule_jobs sj ON sj.id = (
      SELECT latest_sj.id FROM schedule_jobs latest_sj
      WHERE latest_sj.approval_id = a.id
      ORDER BY datetime(latest_sj.updated_at) DESC, latest_sj.id DESC
      LIMIT 1
    )
    WHERE a.status IN ('approved', 'scheduled', 'published')
      AND ccs.id IS NULL
      AND c.status <> 'archived'
      ${campaignFilter}
    ORDER BY datetime(a.updated_at) DESC, a.id DESC`,
    values,
  );

  if (rows.length === 0) return [];
  const severityByVariantId = await getAuditSeverityByVariantId(
    db,
    rows.map((row) => row.variant_id),
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

async function getApprovalForSlotCreation(
  db: LinkgoDatabase,
  approvalId: number,
): Promise<ApprovalValidationRow> {
  const rows = await db.select<ApprovalValidationRow[]>(
    `SELECT
      a.id,
      a.campaign_id,
      c.status AS campaign_status,
      a.status AS approval_status,
      (
        SELECT COUNT(*) FROM content_calendar_slots existing_ccs
        WHERE existing_ccs.approval_id = a.id
      ) AS slot_count
    FROM approvals a
    INNER JOIN campaigns c ON c.id = a.campaign_id
    WHERE a.id = $1
    LIMIT 1`,
    [approvalId],
  );
  const approval = rows[0];
  if (approval === undefined) throw new Error("Approval was not found");
  if (approval.campaign_status === "archived")
    throw new Error("Campaign is archived");
  if (
    !["approved", "scheduled", "published"].includes(approval.approval_status)
  ) {
    throw new Error("Approval must be approved before calendar planning");
  }
  if (approval.slot_count > 0)
    throw new Error("Approval already has a calendar slot");
  return approval;
}

async function getSlotForMutation(
  db: LinkgoDatabase,
  id: number,
): Promise<ContentCalendarValidationRow> {
  const rows = await db.select<ContentCalendarValidationRow[]>(
    `SELECT
      ccs.id,
      ccs.approval_id,
      ccs.campaign_id,
      c.status AS campaign_status,
      a.status AS approval_status,
      ccs.status,
      ccs.slot_for,
      ccs.timezone
    FROM content_calendar_slots ccs
    INNER JOIN campaigns c ON c.id = ccs.campaign_id
    INNER JOIN approvals a ON a.id = ccs.approval_id
    WHERE ccs.id = $1
    LIMIT 1`,
    [id],
  );
  const slot = rows[0];
  if (slot === undefined) throw new Error("Calendar slot was not found");
  if (slot.campaign_status === "archived")
    throw new Error("Campaign is archived");
  return slot;
}

export async function createContentCalendarSlot(
  input: CreateContentCalendarSlotInput,
): Promise<number> {
  const parsed = createContentCalendarSlotSchema.parse(input);
  const db = await getDb();
  const approval = await getApprovalForSlotCreation(db, parsed.approvalId);

  const result = await db.execute(
    `INSERT INTO content_calendar_slots (
      campaign_id,
      approval_id,
      purpose,
      slot_for,
      timezone,
      format,
      angle,
      visual_direction,
      cta,
      notes,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, datetime('now'))`,
    [
      approval.campaign_id,
      parsed.approvalId,
      parsed.purpose,
      parsed.slotFor,
      parsed.timezone,
      parsed.format,
      parsed.angle,
      parsed.visualDirection,
      parsed.cta,
      parsed.notes,
    ],
  );
  return result.lastInsertId;
}

export async function updateContentCalendarSlot(
  input: UpdateContentCalendarSlotInput,
): Promise<void> {
  const parsed = updateContentCalendarSlotSchema.parse(input);
  const db = await getDb();
  const slot = await getSlotForMutation(db, parsed.id);
  if (slot.status !== "planned") {
    throw new Error("Archived calendar slots cannot be edited");
  }

  await db.execute(
    `UPDATE content_calendar_slots
    SET purpose = $1,
      slot_for = $2,
      timezone = $3,
      format = $4,
      angle = $5,
      visual_direction = $6,
      cta = $7,
      notes = $8,
      updated_at = datetime('now')
    WHERE id = $9`,
    [
      parsed.purpose,
      parsed.slotFor,
      parsed.timezone,
      parsed.format,
      parsed.angle,
      parsed.visualDirection,
      parsed.cta,
      parsed.notes,
      parsed.id,
    ],
  );
}

export async function archiveContentCalendarSlot(
  input: ArchiveContentCalendarSlotInput,
): Promise<void> {
  const parsed = archiveContentCalendarSlotSchema.parse(input);
  const db = await getDb();
  await getSlotForMutation(db, parsed.id);
  await db.execute(
    `UPDATE content_calendar_slots
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = $1`,
    [parsed.id],
  );
}

export async function scheduleContentCalendarSlot(
  input: ScheduleContentCalendarSlotInput,
): Promise<void> {
  const parsed = scheduleContentCalendarSlotSchema.parse(input);
  const db = await getDb();
  const slot = await getSlotForMutation(db, parsed.id);
  if (slot.status === "archived")
    throw new Error("Archived slots cannot be scheduled");
  if (slot.approval_status !== "approved") {
    throw new Error("Only approved posts can be scheduled");
  }

  await scheduleApproval({
    approvalId: slot.approval_id,
    scheduledFor: slot.slot_for,
    timezone: slot.timezone,
  });
}
