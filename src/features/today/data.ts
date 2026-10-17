import {
  listApprovalPage,
  listApprovalsWaitingForReview,
  approvalPostTitle,
} from "@/features/approvals/data";
import { approvalsRoute } from "@/features/approvals/schemas";
import { getConnectionHealth } from "@/features/integrations/data";
import { integrationsRoute } from "@/features/integrations/schemas";
import { listPostsMissingResults } from "@/features/metrics/data";
import { metricsRoute } from "@/features/metrics/schemas";
import { listUnclearPublishOutcomes } from "@/features/publish-reconciliation/data";
import { safetyRoute } from "@/features/safety/schemas";
import { getNextScheduledPost } from "@/features/scheduler/data";
import {
  loadSetupChecklist,
  readSetupPreferences,
} from "@/features/setup/data";
import { setupRoute } from "@/features/setup/schemas";
import type {
  TodayItem,
  TodayOverflow,
  TodaySnapshot,
  TodaySourceKey,
  TodaySources,
} from "@/features/today/types";
import { formatRouteHash } from "@/lib/navigation/route-contract";

/** Most rows of one kind Today lists before linking to the full screen. */
export const TODAY_ROWS_PER_KIND = 5;

function capped<T>(
  rows: readonly T[],
  overflow: Omit<TodayOverflow, "hiddenCount">,
  overflows: TodayOverflow[],
  totalCount: number = rows.length,
): readonly T[] {
  const shown = Math.min(rows.length, TODAY_ROWS_PER_KIND);
  const total = Math.max(totalCount, rows.length);
  if (total > shown) {
    overflows.push({ ...overflow, hiddenCount: total - shown });
  }
  return rows.slice(0, TODAY_ROWS_PER_KIND);
}

/**
 * Pure: maps each feature's summary to Today rows and orders them. Every
 * "does this need the user?" decision was already made by the owner; this
 * only picks the words' inputs and the one link per row.
 */
export function buildTodayItems(sources: TodaySources): TodaySnapshot {
  const needsYou: TodayItem[] = [];
  const overflow: TodayOverflow[] = [];
  const failed: TodaySourceKey[] = [];

  const { setup } = sources;
  if (setup && !setup.complete && !sources.setupHidden) {
    const hasTodo = setup.steps.some((step) => step.state === "todo");
    if (hasTodo) {
      needsYou.push({
        kind: "setup",
        key: "setup",
        href: formatRouteHash(setupRoute),
        doneCount: setup.doneCount,
        total: setup.total,
      });
    }
  }

  if (sources.connections === null) failed.push("connections");
  for (const connection of sources.connections ?? []) {
    needsYou.push({
      kind: "connection",
      key: `connection-${connection.providerKey}`,
      href: formatRouteHash(integrationsRoute, {
        connect: connection.providerKey,
      }),
      providerLabel: connection.providerLabel,
      service: connection.kind,
      problem: connection.problem,
    });
  }

  if (sources.unclearOutcomes === null) failed.push("outcomes");
  const outcomes = capped(
    sources.unclearOutcomes ?? [],
    { kind: "unclear-outcome", href: formatRouteHash(safetyRoute) },
    overflow,
  );
  for (const outcome of outcomes) {
    needsYou.push({
      kind: "unclear-outcome",
      key: `unclear-outcome-${outcome.executionId}`,
      href: formatRouteHash(safetyRoute, { executionId: outcome.executionId }),
      subject: outcome.kind,
      postTitle:
        outcome.kind === "post"
          ? (sources.postTitles.get(outcome.subjectId) ?? null)
          : null,
      campaignName: outcome.campaignName,
      sentAt: outcome.sentAt,
    });
  }

  if (sources.waiting === null) failed.push("approvals");
  const waiting = capped(
    sources.waiting ?? [],
    { kind: "waiting", href: formatRouteHash(approvalsRoute) },
    overflow,
  );
  for (const post of waiting) {
    needsYou.push({
      kind: "waiting",
      key: `waiting-${post.approvalId}`,
      href: formatRouteHash(approvalsRoute, {
        campaignId: post.campaignId,
        approvalId: post.approvalId,
      }),
      postTitle: post.postTitle,
      campaignName: post.campaignName,
    });
  }

  if (sources.missingResults === null) failed.push("results");
  const missing = capped(
    sources.missingResults?.items ?? [],
    { kind: "results-missing", href: formatRouteHash(metricsRoute) },
    overflow,
    sources.missingResults?.totalCount,
  );
  for (const post of missing) {
    needsYou.push({
      kind: "results-missing",
      key: `results-missing-${post.approvalId}`,
      href: formatRouteHash(metricsRoute, {
        campaignId: post.campaignId,
        approvalId: post.approvalId,
      }),
      postTitle: post.postTitle,
      campaignName: post.campaignName,
      publishedAt: post.publishedAt,
    });
  }

  const next = sources.nextScheduled;
  const upcoming: TodayItem | null =
    next === null
      ? null
      : {
          kind: "next-scheduled",
          key: `next-scheduled-${next.approvalId}`,
          href: formatRouteHash(approvalsRoute, {
            campaignId: next.campaignId,
            approvalId: next.approvalId,
          }),
          postTitle: next.postTitle,
          campaignName: next.campaignName,
          scheduledFor: next.scheduledFor,
          timezone: next.timezone,
        };

  const totals = sources.approvalsTotal;
  return {
    needsYou,
    upcoming,
    overflow,
    failed,
    approvalsTruncated: totals !== null && totals.total > totals.loaded,
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

/**
 * Reads every summary through its owner's public `data.ts`, in parallel.
 * A source that fails is reported in `failed`, never thrown, so the rest
 * still shows. Read-only: nothing here approves, schedules or posts.
 */
export async function loadToday({
  signal,
  now,
}: { signal?: AbortSignal; now?: Date } = {}): Promise<TodaySnapshot> {
  const approvalsRead = listApprovalPage();
  const [setup, page, connections, missingResults, unclearOutcomes] =
    await Promise.allSettled([
      loadSetupChecklist(signal),
      approvalsRead,
      getConnectionHealth(signal ? { signal } : {}),
      listPostsMissingResults({
        ...(signal ? { signal } : {}),
        ...(now ? { now } : {}),
      }),
      listUnclearPublishOutcomes(signal ? { signal } : {}),
    ]);
  signal?.throwIfAborted();

  const approvalPage = settledValue(page);
  const approvals = approvalPage?.items ?? null;
  const [waiting, nextScheduled] = approvals
    ? await Promise.all([
        listApprovalsWaitingForReview(
          signal ? { approvals, signal } : { approvals },
        ),
        getNextScheduledPost(signal ? { approvals, signal } : { approvals }),
      ])
    : [null, null];

  return buildTodayItems({
    setup: settledValue(setup),
    setupHidden: readSetupPreferences().dismissed,
    connections: settledValue(connections),
    unclearOutcomes: settledValue(unclearOutcomes),
    postTitles: new Map(
      (approvals ?? []).map((approval) => [
        approval.id,
        approvalPostTitle(approval),
      ]),
    ),
    waiting,
    missingResults: settledValue(missingResults),
    nextScheduled,
    approvalsTotal: approvalPage
      ? { loaded: approvalPage.items.length, total: approvalPage.totalCount }
      : null,
  });
}
