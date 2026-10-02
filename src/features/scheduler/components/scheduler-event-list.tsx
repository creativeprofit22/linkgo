import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function SchedulerEventList({
  events,
}: {
  events: SchedulerEvent[];
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nothing has happened yet. Activity shows here once auto-posting is
            on.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {toPlainMessage(event.summary)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {event.campaign_name ?? "All campaigns"} ·{" "}
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                  <Badge variant={severityVariant(event.severity)}>
                    {eventTypeLabels[event.event_type]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
