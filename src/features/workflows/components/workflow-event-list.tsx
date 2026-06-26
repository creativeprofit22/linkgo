import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkflowEvent, WorkflowEventType } from "@/workflows/types";

const eventLabels: Record<WorkflowEventType, string> = {
  run_created: "Run created",
  run_started: "Run started",
  step_started: "Step started",
  step_waiting_approval: "Waiting approval",
  step_blocked: "Step blocked",
  step_completed: "Step completed",
  step_failed: "Step failed",
  step_skipped: "Step skipped",
  step_resumed: "Step resumed",
  run_completed: "Run completed",
  run_cancelled: "Run cancelled",
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
          <Activity className="text-linkgo-blue size-4" /> Progress events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No workflow events yet.
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
                <p>{event.summary}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
