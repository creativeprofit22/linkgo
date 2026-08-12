import { invoke } from "@tauri-apps/api/core";
import { getDb, type LinkgoDatabase } from "@/lib/db";
import { rejectAgentRunsForApprovalInTransaction } from "@/features/agent-runtime/data";
import {
  assertApprovalCanPublishViaLinkedInSchema,
  cancelScheduleSchema,
  createApprovalSchema,
  scheduleApprovalSchema,
  setApprovalStatusSchema,
} from "@/features/approvals/schemas";
import type {
  Approval,
  ApprovalDraftSnapshot,
  ApprovalEligibleDraft,
  ApprovalStatus,
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
import type { CampaignStatus } from "@/features/campaigns/types";
import { getAuditSeverity, mapDraftAudit } from "@/features/drafts/data";
import {
  getSafetySettings,
  recordSafetyAuditEvent,
  upsertErrorQueueItem,
} from "@/features/safety/data";
import type {
  DraftAuditFinding,
  DraftAuditSeverity,
  DraftStatus,
  DraftVariantStatus,
} from "@/features/drafts/types";

interface ApprovalDetailRow {
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
  draft_candidate_post_id: number;
  draft_angle: string;
  draft_notes: string;
  draft_status: DraftStatus;
  campaign_name: string;
  campaign_status: CampaignStatus;
  candidate_source_keyword: string;
  target_url: string;
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  variant_number: number;
  variant_hook: string;
  variant_body: string;
  variant_cta: string;
  variant_hashtags: string;
  variant_status: DraftVariantStatus;
}

interface ApprovalAuditRow {
  id: number;
  draft_variant_id: number;
  rule_key: string;
  severity: DraftAuditSeverity;
  message: string;
  created_at: string;
}

interface ApprovalValidationRow {
  draft_id: number;
  campaign_id: number;
  campaign_status: CampaignStatus;
  draft_status: DraftStatus;
  draft_variant_id: number | null;
  selected_count: number;
}

interface ApprovalCampaignRow {
  id: number;
  campaign_id: number;
  campaign_status: CampaignStatus;
  daily_post_limit: number;
  status: ApprovalStatus;
  draft_id: number;
}

interface PublishPreflightApprovalRow extends ApprovalCampaignRow {
  successful_publish_attempt_count: number;
}

interface CountRow {
  count: number;
}

interface LinkedAgentRunCountRow extends CountRow {
  approval_id: number;
}

function getPlaceholders(ids: number[]): string {
  return ids.map((_, index) => `$${index + 1}`).join(", ");
}

const APPROVAL_AI_AUDIT_RULE_KEYS_SQL =
  "'hook', 'specificity', 'generic_language', 'authenticity', 'clarity', 'safety'";

function getApprovalAiAuditReadySql(variantAlias: string): string {
  return `EXISTS (
    SELECT 1
    FROM draft_ai_audit_runs approval_audit_run
    WHERE approval_audit_run.id = (
      SELECT latest_audit_run.id
      FROM draft_ai_audit_runs latest_audit_run
      WHERE latest_audit_run.draft_variant_id = ${variantAlias}.id
        AND latest_audit_run.content_revision = ${variantAlias}.content_revision
      ORDER BY latest_audit_run.id DESC
      LIMIT 1
    )
      AND approval_audit_run.status = 'completed'
      AND (
        SELECT COUNT(*)
        FROM draft_ai_audit_findings approval_audit_finding
        WHERE approval_audit_finding.audit_run_id = approval_audit_run.id
      ) = 6
      AND (
        SELECT COUNT(*)
        FROM draft_ai_audit_findings canonical_audit_finding
        WHERE canonical_audit_finding.audit_run_id = approval_audit_run.id
          AND canonical_audit_finding.rule_key IN (${APPROVAL_AI_AUDIT_RULE_KEYS_SQL})
      ) = 6
      AND NOT EXISTS (
        SELECT 1
        FROM draft_ai_audit_findings blocking_audit_finding
        WHERE blocking_audit_finding.audit_run_id = approval_audit_run.id
          AND blocking_audit_finding.severity = 'block'
      )
  )`;
}

function mapApproval(row: ApprovalDetailRow): Approval {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    draft_id: row.draft_id,
    draft_variant_id: row.draft_variant_id,
    status: row.status,
    reviewer_notes: row.reviewer_notes,
    approved_at: row.approved_at,
    rejected_at: row.rejected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDraftSnapshot(row: ApprovalDetailRow): ApprovalDraftSnapshot {
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
  row: ApprovalDetailRow,
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

function mapScheduleJob(row: ScheduleJob): ScheduleJob {
  return row;
}

function mapPublishAttempt(row: PublishAttempt): PublishAttempt {
  return row;
}

async function getAuditSeverityByVariantId(
  db: LinkgoDatabase,
  variantIds: number[],
): Promise<Map<number, DraftAuditSeverity>> {
  if (variantIds.length === 0) return new Map();

  const rows = await db.select<ApprovalAuditRow[]>(
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

export async function listApprovals(
  campaignId?: number,
): Promise<ApprovalWithDetails[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE a.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<ApprovalDetailRow[]>(
    `SELECT
      a.id,
      a.campaign_id,
      a.draft_id,
      a.draft_variant_id,
      a.status,
      a.reviewer_notes,
      a.approved_at,
      a.rejected_at,
      a.created_at,
      a.updated_at,
      d.candidate_post_id AS draft_candidate_post_id,
      d.angle AS draft_angle,
      d.notes AS draft_notes,
      d.status AS draft_status,
      c.name AS campaign_name,
      c.status AS campaign_status,
      cp.source_keyword AS candidate_source_keyword,
      tp.url AS target_url,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      dv.variant_number,
      dv.hook AS variant_hook,
      dv.body AS variant_body,
      dv.cta AS variant_cta,
      dv.hashtags AS variant_hashtags,
      dv.status AS variant_status
    FROM approvals a
    INNER JOIN campaigns c ON c.id = a.campaign_id
    INNER JOIN drafts d ON d.id = a.draft_id
    INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    ${whereClause}
    ORDER BY a.status IN ('published', 'cancelled', 'rejected'), datetime(a.updated_at) DESC, a.id DESC`,
    values,
  );

  if (rows.length === 0) return [];

  const approvalIds = rows.map((row) => row.id);
  const variantIds = rows.map((row) => row.draft_variant_id);
  const [
    scheduleRows,
    publishRows,
    linkedAgentRunCountRows,
    severityByVariantId,
  ] = await Promise.all([
    db.select<ScheduleJob[]>(
      `SELECT * FROM schedule_jobs
      WHERE approval_id IN (${getPlaceholders(approvalIds)})
      ORDER BY datetime(updated_at) DESC, id DESC`,
      approvalIds,
    ),
    db.select<PublishAttempt[]>(
      `SELECT * FROM publish_attempts
      WHERE approval_id IN (${getPlaceholders(approvalIds)})
      ORDER BY datetime(created_at) DESC, id DESC`,
      approvalIds,
    ),
    db.select<LinkedAgentRunCountRow[]>(
      `SELECT approval_id, COUNT(*) AS count
      FROM agent_run_approval_checkpoints
      WHERE approval_id IN (${getPlaceholders(approvalIds)})
      GROUP BY approval_id`,
      approvalIds,
    ),
    getAuditSeverityByVariantId(db, variantIds),
  ]);

  const scheduleByApprovalId = new Map<number, ScheduleJob>();
  for (const row of scheduleRows) {
    scheduleByApprovalId.set(row.approval_id, mapScheduleJob(row));
  }

  const attemptsByApprovalId = new Map<number, PublishAttempt[]>();
  for (const row of publishRows) {
    const attempts = attemptsByApprovalId.get(row.approval_id) ?? [];
    attempts.push(mapPublishAttempt(row));
    attemptsByApprovalId.set(row.approval_id, attempts);
  }

  const linkedAgentRunCountByApprovalId = new Map(
    linkedAgentRunCountRows.map((row) => [row.approval_id, row.count]),
  );

  return rows.map((row) => ({
    ...mapApproval(row),
    linkedAgentRunCount: linkedAgentRunCountByApprovalId.get(row.id) ?? 0,
    scheduleJob: scheduleByApprovalId.get(row.id) ?? null,
    publishAttempts: attemptsByApprovalId.get(row.id) ?? [],
    draft: mapDraftSnapshot(row),
    variant: mapVariantSnapshot(
      row,
      severityByVariantId.get(row.draft_variant_id) ?? "pass",
    ),
  }));
}

export async function listApprovalEligibleDrafts(
  campaignId?: number,
): Promise<ApprovalEligibleDraft[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const campaignFilter =
    campaignId === undefined ? "" : "AND d.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<ApprovalDetailRow[]>(
    `SELECT
      0 AS id,
      d.campaign_id,
      d.id AS draft_id,
      dv.id AS draft_variant_id,
      'needs_review' AS status,
      '' AS reviewer_notes,
      NULL AS approved_at,
      NULL AS rejected_at,
      d.created_at,
      d.updated_at,
      d.candidate_post_id AS draft_candidate_post_id,
      d.angle AS draft_angle,
      d.notes AS draft_notes,
      d.status AS draft_status,
      c.name AS campaign_name,
      c.status AS campaign_status,
      cp.source_keyword AS candidate_source_keyword,
      tp.url AS target_url,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      dv.variant_number,
      dv.hook AS variant_hook,
      dv.body AS variant_body,
      dv.cta AS variant_cta,
      dv.hashtags AS variant_hashtags,
      dv.status AS variant_status
    FROM drafts d
    INNER JOIN campaigns c ON c.id = d.campaign_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    INNER JOIN draft_variants dv ON dv.draft_id = d.id AND dv.status = 'selected'
    LEFT JOIN approvals a ON a.draft_id = d.id
    WHERE d.status = 'ready_for_review'
      AND a.id IS NULL
      AND c.status <> 'archived'
      ${campaignFilter}
      AND (
        SELECT COUNT(*) FROM draft_variants selected_dv
        WHERE selected_dv.draft_id = d.id AND selected_dv.status = 'selected'
      ) = 1
      AND NOT EXISTS (
        SELECT 1 FROM draft_audits da
        WHERE da.draft_variant_id = dv.id AND da.severity = 'block'
      )
      AND ${getApprovalAiAuditReadySql("dv")}
    ORDER BY datetime(d.updated_at) DESC, d.id DESC`,
    values,
  );

  if (rows.length === 0) return [];

  const severityByVariantId = await getAuditSeverityByVariantId(
    db,
    rows.map((row) => row.draft_variant_id),
  );

  return rows.map((row) => ({
    ...mapDraftSnapshot(row),
    variant: mapVariantSnapshot(
      row,
      severityByVariantId.get(row.draft_variant_id) ?? "pass",
    ),
  }));
}

export async function createApproval(
  input: CreateApprovalInput,
): Promise<number> {
  const parsed = createApprovalSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const draftRows = await db.select<ApprovalValidationRow[]>(
      `SELECT
        d.id AS draft_id,
        d.campaign_id,
        c.status AS campaign_status,
        d.status AS draft_status,
        dv.id AS draft_variant_id,
        (
          SELECT COUNT(*) FROM draft_variants selected_dv
          WHERE selected_dv.draft_id = d.id AND selected_dv.status = 'selected'
        ) AS selected_count
      FROM drafts d
      INNER JOIN campaigns c ON c.id = d.campaign_id
      LEFT JOIN draft_variants dv ON dv.draft_id = d.id AND dv.status = 'selected'
      WHERE d.id = $1`,
      [parsed.draftId],
    );
    const draft = draftRows[0];
    if (draft === undefined) throw new Error("Draft was not found");
    if (draft.campaign_status === "archived") {
      throw new Error("Campaign is archived");
    }
    if (draft.draft_status !== "ready_for_review") {
      throw new Error("Draft is not ready for review");
    }
    if (draft.draft_variant_id === null || draft.selected_count !== 1) {
      throw new Error("Select a draft variant before review");
    }
    const aiAuditReadyRows = await db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
      FROM draft_variants dv
      WHERE dv.id = $1
        AND ${getApprovalAiAuditReadySql("dv")}`,
      [draft.draft_variant_id],
    );
    if ((aiAuditReadyRows[0]?.count ?? 0) !== 1) {
      throw new Error(
        "Selected variant requires a completed current-revision AI audit with six canonical non-blocking findings",
      );
    }

    const blockRows = await db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
      FROM draft_audits
      WHERE draft_variant_id = $1 AND severity = 'block'`,
      [draft.draft_variant_id],
    );
    if ((blockRows[0]?.count ?? 0) > 0) {
      throw new Error("Blocked variants cannot be sent for approval");
    }

    const existingRows = await db.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM approvals WHERE draft_id = $1`,
      [parsed.draftId],
    );
    if ((existingRows[0]?.count ?? 0) > 0) {
      throw new Error("Draft already has an approval record");
    }

    const result = await db.execute(
      `INSERT INTO approvals (
        campaign_id,
        draft_id,
        draft_variant_id,
        status,
        reviewer_notes,
        updated_at
      ) VALUES ($1, $2, $3, 'needs_review', $4, datetime('now'))`,
      [
        draft.campaign_id,
        parsed.draftId,
        draft.draft_variant_id,
        parsed.reviewerNotes,
      ],
    );
    await db.execute("COMMIT");
    return result.lastInsertId;
  } catch (error) {
    await rollbackApprovalTransaction(db);
    throw error;
  }
}

function assertTransition(
  currentStatus: ApprovalStatus,
  nextStatus: ApprovalStatus,
): void {
  const allowed: Partial<Record<ApprovalStatus, ApprovalStatus[]>> = {
    needs_review: ["approved", "changes_requested", "rejected", "cancelled"],
    changes_requested: ["needs_review", "approved", "rejected", "cancelled"],
    approved: ["needs_review", "changes_requested", "cancelled"],
    cancelled: ["needs_review"],
  };
  if (!(allowed[currentStatus] ?? []).includes(nextStatus)) {
    throw new Error("Unsupported approval transition");
  }
}

export async function setApprovalStatus(
  input: SetApprovalStatusInput,
): Promise<void> {
  const parsed = setApprovalStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const rows = await db.select<ApprovalCampaignRow[]>(
      `SELECT
        a.id,
        a.campaign_id,
        c.status AS campaign_status,
        c.daily_post_limit,
        a.status,
        a.draft_id
      FROM approvals a
      INNER JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.id = $1
      LIMIT 1`,
      [parsed.id],
    );
    const approval = rows[0];
    if (approval === undefined) throw new Error("Approval was not found");
    if (approval.campaign_status === "archived") {
      throw new Error("Campaign is archived");
    }

    assertTransition(approval.status, parsed.status);

    const values: unknown[] = [parsed.status];
    const updates = ["status = $1"];
    if (parsed.reviewerNotes !== undefined) {
      values.push(parsed.reviewerNotes);
      updates.push(`reviewer_notes = $${values.length}`);
    }
    if (parsed.status === "approved") {
      updates.push("approved_at = datetime('now')", "rejected_at = NULL");
    }
    if (parsed.status === "rejected") {
      updates.push("rejected_at = datetime('now')");
    }

    values.push(parsed.id);
    await db.execute(
      `UPDATE approvals
      SET ${updates.join(", ")}, updated_at = datetime('now')
      WHERE id = $${values.length}`,
      values,
    );

    if (parsed.status === "changes_requested") {
      await db.execute(
        `UPDATE drafts
        SET status = 'needs_revision', updated_at = datetime('now')
        WHERE id = $1`,
        [approval.draft_id],
      );
    }
    if (parsed.status === "needs_review") {
      await db.execute(
        `UPDATE drafts
        SET status = 'ready_for_review', updated_at = datetime('now')
        WHERE id = $1`,
        [approval.draft_id],
      );
    }

    if (parsed.status === "rejected") {
      const detail =
        parsed.reviewerNotes?.trim() || "Approval rejected by operator review";
      await rejectAgentRunsForApprovalInTransaction(db, approval.id, detail);
      await recordSafetyAuditEvent(db, {
        campaignId: approval.campaign_id,
        subjectType: "approval",
        subjectId: approval.id,
        eventType: "approval_rejected",
        severity: "warning",
        summary: "Approval rejected",
        metadata: { reviewerNotes: detail },
      });
      await upsertErrorQueueItem(db, {
        campaignId: approval.campaign_id,
        sourceType: "approval",
        sourceId: approval.id,
        title: "Approval rejected",
        detail,
        severity: "warning",
      });
    }

    await db.execute("COMMIT");
  } catch (error) {
    await rollbackApprovalTransaction(db);
    throw error;
  }
}

export async function scheduleApproval(
  input: ScheduleApprovalInput,
): Promise<number> {
  const parsed = scheduleApprovalSchema.parse(input);
  return invoke<number>("linkgo_approval_schedule", { input: parsed });
}

export async function cancelSchedule(
  input: CancelScheduleInput,
): Promise<void> {
  const parsed = cancelScheduleSchema.parse(input);
  await invoke("linkgo_approval_cancel_schedule", { input: parsed });
}

export async function assertApprovalCanPublishViaLinkedIn(
  input: AssertApprovalCanPublishViaLinkedInInput,
): Promise<void> {
  const parsed = assertApprovalCanPublishViaLinkedInSchema.parse(input);
  const db = await getDb();
  const settings = await getSafetySettings();

  if (settings.global_kill_switch === 1) {
    throw new Error(
      settings.kill_switch_reason
        ? `Global kill switch is enabled: ${settings.kill_switch_reason}`
        : "Global kill switch is enabled",
    );
  }

  const approvalRows = await db.select<PublishPreflightApprovalRow[]>(
    `SELECT
      a.id,
      a.campaign_id,
      c.status AS campaign_status,
      c.daily_post_limit,
      a.status,
      a.draft_id,
      (
        SELECT COUNT(*) FROM publish_attempts pa
        WHERE pa.approval_id = a.id AND pa.status = 'succeeded'
      ) AS successful_publish_attempt_count
    FROM approvals a
    INNER JOIN campaigns c ON c.id = a.campaign_id
    WHERE a.id = $1
    LIMIT 1`,
    [parsed.approvalId],
  );
  const approval = approvalRows[0];
  if (approval === undefined) throw new Error("Approval was not found");
  if (approval.campaign_status === "archived") {
    throw new Error("Campaign is archived");
  }
  if (!["approved", "scheduled"].includes(approval.status)) {
    throw new Error(
      "Only approved or scheduled approvals can publish via LinkedIn",
    );
  }
  if (approval.successful_publish_attempt_count > 0) {
    throw new Error("Approval already has a successful publish attempt");
  }

  const scheduleRows = await db.select<ScheduleJob[]>(
    `SELECT * FROM schedule_jobs
    WHERE approval_id = $1
    ORDER BY datetime(updated_at) DESC, id DESC
    LIMIT 1`,
    [parsed.approvalId],
  );
  const currentSchedule = scheduleRows[0];

  if (approval.status === "scheduled") {
    if (parsed.scheduleJobId === undefined) {
      throw new Error("Scheduled approvals require the current schedule job");
    }
    if (
      currentSchedule === undefined ||
      currentSchedule.id !== parsed.scheduleJobId ||
      currentSchedule.status !== "scheduled"
    ) {
      throw new Error("Schedule job is not the current scheduled job");
    }
    return;
  }

  if (parsed.scheduleJobId === undefined) return;
  if (
    currentSchedule === undefined ||
    currentSchedule.id !== parsed.scheduleJobId ||
    currentSchedule.status !== "scheduled"
  ) {
    throw new Error("Schedule job is not the current scheduled job");
  }
}

export async function recordPublishAttempt(
  input: RecordPublishAttemptInput,
): Promise<number> {
  return invoke<number>("linkgo_approval_record_publish_attempt", { input });
}

export async function rollbackApprovalTransaction(
  db: LinkgoDatabase,
): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}
