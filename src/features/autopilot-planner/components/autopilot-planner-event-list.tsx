import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AutopilotPlannerEvent,
  AutopilotPlannerEventType,
} from "@/features/autopilot-planner/types";
import { toPlainMessage } from "@/lib/plain-message";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const EVENT_TYPE_LABELS: Record<AutopilotPlannerEventType, string> = {
  planner_started: "Autopilot started",
  planner_stopped: "Autopilot stopped",
  tick_started: "Check started",
  tick_completed: "Check finished",
  tick_failed: "Check failed",
  batch_planned: "Import planned",
  batch_skipped: "Import skipped",
  batch_failed: "Import failed",
  planner_blocked: "Autopilot paused",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  error: "Problem",
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
        <CardTitle className="text-base">Recent Autopilot activity</CardTitle>
        <p className="text-muted-foreground text-sm">
          When Autopilot started, stopped, checked your imports, and anything
          that went wrong.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No Autopilot activity here yet.
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
                      {toPlainMessage(event.summary)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs break-words">
                      {event.campaign_name ?? "All campaigns"} ·{" "}
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-medium capitalize">
                    Type: {SEVERITY_LABELS[event.severity] ?? event.severity}
                  </p>
                </div>
                <p className="text-muted-foreground mt-2 text-xs capitalize">
                  {formatEventType(event.event_type)}
                  {event.source_import_batch_id === null
                    ? ""
                    : ` · import #${event.source_import_batch_id}`}
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
