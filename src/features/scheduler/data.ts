import { getDb } from "@/lib/db";
import { IS_TEST, IS_TAURI } from "@/lib/env";
import {
  schedulerStatusPayloadSchema,
  schedulerTickResultSchema,
} from "@/features/scheduler/schemas";
import type {
  DueScheduleCardItem,
  SchedulerDashboard,
  SchedulerEvent,
  SchedulerPublishAttempt,
  SchedulerSettings,
  SchedulerStatusPayload,
  SchedulerTickResult,
} from "@/features/scheduler/types";

interface CountRow {
  count: number;
}

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

function isInvoke(candidate: unknown): candidate is InvokeFn {
  return typeof candidate === "function";
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInvoke(candidate) ? candidate : null;
}

async function invokeCommand(cmd: string): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) return injected(cmd);
  if (IS_TEST) return null;
  if (!IS_TAURI) throw new Error("Scheduler controls require the Tauri app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd);
}

const stoppedStatus: SchedulerStatusPayload = {
  enabled: false,
  running: false,
  runnerId: null,
  settings: {
    enabled: false,
    pollIntervalSeconds: 60,
    maxJobsPerTick: 1,
    retryBackoffMinutes: 15,
    updatedAt: "",
  },
};

export async function getSchedulerStatus(): Promise<SchedulerStatusPayload> {
  const result = await invokeCommand("linkgo_scheduler_status");
  if (result === null && IS_TEST) return stoppedStatus;
  return schedulerStatusPayloadSchema.parse(result);
}

export async function startScheduler(): Promise<SchedulerStatusPayload> {
  const result = await invokeCommand("linkgo_scheduler_start");
  if (result === null && IS_TEST)
    return { ...stoppedStatus, enabled: true, running: true };
  return schedulerStatusPayloadSchema.parse(result);
}

export async function stopScheduler(): Promise<SchedulerStatusPayload> {
  const result = await invokeCommand("linkgo_scheduler_stop");
  if (result === null && IS_TEST) return stoppedStatus;
  return schedulerStatusPayloadSchema.parse(result);
}

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  const result = await invokeCommand("linkgo_scheduler_tick");
  if (result === null && IS_TEST) {
    return {
      claimed: 0,
      published: 0,
      retryScheduled: 0,
      failed: 0,
      blocked: 0,
    };
  }
  return schedulerTickResultSchema.parse(result);
}

async function getSchedulerSettings(): Promise<SchedulerSettings> {
  const db = await getDb();
  await db.execute(`INSERT OR IGNORE INTO scheduler_settings (id) VALUES (1)`);
  const rows = await db.select<SchedulerSettings[]>(
    `SELECT * FROM scheduler_settings WHERE id = 1 LIMIT 1`,
  );
  const settings = rows[0];
  if (settings === undefined)
    throw new Error("Scheduler settings were not found");
  return settings;
}

export async function listSchedulerDashboard(
  campaignId?: number,
): Promise<SchedulerDashboard> {
  const db = await getDb();
  const settings = await getSchedulerSettings();
  const values = campaignId === undefined ? [] : [campaignId];
  const scheduleCampaignFilter =
    campaignId === undefined ? "" : "AND a.campaign_id = $1";
  const eventCampaignFilter =
    campaignId === undefined ? "" : "AND se.campaign_id = $1";
  const attemptCampaignFilter =
    campaignId === undefined ? "" : "AND a.campaign_id = $1";

  const [safetyRows, pendingRows, dueRows, failedRows] = await Promise.all([
    db.select<{ global_kill_switch: number; kill_switch_reason: string }[]>(
      `SELECT global_kill_switch, kill_switch_reason FROM safety_settings WHERE id = 1 LIMIT 1`,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
      FROM schedule_jobs sj
      INNER JOIN approvals a ON a.id = sj.approval_id
      WHERE sj.status = 'scheduled' ${scheduleCampaignFilter}`,
      values,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
      FROM schedule_jobs sj
      INNER JOIN approvals a ON a.id = sj.approval_id
      WHERE sj.status = 'scheduled'
        AND datetime(sj.scheduled_for) <= datetime('now')
        AND (sj.next_attempt_at IS NULL OR datetime(sj.next_attempt_at) <= datetime('now'))
        ${scheduleCampaignFilter}`,
      values,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
      FROM schedule_jobs sj
      INNER JOIN approvals a ON a.id = sj.approval_id
      WHERE sj.status = 'failed' ${scheduleCampaignFilter}`,
      values,
    ),
  ]);

  const [dueJobs, recentEvents, recentAttempts] = await Promise.all([
    db.select<DueScheduleCardItem[]>(
      `SELECT
        sj.*,
        a.campaign_id,
        a.status AS approval_status,
        c.name AS campaign_name,
        c.status AS campaign_status,
        dv.hook AS variant_hook
      FROM schedule_jobs sj
      INNER JOIN approvals a ON a.id = sj.approval_id
      INNER JOIN campaigns c ON c.id = a.campaign_id
      INNER JOIN draft_variants dv ON dv.id = a.draft_variant_id
      WHERE sj.status = 'scheduled'
        AND (datetime(sj.scheduled_for) <= datetime('now', '+24 hours') OR sj.last_error <> '')
        ${scheduleCampaignFilter}
      ORDER BY datetime(sj.scheduled_for) ASC, sj.id ASC
      LIMIT 20`,
      values,
    ),
    db.select<SchedulerEvent[]>(
      `SELECT se.*, c.name AS campaign_name
      FROM scheduler_events se
      LEFT JOIN campaigns c ON c.id = se.campaign_id
      WHERE 1 = 1 ${eventCampaignFilter}
      ORDER BY datetime(se.created_at) DESC, se.id DESC
      LIMIT 50`,
      values,
    ),
    db.select<SchedulerPublishAttempt[]>(
      `SELECT pa.*, a.campaign_id, c.name AS campaign_name
      FROM publish_attempts pa
      LEFT JOIN approvals a ON a.id = pa.approval_id
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      WHERE pa.schedule_job_id IS NOT NULL ${attemptCampaignFilter}
      ORDER BY datetime(pa.created_at) DESC, pa.id DESC
      LIMIT 25`,
      values,
    ),
  ]);

  const safety = safetyRows[0];
  return {
    settings,
    summary: {
      pendingJobs: pendingRows[0]?.count ?? 0,
      dueJobs: dueRows[0]?.count ?? 0,
      failedJobs: failedRows[0]?.count ?? 0,
      recentAttempts: recentAttempts.length,
    },
    dueJobs,
    recentEvents,
    recentAttempts,
    globalKillSwitchEnabled: safety?.global_kill_switch === 1,
    killSwitchReason: safety?.kill_switch_reason ?? "",
  };
}
