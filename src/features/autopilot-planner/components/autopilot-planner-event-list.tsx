import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AutopilotPlannerEvent,
  AutopilotPlannerEventType,
} from "@/features/autopilot-planner/types";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const EVENT_TYPE_LABELS: Record<AutopilotPlannerEventType, string> = {
  planner_started: "planner started",
  planner_stopped: "planner stopped",
  tick_started: "tick started",
  tick_completed: "tick completed",
  tick_failed: "tick failed",
  batch_planned: "batch planned",
  batch_skipped: "batch skipped",
  batch_failed: "batch failed",
  planner_blocked: "planner blocked",
};

function formatEventType(value: AutopilotPlannerEventType): string {
  return EVENT_TYPE_LABELS[value];
}

export function AutopilotPlannerEventList({
  events,
}: {
  events: AutopilotPlannerEvent[];
}): React.ReactNode {
  return (
    <Card className="bg-card/70 forced-colors:border">
      <CardHeader>
        <CardTitle className="text-base">Recent planner events</CardTitle>
        <p className="text-muted-foreground text-sm">
          Local lifecycle, tick, plan, skip, block, batch failure, and worker
          failure history.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No planner events for this scope yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border p-3 forced-colors:border"
              >
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {event.summary}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs break-words">
                      {event.campaign_name ?? "All campaigns"} ·{" "}
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-medium capitalize">
                    Severity: {event.severity}
                  </p>
                </div>
                <p className="text-muted-foreground mt-2 text-xs capitalize">
                  Event: {formatEventType(event.event_type)}
                  {event.source_import_batch_id === null
                    ? ""
                    : ` · source batch #${event.source_import_batch_id}`}
                  {event.autopilot_plan_id === null
                    ? ""
                    : ` · plan #${event.autopilot_plan_id}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
