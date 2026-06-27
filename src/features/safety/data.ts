import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  assertCommentLimitSchema,
  assertSafetyKillSwitchOffSchema,
  assertSchedulePostLimitSchema,
  recordRateLimitEventSchema,
  recordSafetyAuditEventSchema,
  setErrorQueueItemStatusSchema,
  setGlobalKillSwitchSchema,
  upsertErrorQueueItemSchema,
} from "@/features/safety/schemas";
import type {
  AssertCommentLimitInput,
  AssertSchedulePostLimitInput,
  CommentLimitDecision,
  ErrorQueueItem,
  ErrorQueueStatus,
  RateLimitEvent,
  RecordRateLimitEventInput,
  RecordSafetyAuditEventInput,
  SafetyAuditEvent,
  SafetyDashboard,
  SafetyKillSwitchContext,
  SafetySettings,
  SchedulePostLimitDecision,
  SetErrorQueueItemStatusInput,
  SetGlobalKillSwitchInput,
  UpsertErrorQueueItemInput,
} from "@/features/safety/types";

interface CountRow {
  count: number;
}

interface CampaignLimitRow {
  id: number;
  daily_post_limit: number;
  daily_comment_limit: number;
}

interface ErrorQueueItemWithCampaignRow extends ErrorQueueItem {
  campaign_name: string | null;
  campaign_status: string | null;
}

const ERROR_STATUS_TRANSITIONS: Record<ErrorQueueStatus, ErrorQueueStatus[]> = {
  open: ["in_progress", "failed"],
  in_progress: ["awaiting_review", "failed"],
  awaiting_review: ["resolved", "failed"],
  resolved: ["in_progress"],
  failed: ["in_progress"],
};

function stringifyMetadata(metadata: unknown): string {
  try {
    return JSON.stringify(metadata ?? {});
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function getWindowKey(scheduledFor: string): string {
  return scheduledFor.trim().slice(0, 10);
}

export async function countScheduledPostsForLimit(
  db: LinkgoDatabase,
  campaignId: number,
  scheduledFor: string,
): Promise<number> {
  const countRows = await db.select<CountRow[]>(
    `SELECT COUNT(*) AS count
    FROM schedule_jobs sj
    INNER JOIN approvals a ON a.id = sj.approval_id
    WHERE a.campaign_id = $1
      AND date(sj.scheduled_for) = date($2)
      AND sj.status IN ('scheduled', 'completed')`,
    [campaignId, scheduledFor],
  );
  return countRows[0]?.count ?? 0;
}

export async function countCommentsForLimit(
  db: LinkgoDatabase,
  campaignId: number,
  windowDate: string,
): Promise<number> {
  const countRows = await db.select<CountRow[]>(
    `SELECT COUNT(*) AS count
    FROM comment_attempts ca
    INNER JOIN comment_threads ct ON ct.id = ca.comment_thread_id
    WHERE ct.campaign_id = $1
      AND date(ca.created_at) = date($2)
      AND ca.status = 'succeeded'`,
    [campaignId, windowDate],
  );
  return countRows[0]?.count ?? 0;
}

async function rollbackSafetyTransaction(db: LinkgoDatabase): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}

export async function getSafetySettings(): Promise<SafetySettings> {
  const db = await getDb();
  await db.execute(`INSERT OR IGNORE INTO safety_settings (id) VALUES (1)`);
  const rows = await db.select<SafetySettings[]>(
    `SELECT * FROM safety_settings WHERE id = 1 LIMIT 1`,
  );
  const settings = rows[0];
  if (settings === undefined) throw new Error("Safety settings were not found");
  return settings;
}

export async function setGlobalKillSwitch(
  input: SetGlobalKillSwitchInput,
): Promise<void> {
  const parsed = setGlobalKillSwitchSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    await db.execute(`INSERT OR IGNORE INTO safety_settings (id) VALUES (1)`);
    await db.execute(
      `UPDATE safety_settings
      SET global_kill_switch = $1,
        kill_switch_reason = $2,
        updated_at = datetime('now')
      WHERE id = 1`,
      [parsed.enabled ? 1 : 0, parsed.reason],
    );
    await recordSafetyAuditEvent(db, {
      subjectType: "safety_settings",
      subjectId: 1,
      eventType: parsed.enabled
        ? "kill_switch_enabled"
        : "kill_switch_disabled",
      severity: parsed.enabled ? "block" : "info",
      summary: parsed.enabled
        ? `Global kill switch enabled${parsed.reason ? `: ${parsed.reason}` : ""}`
        : "Global kill switch disabled",
      metadata: { reason: parsed.reason },
    });
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackSafetyTransaction(db);
    throw error;
  }
}

export async function listSafetyDashboard(
  campaignId?: number,
): Promise<SafetyDashboard> {
  const db = await getDb();
  await db.execute(`INSERT OR IGNORE INTO safety_settings (id) VALUES (1)`);

  const values = campaignId === undefined ? [] : [campaignId];
  const campaignFilter = campaignId === undefined ? "" : "AND campaign_id = $1";
  const nullableCampaignFilter =
    campaignId === undefined ? "" : "AND eqi.campaign_id = $1";
  const auditCampaignFilter =
    campaignId === undefined ? "" : "AND campaign_id = $1";

  const [settingsRows, openErrorRows, blockedRows, allowedRows, auditRows] =
    await Promise.all([
      db.select<SafetySettings[]>(
        `SELECT * FROM safety_settings WHERE id = 1 LIMIT 1`,
      ),
      db.select<CountRow[]>(
        `SELECT COUNT(*) AS count FROM error_queue_items eqi
        WHERE eqi.status IN ('open', 'in_progress', 'awaiting_review') ${nullableCampaignFilter}`,
        values,
      ),
      db.select<CountRow[]>(
        `SELECT COUNT(*) AS count FROM rate_limit_events
        WHERE decision = 'blocked' AND date(created_at) = date('now') ${campaignFilter}`,
        values,
      ),
      db.select<CountRow[]>(
        `SELECT COUNT(*) AS count FROM rate_limit_events
        WHERE decision = 'allowed' AND date(created_at) = date('now') ${campaignFilter}`,
        values,
      ),
      db.select<CountRow[]>(
        `SELECT COUNT(*) AS count FROM safety_audit_events
        WHERE 1 = 1 ${auditCampaignFilter}`,
        values,
      ),
    ]);

  const [errorQueueItems, rateLimitEvents, auditEvents] = await Promise.all([
    db.select<ErrorQueueItemWithCampaignRow[]>(
      `SELECT
        eqi.*,
        c.name AS campaign_name,
        c.status AS campaign_status
      FROM error_queue_items eqi
      LEFT JOIN campaigns c ON c.id = eqi.campaign_id
      WHERE 1 = 1 ${nullableCampaignFilter}
      ORDER BY eqi.status IN ('resolved'), datetime(eqi.updated_at) DESC, eqi.id DESC
      LIMIT 50`,
      values,
    ),
    db.select<RateLimitEvent[]>(
      `SELECT * FROM rate_limit_events
      WHERE 1 = 1 ${campaignFilter}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 50`,
      values,
    ),
    db.select<SafetyAuditEvent[]>(
      `SELECT * FROM safety_audit_events
      WHERE 1 = 1 ${auditCampaignFilter}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 50`,
      values,
    ),
  ]);

  const settings = settingsRows[0];
  if (settings === undefined) throw new Error("Safety settings were not found");

  return {
    settings,
    summary: {
      openErrors: openErrorRows[0]?.count ?? 0,
      blockedToday: blockedRows[0]?.count ?? 0,
      allowedToday: allowedRows[0]?.count ?? 0,
      auditEvents: auditRows[0]?.count ?? 0,
    },
    errorQueueItems,
    rateLimitEvents,
    auditEvents,
  };
}

export async function setErrorQueueItemStatus(
  input: SetErrorQueueItemStatusInput,
): Promise<void> {
  const parsed = setErrorQueueItemStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const rows = await db.select<ErrorQueueItemWithCampaignRow[]>(
      `SELECT
        eqi.*,
        c.name AS campaign_name,
        c.status AS campaign_status
      FROM error_queue_items eqi
      LEFT JOIN campaigns c ON c.id = eqi.campaign_id
      WHERE eqi.id = $1
      LIMIT 1`,
      [parsed.id],
    );
    const item = rows[0];
    if (item === undefined) throw new Error("Error queue item was not found");
    if (item.campaign_status === "archived") {
      throw new Error("Archived campaign error items cannot be changed");
    }
    if (!ERROR_STATUS_TRANSITIONS[item.status].includes(parsed.status)) {
      throw new Error("Unsupported error queue status transition");
    }

    await db.execute(
      `UPDATE error_queue_items
      SET status = $1,
        resolution_notes = $2,
        updated_at = datetime('now')
      WHERE id = $3`,
      [parsed.status, parsed.resolutionNotes, parsed.id],
    );
    await recordSafetyAuditEvent(db, {
      campaignId: item.campaign_id,
      subjectType: "error_queue_item",
      subjectId: item.id,
      eventType: "error_item_updated",
      severity: "info",
      summary: `Error item moved from ${item.status} to ${parsed.status}`,
      metadata: { resolutionNotes: parsed.resolutionNotes },
    });
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackSafetyTransaction(db);
    throw error;
  }
}

export async function recordSafetyAuditEvent(
  db: LinkgoDatabase,
  input: RecordSafetyAuditEventInput,
): Promise<number> {
  const parsed = recordSafetyAuditEventSchema.parse(input);
  const result = await db.execute(
    `INSERT INTO safety_audit_events (
      campaign_id,
      subject_type,
      subject_id,
      event_type,
      severity,
      summary,
      metadata_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      parsed.campaignId ?? null,
      parsed.subjectType,
      parsed.subjectId ?? null,
      parsed.eventType,
      parsed.severity,
      parsed.summary,
      stringifyMetadata(parsed.metadata),
    ],
  );
  return result.lastInsertId;
}

export async function recordRateLimitEvent(
  db: LinkgoDatabase,
  input: RecordRateLimitEventInput,
): Promise<number> {
  const parsed = recordRateLimitEventSchema.parse(input);
  const result = await db.execute(
    `INSERT INTO rate_limit_events (
      campaign_id,
      action,
      window_key,
      limit_value,
      current_count,
      decision,
      summary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      parsed.campaignId,
      parsed.action,
      parsed.windowKey,
      parsed.limitValue,
      parsed.currentCount,
      parsed.decision,
      parsed.summary,
    ],
  );
  return result.lastInsertId;
}

export async function upsertErrorQueueItem(
  db: LinkgoDatabase,
  input: UpsertErrorQueueItemInput,
): Promise<number> {
  const parsed = upsertErrorQueueItemSchema.parse(input);

  const existingRows =
    parsed.sourceId === undefined || parsed.sourceId === null
      ? []
      : await db.select<ErrorQueueItem[]>(
          `SELECT * FROM error_queue_items
          WHERE source_type = $1
            AND source_id = $2
            AND status IN ('open', 'in_progress', 'awaiting_review')
          LIMIT 1`,
          [parsed.sourceType, parsed.sourceId],
        );
  const existing = existingRows[0];

  if (existing !== undefined) {
    await db.execute(
      `UPDATE error_queue_items
      SET campaign_id = $1,
        title = $2,
        detail = $3,
        severity = $4,
        updated_at = datetime('now')
      WHERE id = $5`,
      [
        parsed.campaignId ?? null,
        parsed.title,
        parsed.detail,
        parsed.severity,
        existing.id,
      ],
    );
    await recordSafetyAuditEvent(db, {
      campaignId: parsed.campaignId ?? existing.campaign_id,
      subjectType: "error_queue_item",
      subjectId: existing.id,
      eventType: "error_item_updated",
      severity: "warning",
      summary: `Error item updated: ${parsed.title}`,
      metadata: {
        sourceType: parsed.sourceType,
        sourceId: parsed.sourceId ?? null,
      },
    });
    return existing.id;
  }

  const result = await db.execute(
    `INSERT INTO error_queue_items (
      campaign_id,
      source_type,
      source_id,
      title,
      detail,
      severity,
      status,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'open', datetime('now'))`,
    [
      parsed.campaignId ?? null,
      parsed.sourceType,
      parsed.sourceId ?? null,
      parsed.title,
      parsed.detail,
      parsed.severity,
    ],
  );
  await recordSafetyAuditEvent(db, {
    campaignId: parsed.campaignId ?? null,
    subjectType: "error_queue_item",
    subjectId: result.lastInsertId,
    eventType: "error_item_created",
    severity: "warning",
    summary: `Error item created: ${parsed.title}`,
    metadata: {
      sourceType: parsed.sourceType,
      sourceId: parsed.sourceId ?? null,
    },
  });
  return result.lastInsertId;
}

export async function assertSafetyKillSwitchOff(
  db: LinkgoDatabase,
  context: SafetyKillSwitchContext,
): Promise<void> {
  const parsed = assertSafetyKillSwitchOffSchema.parse(context);
  await db.execute(`INSERT OR IGNORE INTO safety_settings (id) VALUES (1)`);
  const rows = await db.select<SafetySettings[]>(
    `SELECT * FROM safety_settings WHERE id = 1 LIMIT 1`,
  );
  const settings = rows[0];
  if (settings?.global_kill_switch === 1) {
    await recordSafetyAuditEvent(db, {
      campaignId: parsed.campaignId ?? null,
      subjectType: parsed.subjectType,
      subjectId: parsed.subjectId ?? null,
      eventType:
        parsed.subjectType === "schedule_job"
          ? "schedule_blocked"
          : "agent_run_failed",
      severity: "block",
      summary: `${parsed.summary} blocked by global kill switch`,
      metadata: { reason: settings.kill_switch_reason },
    });
    throw new Error(
      settings.kill_switch_reason
        ? `Global kill switch is enabled: ${settings.kill_switch_reason}`
        : "Global kill switch is enabled",
    );
  }
}

export async function getSchedulePostLimitDecision(
  db: LinkgoDatabase,
  input: AssertSchedulePostLimitInput,
): Promise<SchedulePostLimitDecision> {
  const parsed = assertSchedulePostLimitSchema.parse(input);
  const campaignRows =
    parsed.limitValue === undefined
      ? await db.select<CampaignLimitRow[]>(
          `SELECT id, daily_post_limit FROM campaigns WHERE id = $1 LIMIT 1`,
          [parsed.campaignId],
        )
      : [];
  const campaign = campaignRows[0];
  if (parsed.limitValue === undefined && campaign === undefined) {
    throw new Error("Campaign was not found");
  }

  const windowKey = getWindowKey(parsed.scheduledFor);
  const currentCount = await countScheduledPostsForLimit(
    db,
    parsed.campaignId,
    parsed.scheduledFor,
  );
  const limitValue = parsed.limitValue ?? campaign?.daily_post_limit ?? 0;
  const allowed = currentCount < limitValue;
  const summary = allowed
    ? `Schedule allowed for ${windowKey}: ${currentCount}/${limitValue} used`
    : `Daily post scheduling limit reached for ${windowKey}: ${currentCount}/${limitValue} used`;

  return {
    campaignId: parsed.campaignId,
    windowKey,
    limitValue,
    currentCount,
    allowed,
    summary,
  };
}

export async function assertSchedulePostLimit(
  db: LinkgoDatabase,
  input: AssertSchedulePostLimitInput,
): Promise<SchedulePostLimitDecision> {
  const parsed = assertSchedulePostLimitSchema.parse(input);
  const decision = await getSchedulePostLimitDecision(db, input);

  if (!decision.allowed) {
    await recordRateLimitEvent(db, {
      campaignId: decision.campaignId,
      action: "schedule_post",
      windowKey: decision.windowKey,
      limitValue: decision.limitValue,
      currentCount: decision.currentCount,
      decision: "blocked",
      summary: decision.summary,
    });
    await recordSafetyAuditEvent(db, {
      campaignId: decision.campaignId,
      subjectType: "approval",
      ...(parsed.approvalId === undefined
        ? {}
        : { subjectId: parsed.approvalId }),
      eventType: "schedule_blocked",
      severity: "block",
      summary: decision.summary,
      metadata: {
        windowKey: decision.windowKey,
        limitValue: decision.limitValue,
        currentCount: decision.currentCount,
      },
    });
    throw new Error(decision.summary);
  }

  return decision;
}

export async function getCommentLimitDecision(
  db: LinkgoDatabase,
  input: AssertCommentLimitInput,
): Promise<CommentLimitDecision> {
  const parsed = assertCommentLimitSchema.parse(input);
  const campaignRows =
    parsed.limitValue === undefined
      ? await db.select<CampaignLimitRow[]>(
          `SELECT id, daily_comment_limit FROM campaigns WHERE id = $1 LIMIT 1`,
          [parsed.campaignId],
        )
      : [];
  const campaign = campaignRows[0];
  if (parsed.limitValue === undefined && campaign === undefined) {
    throw new Error("Campaign was not found");
  }

  const commentedAt = parsed.commentedAt ?? new Date().toISOString();
  const windowKey = getWindowKey(commentedAt);
  const currentCount = await countCommentsForLimit(
    db,
    parsed.campaignId,
    commentedAt,
  );
  const limitValue = parsed.limitValue ?? campaign?.daily_comment_limit ?? 0;
  const allowed = currentCount < limitValue;
  const summary = allowed
    ? `Comment allowed for ${windowKey}: ${currentCount}/${limitValue} used`
    : `Daily comment limit reached for ${windowKey}: ${currentCount}/${limitValue} used`;

  return {
    campaignId: parsed.campaignId,
    windowKey,
    limitValue,
    currentCount,
    allowed,
    summary,
  };
}

export async function assertCommentLimit(
  db: LinkgoDatabase,
  input: AssertCommentLimitInput,
): Promise<CommentLimitDecision> {
  const decision = await getCommentLimitDecision(db, input);

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
    throw new Error(decision.summary);
  }

  return decision;
}
