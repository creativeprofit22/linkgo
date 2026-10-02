import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkflowEvent, WorkflowEventType } from "@/workflows/types";
import { toPlainMessage } from "@/lib/plain-message";

const eventLabels: Record<WorkflowEventType, string> = {
  run_created: "Automation created",
  run_started: "Automation started",
  step_started: "Step started",
  step_waiting_approval: "Waiting for approval",
  step_blocked: "Step stuck",
  step_completed: "Step done",
  step_failed: "Step failed",
  step_skipped: "Step skipped",
  step_resumed: "Step continued",
  run_completed: "Automation done",
  run_cancelled: "Automation stopped",
  note_added: "Note added",
};

export function WorkflowEventList({
  events,
}: {
  events: WorkflowEvent[];
}): React.ReactNode {
  return (
    <Card className="bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="text-linkgo-blue size-4" /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has happened yet. Activity shows up here as steps move.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-muted/30 rounded-xl border p-3 text-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {eventLabels[event.event_type]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {event.created_at}
                  </span>
                </div>
                <p>{toPlainMessage(event.summary)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
