import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  createCommentThreadSchema,
  recordCommentAttemptSchema,
  setCommentThreadStatusSchema,
  setCommentVariantStatusSchema,
  updateCommentThreadSchema,
  updateCommentVariantSchema,
} from "@/features/comments/schemas";
import type { CampaignStatus } from "@/features/campaigns/types";
import type { CandidateStatus } from "@/features/candidate-queue/types";
import {
  getCommentLimitDecision,
  recordRateLimitEvent,
  upsertErrorQueueItem,
} from "@/features/safety/data";
import type { SafetySettings } from "@/features/safety/types";
import type {
  CommentAttempt,
  CommentAuditFinding,
  CommentAuditSeverity,
  CommentEligibleCandidate,
  CommentThread,
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
  target_author_name: string;
  target_author_profile_url: string;
  target_content: string;
  target_posted_at: string | null;
}

interface CommentThreadValidationRow {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  status: CommentThreadStatus;
  campaign_status: CampaignStatus;
  daily_comment_limit: number;
}

interface SelectedVariantRow extends CommentVariantRow {
  blocked_count: number;
}

interface CountRow {
  count: number;
}

const SEVERITY_RANK: Record<CommentAuditSeverity, number> = {
  block: 0,
  warning: 1,
  pass: 2,
};

const TERMINAL_THREAD_STATUSES: CommentThreadStatus[] = [
  "posted",
  "rejected",
  "cancelled",
];

function createFinding(
  ruleKey: string,
  severity: CommentAuditSeverity,
  message: string,
): CommentAuditFinding {
  return { rule_key: ruleKey, severity, message };
}

function getPlaceholders(ids: number[]): string {
  return ids.map((_, index) => `$${index + 1}`).join(", ");
}

function rollbackCommentTransaction(db: LinkgoDatabase): Promise<void> {
  return db.execute("ROLLBACK").then(
    () => undefined,
    () => undefined,
  );
}

function countHashtags(body: string): number {
  return body.match(/#[\p{L}\p{N}_-]+/gu)?.length ?? 0;
}

function hasExternalLink(body: string): boolean {
  return /https?:\/\/|www\./iu.test(body);
}

function hasSpecificitySignal(body: string): boolean {
  return (
    /\d/u.test(body) ||
    /[“"][^”"]+[”"]/u.test(body) ||
    /\b(i|we|my|our|i've|we've|i’m|we’re|i'd|we'd)\b/iu.test(body)
  );
}

function isGenericReply(body: string): boolean {
  return /\b(great post|thanks for sharing|love this|insightful post|nice post)\b/iu.test(
    body,
  );
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

export function auditCommentVariant(body: string): CommentAuditFinding[] {
  const trimmed = body.trim();
  const findings: CommentAuditFinding[] = [];

  if (trimmed.length === 0) {
    findings.push(
      createFinding("required_text", "block", "Add a comment before review."),
    );
  } else {
    findings.push(
      createFinding(
        "required_text",
        "pass",
        "This comment has text to review.",
      ),
    );
  }

  if (trimmed.length > 1250) {
    findings.push(
      createFinding(
        "comment_length",
        "block",
        "Keep comments under Linkgo's 1,250 character cap.",
      ),
    );
  } else {
    findings.push(
      createFinding(
        "comment_length",
        "pass",
        "This comment stays under Linkgo's 1,250 character cap.",
      ),
    );
  }

  if (hasExternalLink(trimmed)) {
    findings.push(
      createFinding(
        "external_link",
        "block",
        "Remove external links before review.",
      ),
    );
  } else {
    findings.push(
      createFinding("external_link", "pass", "No external link was found."),
    );
  }

  if (countHashtags(trimmed) > 2) {
    findings.push(
      createFinding("hashtag_limit", "block", "Use two or fewer hashtags."),
    );
  } else {
    findings.push(
      createFinding(
        "hashtag_limit",
        "pass",
        "This comment uses two or fewer hashtags.",
      ),
    );
  }

  const mentions = trimmed.match(/@[\p{L}\p{N}_.-]+/gu)?.length ?? 0;
  if (mentions > 1) {
    findings.push(
      createFinding(
        "mention_limit",
        "warning",
        "Use at most one mention unless the reviewer confirms it is intentional.",
      ),
    );
  }

  if (trimmed.length < 40 || isGenericReply(trimmed)) {
    findings.push(
      createFinding(
        "generic_reply",
        "warning",
        "Make the reply more specific than a generic reaction.",
      ),
    );
  }

  if (!hasSpecificitySignal(trimmed)) {
    findings.push(
      createFinding(
        "specificity",
        "warning",
        "Add a number, quoted phrase, or first-person signal.",
      ),
    );
  }

  return findings.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.rule_key.localeCompare(right.rule_key),
  );
}

async function insertAuditFindings(
  db: LinkgoDatabase,
  variantId: number,
  findings: CommentAuditFinding[],
): Promise<void> {
  for (const finding of findings) {
    await db.execute(
      `INSERT INTO comment_audits (comment_variant_id, rule_key, severity, message)
      VALUES ($1, $2, $3, $4)`,
      [variantId, finding.rule_key, finding.severity, finding.message],
    );
  }
}

async function ensureThreadMutable(
  db: LinkgoDatabase,
  threadId: number,
): Promise<CommentThreadValidationRow> {
  const rows = await db.select<CommentThreadValidationRow[]>(
    `SELECT
      ct.id,
      ct.campaign_id,
      ct.candidate_post_id,
      ct.status,
      c.status AS campaign_status,
      c.daily_comment_limit
    FROM comment_threads ct
    INNER JOIN campaigns c ON c.id = ct.campaign_id
    WHERE ct.id = $1
    LIMIT 1`,
    [threadId],
  );
  const thread = rows[0];
  if (thread === undefined) throw new Error("Comment thread was not found");
  if (thread.campaign_status === "archived")
    throw new Error("Campaign is archived");
  return thread;
}

async function getThreadForVariant(
  db: LinkgoDatabase,
  variantId: number,
): Promise<{ thread: CommentThreadValidationRow; variant: CommentVariantRow }> {
  const variants = await db.select<CommentVariantRow[]>(
    `SELECT * FROM comment_variants WHERE id = $1 LIMIT 1`,
    [variantId],
  );
  const variant = variants[0];
  if (variant === undefined) throw new Error("Comment variant was not found");
  const thread = await ensureThreadMutable(db, variant.comment_thread_id);
  return { thread, variant };
}

async function getSelectedVariant(
  db: LinkgoDatabase,
  threadId: number,
): Promise<SelectedVariantRow | null> {
  const selectedRows = await db.select<SelectedVariantRow[]>(
    `SELECT
      cv.*,
      SUM(CASE WHEN ca.severity = 'block' THEN 1 ELSE 0 END) AS blocked_count
    FROM comment_variants cv
    LEFT JOIN comment_audits ca ON ca.comment_variant_id = cv.id
    WHERE cv.comment_thread_id = $1 AND cv.status = 'selected'
    GROUP BY cv.id
    ORDER BY cv.id ASC`,
    [threadId],
  );
  if (selectedRows.length > 1) {
    throw new Error("Choose exactly one selected comment variant");
  }
  return selectedRows[0] ?? null;
}

async function assertSelectedVariantReady(
  db: LinkgoDatabase,
  threadId: number,
): Promise<SelectedVariantRow> {
  const selected = await getSelectedVariant(db, threadId);
  if (selected === null)
    throw new Error("Choose one comment variant before review");
  if (selected.blocked_count > 0)
    throw new Error("Blocked comment variants cannot be reviewed");
  return selected;
}

async function assertKillSwitchAllowsComment(
  db: LinkgoDatabase,
  thread: CommentThreadValidationRow,
): Promise<void> {
  await db.execute(`INSERT OR IGNORE INTO safety_settings (id) VALUES (1)`);
  const settingsRows = await db.select<SafetySettings[]>(
    `SELECT * FROM safety_settings WHERE id = 1 LIMIT 1`,
  );
  const settings = settingsRows[0];
  if (settings?.global_kill_switch !== 1) return;

  const decision = await getCommentLimitDecision(db, {
    campaignId: thread.campaign_id,
    limitValue: thread.daily_comment_limit,
  });
  await recordRateLimitEvent(db, {
    campaignId: decision.campaignId,
    action: "comment",
    windowKey: decision.windowKey,
    limitValue: decision.limitValue,
    currentCount: decision.currentCount,
    decision: "blocked",
    summary: settings.kill_switch_reason
      ? `Comment posting blocked by global kill switch: ${settings.kill_switch_reason}`
      : "Comment posting blocked by global kill switch",
  });
  throw new Error(
    settings.kill_switch_reason
      ? `Global kill switch is enabled: ${settings.kill_switch_reason}`
      : "Global kill switch is enabled",
  );
}

export async function listCommentThreads(
  campaignId?: number,
): Promise<CommentThreadWithDetails[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE ct.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<CommentThreadRow[]>(
    `SELECT
      ct.id,
      ct.campaign_id,
      ct.candidate_post_id,
      ct.status,
      ct.operator_notes,
      ct.reviewer_notes,
      ct.approved_at,
      ct.rejected_at,
      ct.posted_at,
      ct.created_at,
      ct.updated_at,
      c.name AS campaign_name,
      c.status AS campaign_status,
      cp.status AS candidate_status,
      cp.source_keyword AS candidate_source_keyword,
      cp.relevance_score AS candidate_relevance_score,
      tp.id AS target_post_id,
      tp.url AS target_url,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      tp.posted_at AS target_posted_at
    FROM comment_threads ct
    INNER JOIN campaigns c ON c.id = ct.campaign_id
    INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    ${whereClause}
    ORDER BY ct.status IN ('posted', 'rejected', 'cancelled'), datetime(ct.updated_at) DESC, ct.id DESC`,
    values,
  );

  if (rows.length === 0) return [];
  const threadIds = rows.map((row) => row.id);
  const variantRows = await db.select<CommentVariantRow[]>(
    `SELECT * FROM comment_variants
    WHERE comment_thread_id IN (${getPlaceholders(threadIds)})
    ORDER BY variant_number ASC`,
    threadIds,
  );
  const variantIds = variantRows.map((row) => row.id);
  const auditRows =
    variantIds.length === 0
      ? []
      : await db.select<CommentAuditRow[]>(
          `SELECT * FROM comment_audits
          WHERE comment_variant_id IN (${getPlaceholders(variantIds)})`,
          variantIds,
        );
  const attemptRows = await db.select<CommentAttempt[]>(
    `SELECT * FROM comment_attempts
    WHERE comment_thread_id IN (${getPlaceholders(threadIds)})
    ORDER BY datetime(created_at) DESC, id DESC`,
    threadIds,
  );

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

export async function listCommentEligibleCandidates(
  campaignId?: number,
): Promise<CommentEligibleCandidate[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const campaignFilter =
    campaignId === undefined ? "" : "AND cp.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<CommentCandidateRow[]>(
    `SELECT
      cp.id AS candidate_id,
      cp.campaign_id,
      c.name AS campaign_name,
      c.status AS campaign_status,
      cp.status AS candidate_status,
      cp.source_keyword,
      cp.relevance_score,
      tp.id AS target_post_id,
      tp.url AS target_url,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.content AS target_content,
      tp.posted_at AS target_posted_at
    FROM candidate_posts cp
    INNER JOIN campaigns c ON c.id = cp.campaign_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    LEFT JOIN comment_threads ct ON ct.candidate_post_id = cp.id
    WHERE c.status <> 'archived'
      AND cp.status IN ('shortlisted', 'drafted')
      AND ct.id IS NULL
      ${campaignFilter}
    ORDER BY datetime(cp.updated_at) DESC, cp.id DESC`,
    values,
  );
  return rows.map(mapEligibleCandidate);
}

export async function createCommentThread(
  input: CreateCommentThreadInput,
): Promise<number> {
  const parsed = createCommentThreadSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const candidates = await db.select<CommentCandidateRow[]>(
      `SELECT
        cp.id AS candidate_id,
        cp.campaign_id,
        c.name AS campaign_name,
        c.status AS campaign_status,
        cp.status AS candidate_status,
        cp.source_keyword,
        cp.relevance_score,
        tp.id AS target_post_id,
        tp.url AS target_url,
        tp.author_name AS target_author_name,
        tp.author_profile_url AS target_author_profile_url,
        tp.content AS target_content,
        tp.posted_at AS target_posted_at
      FROM candidate_posts cp
      INNER JOIN campaigns c ON c.id = cp.campaign_id
      INNER JOIN target_posts tp ON tp.id = cp.target_post_id
      WHERE cp.id = $1
      LIMIT 1`,
      [parsed.candidateId],
    );
    const candidate = candidates[0];
    if (candidate === undefined) throw new Error("Candidate was not found");
    if (candidate.campaign_status === "archived")
      throw new Error("Campaign is archived");
    if (!["shortlisted", "drafted"].includes(candidate.candidate_status)) {
      throw new Error(
        "Only shortlisted or drafted candidates can become comments",
      );
    }

    const existingRows = await db.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM comment_threads WHERE candidate_post_id = $1`,
      [parsed.candidateId],
    );
    if ((existingRows[0]?.count ?? 0) > 0) {
      throw new Error("Candidate already has a comment thread");
    }

    const threadResult = await db.execute(
      `INSERT INTO comment_threads (
        campaign_id,
        candidate_post_id,
        operator_notes,
        updated_at
      ) VALUES ($1, $2, $3, datetime('now'))`,
      [candidate.campaign_id, parsed.candidateId, parsed.operatorNotes],
    );
    const threadId = threadResult.lastInsertId;

    for (const [index, variant] of parsed.variants.entries()) {
      const variantResult = await db.execute(
        `INSERT INTO comment_variants (
          comment_thread_id,
          variant_number,
          body,
          updated_at
        ) VALUES ($1, $2, $3, datetime('now'))`,
        [threadId, index + 1, variant.body],
      );
      await insertAuditFindings(
        db,
        variantResult.lastInsertId,
        auditCommentVariant(variant.body),
      );
    }

    await db.execute("COMMIT");
    return threadId;
  } catch (error) {
    await rollbackCommentTransaction(db);
    throw error;
  }
}

export async function updateCommentThread(
  input: UpdateCommentThreadInput,
): Promise<void> {
  const parsed = updateCommentThreadSchema.parse(input);
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  function addUpdate(column: string, value: unknown): void {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (parsed.operatorNotes !== undefined)
    addUpdate("operator_notes", parsed.operatorNotes);
  if (parsed.reviewerNotes !== undefined)
    addUpdate("reviewer_notes", parsed.reviewerNotes);
  if (updates.length === 0) return;

  await db.execute("BEGIN TRANSACTION");
  try {
    await ensureThreadMutable(db, parsed.id);
    values.push(parsed.id);
    await db.execute(
      `UPDATE comment_threads
      SET ${updates.join(", ")}, updated_at = datetime('now')
      WHERE id = $${values.length}`,
      values,
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackCommentTransaction(db);
    throw error;
  }
}

export async function updateCommentVariant(
  input: UpdateCommentVariantInput,
): Promise<void> {
  const parsed = updateCommentVariantSchema.parse(input);
  if (parsed.body === undefined) return;
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const { thread, variant } = await getThreadForVariant(db, parsed.id);
    if (TERMINAL_THREAD_STATUSES.includes(thread.status)) {
      throw new Error(
        "Posted, rejected, and cancelled comments cannot be edited",
      );
    }
    await db.execute(
      `UPDATE comment_variants
      SET body = $1, updated_at = datetime('now')
      WHERE id = $2`,
      [parsed.body, parsed.id],
    );
    await db.execute(
      `DELETE FROM comment_audits WHERE comment_variant_id = $1`,
      [parsed.id],
    );
    await insertAuditFindings(db, parsed.id, auditCommentVariant(parsed.body));
    await db.execute(
      `UPDATE comment_threads
      SET status = CASE WHEN status IN ('needs_review', 'approved') THEN 'changes_requested' ELSE status END,
        updated_at = datetime('now')
      WHERE id = $1`,
      [variant.comment_thread_id],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackCommentTransaction(db);
    throw error;
  }
}

export async function setCommentVariantStatus(
  input: SetCommentVariantStatusInput,
): Promise<void> {
  const parsed = setCommentVariantStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const { thread, variant } = await getThreadForVariant(db, parsed.id);
    if (TERMINAL_THREAD_STATUSES.includes(thread.status)) {
      throw new Error(
        "Posted, rejected, and cancelled comments cannot change variants",
      );
    }

    if (parsed.status === "selected") {
      const audits = await db.select<CommentAuditRow[]>(
        `SELECT * FROM comment_audits WHERE comment_variant_id = $1`,
        [parsed.id],
      );
      if (audits.some((audit) => audit.severity === "block")) {
        throw new Error("Blocked comment variants cannot be selected");
      }
      await db.execute(
        `UPDATE comment_variants
        SET status = 'draft', updated_at = datetime('now')
        WHERE comment_thread_id = $1 AND id <> $2`,
        [variant.comment_thread_id, parsed.id],
      );
    }

    await db.execute(
      `UPDATE comment_variants
      SET status = $1, updated_at = datetime('now')
      WHERE id = $2`,
      [parsed.status, parsed.id],
    );
    await db.execute(
      `UPDATE comment_threads
      SET status = CASE WHEN status IN ('needs_review', 'approved') THEN 'changes_requested' ELSE status END,
        updated_at = datetime('now')
      WHERE id = $1`,
      [variant.comment_thread_id],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackCommentTransaction(db);
    throw error;
  }
}

export async function setCommentThreadStatus(
  input: SetCommentThreadStatusInput,
): Promise<void> {
  const parsed = setCommentThreadStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const thread = await ensureThreadMutable(db, parsed.id);
    if (parsed.status === "needs_review" || parsed.status === "approved") {
      await assertSelectedVariantReady(db, parsed.id);
    }
    if (parsed.status === "posted") {
      throw new Error("Use record posted to move comments to posted");
    }
    if (parsed.status === "approved" && thread.status !== "needs_review") {
      throw new Error("Only comments needing review can be approved");
    }
    if (
      parsed.status === "changes_requested" &&
      thread.status !== "needs_review"
    ) {
      throw new Error("Only comments needing review can request changes");
    }
    if (TERMINAL_THREAD_STATUSES.includes(thread.status)) {
      throw new Error("Terminal comment threads cannot change status");
    }

    await db.execute(
      `UPDATE comment_threads
      SET status = $1,
        reviewer_notes = COALESCE($2, reviewer_notes),
        approved_at = CASE WHEN $1 = 'approved' THEN datetime('now') ELSE approved_at END,
        rejected_at = CASE WHEN $1 = 'rejected' THEN datetime('now') ELSE rejected_at END,
        updated_at = datetime('now')
      WHERE id = $3`,
      [parsed.status, parsed.reviewerNotes ?? null, parsed.id],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackCommentTransaction(db);
    throw error;
  }
}

export async function recordCommentAttempt(
  input: RecordCommentAttemptInput,
): Promise<number> {
  const parsed = recordCommentAttemptSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN IMMEDIATE");
  let committed = false;
  try {
    const thread = await ensureThreadMutable(db, parsed.commentThreadId);
    if (thread.status !== "approved") {
      throw new Error("Only approved comments can record posting attempts");
    }

    if (parsed.status === "succeeded") {
      await assertSelectedVariantReady(db, parsed.commentThreadId);
      try {
        await assertKillSwitchAllowsComment(db, thread);
      } catch (error) {
        await db.execute("COMMIT");
        committed = true;
        throw error;
      }
      const decision = await getCommentLimitDecision(db, {
        campaignId: thread.campaign_id,
        limitValue: thread.daily_comment_limit,
      });
      if (!decision.allowed) {
        await recordRateLimitEvent(db, {
          campaignId: decision.campaignId,
          action: "comment",
          windowKey: decision.windowKey,
          limitValue: decision.limitValue,
          currentCount: decision.currentCount,
          decision: "blocked",
          summary: decision.summary,
        });
        await db.execute("COMMIT");
        committed = true;
        throw new Error(decision.summary);
      }

      await recordRateLimitEvent(db, {
        campaignId: decision.campaignId,
        action: "comment",
        windowKey: decision.windowKey,
        limitValue: decision.limitValue,
        currentCount: decision.currentCount,
        decision: "allowed",
        summary: decision.summary,
      });
    }

    const result = await db.execute(
      `INSERT INTO comment_attempts (
        comment_thread_id,
        platform,
        status,
        external_comment_url,
        platform_comment_id,
        error_message
      ) VALUES ($1, 'linkedin', $2, $3, $4, $5)`,
      [
        parsed.commentThreadId,
        parsed.status,
        parsed.externalCommentUrl,
        parsed.platformCommentId,
        parsed.errorMessage,
      ],
    );

    if (parsed.status === "succeeded") {
      await db.execute(
        `UPDATE comment_threads
        SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = $1`,
        [parsed.commentThreadId],
      );
    } else {
      await db.execute(
        `UPDATE comment_threads
        SET updated_at = datetime('now')
        WHERE id = $1`,
        [parsed.commentThreadId],
      );
      await upsertErrorQueueItem(db, {
        campaignId: thread.campaign_id,
        sourceType: "manual",
        sourceId: parsed.commentThreadId,
        title: "Comment attempt failed",
        detail: parsed.errorMessage,
        severity: "error",
      });
    }

    await db.execute("COMMIT");
    return result.lastInsertId;
  } catch (error) {
    if (!committed) await rollbackCommentTransaction(db);
    throw error;
  }
}
