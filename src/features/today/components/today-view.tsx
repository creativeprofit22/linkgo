import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  PenLine,
  PlugZap,
  RefreshCw,
  Rocket,
  Sun,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { draftsRoute } from "@/features/drafts/schemas";
import { findFirstIdeaHref } from "@/features/setup/data";
import { useToday } from "@/features/today/hooks/use-today";
import type {
  TodayItem,
  TodayItemKind,
  TodayOverflow,
  TodaySnapshot,
  TodaySourceKey,
} from "@/features/today/types";
import { formatRouteHash } from "@/lib/navigation/route-contract";
import { cn } from "@/lib/utils";

/** Buttons wrap instead of overflowing on narrow windows with large text. */
const WRAPPING_BUTTON =
  "h-auto min-h-8 max-w-full text-center whitespace-normal";

const SOURCE_LABEL: Record<TodaySourceKey, string> = {
  connections: "your connected accounts",
  outcomes: "posts that may not have gone out",
  approvals: "posts waiting for your OK",
  results: "posts that need results",
};

const OVERFLOW_LABEL: Partial<Record<TodayItemKind, (n: number) => string>> = {
  waiting: (n) =>
    `${n} more ${n === 1 ? "post is" : "posts are"} waiting for your OK.`,
  "results-missing": (n) =>
    `${n} more ${n === 1 ? "post needs" : "posts need"} results.`,
};

interface RowCopy {
  title: string;
  description: string;
  action: string;
  icon: React.ReactNode;
}

function quoted(title: string): string {
  return `“${title}”`;
}

function formatWhen(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "at an unknown time";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

const WALL_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Formats a scheduled time. Native storage keeps `scheduledFor` as a naive
 * wall-clock time meant to be read in `timezone` (see `approval_scheduling.rs`),
 * so it is shown as typed — never re-converted through the browser's zone —
 * with the zone label appended when it is not "local", matching the Approvals
 * card. Values carrying an explicit offset are real instants and are shown in
 * the stored zone instead.
 */
function formatScheduledWhen(value: string, timeZone: string): string {
  const match = WALL_TIME.exec(value.trim());
  if (match === null) return "at an unknown time";
  const [, y, mo, d, h, mi, s, offset] = match;
  const zone = timeZone.trim();
  const label = zone === "" || zone === "local" ? "" : ` (${zone})`;
  if (offset !== undefined) return `${formatWhen(value, zone)}${label}`;
  const date = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s ?? "0"),
    ),
  );
  if (Number.isNaN(date.getTime())) return "at an unknown time";
  const wall = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
  return `${wall}${label}`;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

const ICON = "size-5 shrink-0";

function rowCopy(item: TodayItem): RowCopy {
  switch (item.kind) {
    case "setup":
      return {
        title: "Finish setting up",
        description: `${item.doneCount} of ${item.total} steps done. Linkgo needs these before it can find ideas and write for you.`,
        action: "Finish setup",
        icon: (
          <Rocket aria-hidden="true" className={cn(ICON, "text-linkgo-blue")} />
        ),
      };
    case "connection":
      return {
        title: `${item.providerLabel} needs reconnecting`,
        description:
          item.service === "linkedin"
            ? "Linkgo can't share your posts until you sign in to LinkedIn again."
            : item.service === "ai"
              ? `Linkgo can't find ideas or write drafts with ${item.providerLabel} until you sign in again.`
              : `Sign in to ${item.providerLabel} again so Linkgo can keep using it.`,
        action: "Reconnect",
        icon: (
          <PlugZap
            aria-hidden="true"
            className={cn(ICON, "text-destructive")}
          />
        ),
      };
    case "unclear-outcome": {
      const what =
        item.subject === "comment"
          ? "your comment"
          : item.postTitle === null
            ? "your post"
            : quoted(item.postTitle);
      return {
        title: `Did ${what} go out?`,
        description: `We sent it to LinkedIn${item.sentAt ? ` on ${formatWhen(item.sentAt)}` : ""} but never heard back. Check LinkedIn, then tell Linkgo what happened.`,
        action: "Check what happened",
        icon: (
          <CircleHelp
            aria-hidden="true"
            className={cn(ICON, "text-amber-600")}
          />
        ),
      };
    }
    case "waiting":
      return {
        title: `${quoted(item.postTitle)} is waiting for your OK`,
        description: `In ${item.campaignName}. Nothing is posted until you approve it.`,
        action: "Review post",
        icon: (
          <ThumbsUp
            aria-hidden="true"
            className={cn(ICON, "text-linkgo-blue")}
          />
        ),
      };
    case "results-missing":
      return {
        title: `Add results for ${quoted(item.postTitle)}`,
        description: `Posted ${formatDay(item.publishedAt)} in ${item.campaignName}. Add its likes and comments so Linkgo learns what works.`,
        action: "Add results",
        icon: (
          <BarChart3
            aria-hidden="true"
            className={cn(ICON, "text-linkgo-blue")}
          />
        ),
      };
    case "next-scheduled":
      return {
        title: `Next post: ${quoted(item.postTitle)}`,
        description: `Goes out ${formatScheduledWhen(item.scheduledFor, item.timezone)} · ${item.campaignName}.`,
        action: "See schedule",
        icon: (
          <CalendarClock
            aria-hidden="true"
            className={cn(ICON, "text-muted-foreground")}
          />
        ),
      };
  }
}

/** The Today screen (`#/today`): only what needs the user now. */
export function TodayView(): React.ReactNode {
  const { state, refreshing, reload } = useToday();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
          <Sun aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Today</h2>
          <p className="text-muted-foreground text-sm">
            What needs you now. Each item has one button that takes you to the
            fix.
          </p>
        </div>
      </div>
      <section
        aria-labelledby="today-list-title"
        aria-busy={state.status === "loading" || refreshing}
        data-testid="today"
        data-state={state.status}
        className="flex flex-col gap-4"
      >
        <h3 id="today-list-title" className="sr-only">
          What needs you
        </h3>
        <TodayBody state={state} reload={reload} />
      </section>
    </div>
  );
}

function TodayBody({
  state,
  reload,
}: {
  state: ReturnType<typeof useToday>["state"];
  reload: () => void;
}): React.ReactNode {
  if (state.status === "loading") return <TodaySkeleton />;
  if (state.status === "error") return <TodayError onRetry={reload} />;
  const { snapshot } = state;
  return (
    <>
      {snapshot.failed.length > 0 ? (
        <PartialNotice failed={snapshot.failed} onRetry={reload} />
      ) : null}
      {snapshot.needsYou.length === 0 ? (
        <AllCaughtUp partial={snapshot.failed.length > 0} />
      ) : (
        <NeedsYouList snapshot={snapshot} />
      )}
      {snapshot.approvalsTruncated ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="today-truncated"
        >
          You have a lot of posts, so Today may not show every one. Open
          Approvals to see them all.
        </p>
      ) : null}
      {snapshot.upcoming ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-sm font-medium">
            Coming up
          </h3>
          <ul className="flex flex-col gap-2" aria-label="Coming up">
            <TodayRow item={snapshot.upcoming} primary={false} />
          </ul>
        </div>
      ) : null}
    </>
  );
}

function NeedsYouList({
  snapshot,
}: {
  snapshot: TodaySnapshot;
}): React.ReactNode {
  const count = snapshot.needsYou.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium" data-testid="today-count">
        {count === 1 ? "1 thing needs you" : `${count} things need you`}
      </p>
      <ul className="flex flex-col gap-2" aria-label="Things that need you">
        {snapshot.needsYou.map((item, index) => (
          <TodayRow key={item.key} item={item} primary={index === 0} />
        ))}
      </ul>
      {snapshot.overflow.map((overflow) => (
        <OverflowLink key={overflow.kind} overflow={overflow} />
      ))}
    </div>
  );
}

function OverflowLink({
  overflow,
}: {
  overflow: TodayOverflow;
}): React.ReactNode {
  const label =
    OVERFLOW_LABEL[overflow.kind]?.(overflow.hiddenCount) ??
    `${overflow.hiddenCount} more items.`;
  return (
    <p
      className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
      data-testid={`today-overflow-${overflow.kind}`}
    >
      {label}
      <Button asChild size="sm" variant="ghost" className={WRAPPING_BUTTON}>
        <a href={overflow.href}>See all</a>
      </Button>
    </p>
  );
}

function TodayRow({
  item,
  primary,
}: {
  item: TodayItem;
  primary: boolean;
}): React.ReactNode {
  const copy = rowCopy(item);
  const titleId = `today-${item.key}-title`;
  return (
    <li
      aria-labelledby={titleId}
      data-testid={`today-item-${item.kind}`}
      data-key={item.key}
      className="bg-card/70 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5">{copy.icon}</span>
        <div className="min-w-0">
          <p
            id={titleId}
            className="line-clamp-2 text-sm font-medium break-words"
          >
            {copy.title}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {copy.description}
          </p>
        </div>
      </div>
      <Button
        asChild
        size="sm"
        variant={primary ? "default" : "outline"}
        className={cn(WRAPPING_BUTTON, "shrink-0 self-start sm:self-center")}
      >
        <a href={item.href} aria-describedby={titleId}>
          {copy.action}
        </a>
      </Button>
    </li>
  );
}

function TodaySkeleton(): React.ReactNode {
  return (
    <div data-testid="today-loading" className="flex flex-col gap-2">
      <p role="status" className="sr-only">
        Checking what needs you…
      </p>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="bg-card/70 flex items-center gap-3 rounded-xl border p-3"
        >
          <div className="bg-muted size-5 animate-pulse rounded-full motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="bg-muted h-3.5 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
            <div className="bg-muted h-3 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
          </div>
          <div className="bg-muted h-8 w-24 animate-pulse rounded-md motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function TodayError({ onRetry }: { onRetry: () => void }): React.ReactNode {
  return (
    <div
      role="alert"
      data-testid="today-error"
      className="bg-card/70 flex flex-col items-start gap-3 rounded-xl border p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="text-destructive mt-0.5 size-5 shrink-0"
        />
        <div>
          <p className="text-sm font-medium">
            We couldn't check what needs you
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            Linkgo couldn't read your posts or accounts just now. Your work is
            safe. Try again in a moment.
          </p>
        </div>
      </div>
      <Button type="button" size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" className="size-4" />
        Try again
      </Button>
    </div>
  );
}

function joinPlain(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1] ?? ""}`;
}

function PartialNotice({
  failed,
  onRetry,
}: {
  failed: readonly TodaySourceKey[];
  onRetry: () => void;
}): React.ReactNode {
  return (
    <div
      role="status"
      data-testid="today-partial"
      className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm sm:flex-row sm:items-center"
    >
      <p className="flex-1">
        We couldn't check {joinPlain(failed.map((key) => SOURCE_LABEL[key]))}.
        The rest is up to date.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(WRAPPING_BUTTON, "shrink-0")}
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

function AllCaughtUp({ partial }: { partial: boolean }): React.ReactNode {
  return (
    <div
      data-testid="today-empty"
      className="empty-state bg-card/70 flex flex-col items-start gap-3 rounded-xl border p-4"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          aria-hidden="true"
          className="text-linkgo-green mt-0.5 size-5 shrink-0"
        />
        <div>
          <p className="text-sm font-medium">
            {partial ? "Nothing else needs you" : "You're all caught up"}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            Nothing is waiting for you. Find something to write about next, or
            start a post yourself.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className={WRAPPING_BUTTON}>
          <a href={findFirstIdeaHref()}>
            <Lightbulb aria-hidden="true" className="size-4" />
            Find an idea
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className={WRAPPING_BUTTON}>
          <a href={formatRouteHash(draftsRoute)}>
            <PenLine aria-hidden="true" className="size-4" />
            Write a post
          </a>
        </Button>
      </div>
    </div>
  );
}
