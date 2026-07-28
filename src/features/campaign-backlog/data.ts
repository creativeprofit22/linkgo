import { invoke } from "@tauri-apps/api/core";

import {
  campaignBacklogFiltersSchema,
  createCampaignBacklogItemSchema,
  setCampaignBacklogItemStatusSchema,
  updateCampaignBacklogItemSchema,
} from "@/features/campaign-backlog/schemas";
import {
  formatUtcAsDateTimeLocal,
  localDateTimeToUtc,
} from "@/features/campaign-backlog/time-zone";
import {
  CAMPAIGN_BACKLOG_CREATE_COMMAND,
  CAMPAIGN_BACKLOG_SET_STATUS_COMMAND,
  CAMPAIGN_BACKLOG_UPDATE_COMMAND,
} from "@/features/campaign-backlog/types";
import type {
  CampaignBacklogDashboard,
  CampaignBacklogFilters,
  CampaignBacklogItemDetail,
  CampaignBacklogMutationCommandResult,
  CampaignBacklogRecurrence,
  CampaignBacklogStatusMutationCommandResult,
  CampaignBacklogStatusResult,
  CreateCampaignBacklogItemInput,
  SetCampaignBacklogItemStatusInput,
  UpdateCampaignBacklogItemInput,
} from "@/features/campaign-backlog/types";
import { getDb } from "@/lib/db";

const HISTORY_LIMIT = 100;

async function invokeBacklogCommand<TResult>(
  command: string,
  input: unknown,
): Promise<TResult> {
  try {
    return await invoke<TResult>(command, { input });
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function addFilter(
  clauses: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  values.push(value);
  clauses.push(`${column} = $${values.length}`);
}

export async function getCampaignBacklogDashboard(
  filters: CampaignBacklogFilters,
): Promise<CampaignBacklogDashboard> {
  const parsed = campaignBacklogFiltersSchema.parse(filters);
  const db = await getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (parsed.campaignId !== null) {
    addFilter(clauses, values, "cbi.campaign_id", parsed.campaignId);
  }
  if (parsed.owner !== "all") {
    addFilter(clauses, values, "cbi.owner_type", parsed.owner);
  }

  const sharedWhere =
    clauses.length === 0 ? "" : `AND ${clauses.join(" AND ")}`;
  const statusClause =
    parsed.view === "open"
      ? "cbi.status IN ('pending', 'in_progress', 'blocked')"
      : "cbi.status IN ('completed', 'cancelled')";
  const orderClause =
    parsed.view === "open"
      ? "cbi.due_at ASC, cbi.id ASC"
      : "COALESCE(cbi.completed_at, cbi.cancelled_at) DESC, cbi.id DESC";
  const historyIndexClause =
    parsed.view === "history"
      ? `INDEXED BY ${
          parsed.campaignId === null
            ? "idx_campaign_backlog_history_terminal_at"
            : "idx_campaign_backlog_campaign_history_terminal_at"
        }`
      : "";
  const limitClause = parsed.view === "history" ? `LIMIT ${HISTORY_LIMIT}` : "";

  const [items, summaryRows, totalRows] = await Promise.all([
    db.select<CampaignBacklogItemDetail[]>(
      `SELECT cbi.*, c.name AS campaign_name, c.status AS campaign_status
       FROM campaign_backlog_items AS cbi ${historyIndexClause}
       INNER JOIN campaigns c ON c.id = cbi.campaign_id
       WHERE ${statusClause} ${sharedWhere}
       ORDER BY ${orderClause}
       ${limitClause}`,
      values,
    ),
    db.select<
      Array<{
        due_now: number;
        in_progress: number;
        blocked: number;
        linkgo_owned: number;
      }>
    >(
      `SELECT
         COALESCE(SUM(CASE WHEN cbi.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 1 ELSE 0 END), 0) AS due_now,
         COALESCE(SUM(CASE WHEN cbi.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress,
         COALESCE(SUM(CASE WHEN cbi.status = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
         COALESCE(SUM(CASE WHEN cbi.owner_type = 'linkgo' THEN 1 ELSE 0 END), 0) AS linkgo_owned
       FROM campaign_backlog_items cbi
       WHERE cbi.status IN ('pending', 'in_progress', 'blocked') ${sharedWhere}`,
      values,
    ),
    db.select<Array<{ total_items: number }>>(
      "SELECT COUNT(*) AS total_items FROM campaign_backlog_items",
    ),
  ]);

  const summary = summaryRows[0] ?? {
    due_now: 0,
    in_progress: 0,
    blocked: 0,
    linkgo_owned: 0,
  };
  return {
    items,
    summary: {
      dueNow: summary.due_now,
      inProgress: summary.in_progress,
      blocked: summary.blocked,
      linkgoOwned: summary.linkgo_owned,
    },
    totalItems: totalRows[0]?.total_items ?? 0,
    asOf: new Date().toISOString(),
  };
}

export async function createCampaignBacklogItem(
  input: CreateCampaignBacklogItemInput,
): Promise<CampaignBacklogItemDetail> {
  const parsed = createCampaignBacklogItemSchema.parse(input);
  const result =
    await invokeBacklogCommand<CampaignBacklogMutationCommandResult>(
      CAMPAIGN_BACKLOG_CREATE_COMMAND,
      parsed,
    );
  return result.item;
}

export async function updateCampaignBacklogItem(
  input: UpdateCampaignBacklogItemInput,
): Promise<CampaignBacklogItemDetail> {
  const parsed = updateCampaignBacklogItemSchema.parse(input);
  const result =
    await invokeBacklogCommand<CampaignBacklogMutationCommandResult>(
      CAMPAIGN_BACKLOG_UPDATE_COMMAND,
      parsed,
    );
  return result.item;
}

export function getNextCampaignBacklogDueAt(
  dueAt: string,
  recurrence: Exclude<CampaignBacklogRecurrence, "none">,
  recurrenceTimeZone: string,
  now: Date = new Date(),
): string {
  const dueLocal = formatUtcAsDateTimeLocal(dueAt, recurrenceTimeZone);
  if (dueLocal === "")
    throw new Error("Due time or recurrence time zone is invalid");
  const localCursor = new Date(`${dueLocal}:00.000Z`);
  const days = recurrence === "daily" ? 1 : 7;

  for (let interval = 0; interval < 10_000; interval += 1) {
    localCursor.setUTCDate(localCursor.getUTCDate() + days);
    const nextLocal = localCursor.toISOString().slice(0, 16);
    const nextDueAt = localDateTimeToUtc(nextLocal, recurrenceTimeZone);
    if (Date.parse(nextDueAt) > now.getTime()) return nextDueAt;
  }

  throw new Error("The next recurring due time could not be calculated");
}

export async function setCampaignBacklogItemStatus(
  input: SetCampaignBacklogItemStatusInput,
): Promise<CampaignBacklogStatusResult> {
  const parsed = setCampaignBacklogItemStatusSchema.parse(input);
  const result =
    await invokeBacklogCommand<CampaignBacklogStatusMutationCommandResult>(
      CAMPAIGN_BACKLOG_SET_STATUS_COMMAND,
      parsed,
    );
  return result;
}
