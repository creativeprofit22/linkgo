import type { ApprovalWaitingForReview } from "@/features/approvals/types";
import type {
  ConnectionNeedingAttention,
  ConnectionProblem,
} from "@/features/integrations/types";
import type { PostsMissingResultsPage } from "@/features/metrics/types";
import type {
  PublishExecutionKind,
  UnclearPublishOutcome,
} from "@/features/publish-reconciliation/types";
import type { NextScheduledPost } from "@/features/scheduler/types";
import type { SetupChecklist } from "@/features/setup/types";

/** The kinds of row Today shows, in the order they appear (most urgent first). */
export const TODAY_ITEM_KINDS = [
  "setup",
  "connection",
  "unclear-outcome",
  "waiting",
  "results-missing",
  "next-scheduled",
] as const;

export type TodayItemKind = (typeof TODAY_ITEM_KINDS)[number];

interface TodayItemBase {
  /** Stable key, unique within one snapshot (e.g. `waiting-12`). */
  key: string;
  /** The one link that opens the screen where the user fixes this. */
  href: string;
}

export type TodayItem =
  | (TodayItemBase & { kind: "setup"; doneCount: number; total: number })
  | (TodayItemBase & {
      kind: "connection";
      providerLabel: string;
      service: ConnectionNeedingAttention["kind"];
      problem: ConnectionProblem;
    })
  | (TodayItemBase & {
      kind: "unclear-outcome";
      subject: PublishExecutionKind;
      /** Post hook, or `null` when the post isn't in the loaded list. */
      postTitle: string | null;
      campaignName: string;
      sentAt: string | null;
    })
  | (TodayItemBase & {
      kind: "waiting";
      postTitle: string;
      campaignName: string;
    })
  | (TodayItemBase & {
      kind: "results-missing";
      postTitle: string;
      campaignName: string;
      publishedAt: string;
    })
  | (TodayItemBase & {
      kind: "next-scheduled";
      postTitle: string;
      campaignName: string;
      scheduledFor: string;
      timezone: string;
    });

/** A source Today reads; each can fail on its own. */
export type TodaySourceKey =
  | "approvals"
  | "connections"
  | "results"
  | "outcomes";

/** More rows of one kind than Today lists; the link opens the full screen. */
export interface TodayOverflow {
  kind: TodayItemKind;
  hiddenCount: number;
  href: string;
}

export interface TodaySnapshot {
  /** Rows that need the user now, most urgent first. */
  needsYou: TodayItem[];
  /** The next post due to go out, if any (informational, not a to-do). */
  upcoming: TodayItem | null;
  overflow: TodayOverflow[];
  /** Sources that could not be read this time. */
  failed: TodaySourceKey[];
  /** True when the approvals read hit its cap, so counts may be low. */
  approvalsTruncated: boolean;
}

/** What `loadToday` read, already summarised by each owning feature. */
export interface TodaySources {
  setup: SetupChecklist | null;
  setupHidden: boolean;
  connections: ConnectionNeedingAttention[] | null;
  unclearOutcomes: UnclearPublishOutcome[] | null;
  /** Post titles by approval id, to name unclear outcomes. */
  postTitles: ReadonlyMap<number, string>;
  waiting: ApprovalWaitingForReview[] | null;
  missingResults: PostsMissingResultsPage | null;
  nextScheduled: NextScheduledPost | null;
  /** `null` when approvals failed; drives `next-scheduled` and truncation. */
  approvalsTotal: { loaded: number; total: number } | null;
}
