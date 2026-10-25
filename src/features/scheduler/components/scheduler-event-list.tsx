import { Badge } from "@/components/ui/badge";
import type {
  SchedulerEvent,
  SchedulerEventType,
} from "@/features/scheduler/types";
import { toPlainMessage } from "@/lib/plain-message";

const eventTypeLabels: Record<SchedulerEventType, string> = {
  scheduler_started: "Turned on",
  scheduler_stopped: "Turned off",
  tick_started: "Check started",
  tick_completed: "Check done",
  tick_failed: "Check failed",
  job_claimed: "Posting…",
  job_blocked: "Held back",
  job_published: "Posted",
  job_retry_scheduled: "Will try again",
  job_failed: "Didn't post",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function severityVariant(
  severity: SchedulerEvent["severity"],
): "secondary" | "warning" | "destructive" {
  if (severity === "error") return "destructive";
  if (severity === "warning") return "warning";
  return "secondary";
}

/** Collapsed by default so the Calendar side panel stays short. */
export function SchedulerEventList({
  events,
}: {
  events: SchedulerEvent[];
}): React.ReactNode {
  return (
    <details className="group rounded-xl border">
      <summary className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2">
        <span>Recent activity</span>
        <span className="text-muted-foreground text-xs font-normal">
          {events.length === 0 ? "None yet" : `${events.length} updates`}
        </span>
      </summary>
      <div className="px-3 pb-3">
        {events.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Nothing has happened yet. Activity shows here once auto-posting is
            on.
          </p>
        ) : (
          <ul aria-label="Recent activity" className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {toPlainMessage(event.summary)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {event.campaign_name ?? "All campaigns"} ·{" "}
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                  <Badge
                    className="shrink-0"
                    variant={severityVariant(event.severity)}
                  >
                    {eventTypeLabels[event.event_type]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
