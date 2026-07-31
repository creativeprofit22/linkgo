import { getDb } from "@/lib/db";
import { IS_TAURI, IS_TEST } from "@/lib/env";
import {
  autopilotPlannerStatusPayloadSchema,
  autopilotPlannerTickResultSchema,
} from "@/features/autopilot-planner/schemas";
import type {
  AutopilotPlanDashboardItem,
  AutopilotPlannerDashboard,
  AutopilotPlannerEvent,
  AutopilotPlannerStatusPayload,
  AutopilotPlannerTickResult,
} from "@/features/autopilot-planner/types";

interface CountRow {
  count: number;
}

interface SafetyRow {
  global_kill_switch: number;
  kill_switch_reason: string;
}

type InvokeFn = (command: string, args?: unknown) => Promise<unknown>;

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

async function invokePlannerCommand(command: string): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) return injected(command);
  if (IS_TEST) return null;
  if (!IS_TAURI) {
    throw new Error(
      "Autopilot planner controls require the Linkgo desktop app",
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command);
}

const stoppedStatus: AutopilotPlannerStatusPayload = {
  enabled: false,
  running: false,
  runnerId: null,
  settings: {
    enabled: false,
    pollIntervalMinutes: 60,
    maxBatchesPerTick: 3,
    updatedAt: "",
  },
};

export async function getAutopilotPlannerStatus(): Promise<AutopilotPlannerStatusPayload> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_status");
  if (result === null && IS_TEST) return stoppedStatus;
  return autopilotPlannerStatusPayloadSchema.parse(result);
}

export async function startAutopilotPlanner(): Promise<AutopilotPlannerStatusPayload> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_start");
  if (result === null && IS_TEST) {
    return {
      ...stoppedStatus,
      enabled: true,
      running: true,
      runnerId: "test-autopilot",
      settings: { ...stoppedStatus.settings, enabled: true },
    };
  }
  return autopilotPlannerStatusPayloadSchema.parse(result);
}

export async function stopAutopilotPlanner(): Promise<AutopilotPlannerStatusPayload> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_stop");
  if (result === null && IS_TEST) return stoppedStatus;
  return autopilotPlannerStatusPayloadSchema.parse(result);
}

export async function runAutopilotPlannerTick(): Promise<AutopilotPlannerTickResult> {
  const result = await invokePlannerCommand("linkgo_autopilot_planner_tick");
  if (result === null && IS_TEST) {
    return { claimed: 0, planned: 0, skipped: 0, failed: 0, blocked: 0 };
  }
  return autopilotPlannerTickResultSchema.parse(result);
}

export async function listAutopilotPlannerDashboard(
  campaignId?: number,
): Promise<AutopilotPlannerDashboard> {
  const db = await getDb();
  const values = campaignId === undefined ? [] : [campaignId];
  const sourceCampaignFilter =
    campaignId === undefined ? "" : "AND sib.campaign_id = $1";
  const planCampaignFilter =
    campaignId === undefined ? "" : "AND ap.campaign_id = $1";
  const eventCampaignFilter =
    campaignId === undefined ? "" : "AND ape.campaign_id = $1";

  const [
    safetyRows,
    eligibleRows,
    plannedRows,
    skippedRows,
    recentFailureRows,
    recentPlans,
    recentEvents,
  ] = await Promise.all([
    db.select<SafetyRow[]>(
      `SELECT global_kill_switch, kill_switch_reason
         FROM safety_settings
        WHERE id = 1
        LIMIT 1`,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
         FROM source_import_batches sib
         INNER JOIN campaigns c ON c.id = sib.campaign_id
         LEFT JOIN autopilot_plans ap ON ap.source_import_batch_id = sib.id
        WHERE c.status = 'active'
          AND c.auto_pilot = 1
          AND sib.status IN ('completed', 'completed_with_errors')
          AND sib.accepted_count > 0
          AND ap.id IS NULL
          ${sourceCampaignFilter}`,
      values,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
         FROM autopilot_plans ap
        WHERE ap.status = 'planned' ${planCampaignFilter}`,
      values,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
         FROM autopilot_plans ap
        WHERE ap.status = 'skipped' ${planCampaignFilter}`,
      values,
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) AS count
         FROM autopilot_planner_events ape
        WHERE ape.event_type = 'batch_failed'
          AND datetime(ape.created_at) >= datetime('now', '-7 days')
          ${eventCampaignFilter}`,
      values,
    ),
    db.select<AutopilotPlanDashboardItem[]>(
      `SELECT
          ap.*,
          c.name AS campaign_name,
          c.status AS campaign_status,
          sib.status AS source_batch_status,
          sib.total_count AS source_total_count,
          sib.accepted_count AS source_accepted_count,
          (
            SELECT COUNT(*)
              FROM source_import_items sii
             WHERE sii.source_import_batch_id = ap.source_import_batch_id
               AND sii.status = 'accepted'
               AND sii.candidate_post_id IS NOT NULL
          ) AS current_candidate_count,
          cbi.title AS backlog_title,
          cbi.status AS backlog_status,
          cbi.work_type AS backlog_work_type,
          wr.title AS workflow_title,
          wr.status AS workflow_status,
          wr.current_step_key AS workflow_current_step_key
        FROM autopilot_plans ap
        INNER JOIN campaigns c ON c.id = ap.campaign_id
        INNER JOIN source_import_batches sib ON sib.id = ap.source_import_batch_id
        LEFT JOIN campaign_backlog_items cbi ON cbi.id = ap.campaign_backlog_item_id
        LEFT JOIN workflow_runs wr ON wr.id = ap.workflow_run_id
        WHERE 1 = 1 ${planCampaignFilter}
        ORDER BY datetime(ap.created_at) DESC, ap.id DESC
        LIMIT 30`,
      values,
    ),
    db.select<AutopilotPlannerEvent[]>(
      `SELECT
          ape.*,
          c.name AS campaign_name,
          c.status AS campaign_status
        FROM autopilot_planner_events ape
        LEFT JOIN campaigns c ON c.id = ape.campaign_id
        WHERE 1 = 1 ${eventCampaignFilter}
        ORDER BY datetime(ape.created_at) DESC, ape.id DESC
        LIMIT 50`,
      values,
    ),
  ]);

  const safety = safetyRows[0];
  return {
    summary: {
      eligibleBatches: eligibleRows[0]?.count ?? 0,
      plannedBatches: plannedRows[0]?.count ?? 0,
      skippedBatches: skippedRows[0]?.count ?? 0,
      recentFailures: recentFailureRows[0]?.count ?? 0,
    },
    recentPlans,
    recentEvents,
    globalKillSwitchEnabled: safety?.global_kill_switch === 1,
    killSwitchReason: safety?.kill_switch_reason ?? "",
  };
}
