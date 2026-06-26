import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentRunEvent } from "@/features/agent-runtime/types";
import type { AgentRunEventType } from "@/agent";

const eventLabels: Record<AgentRunEventType, string> = {
  run_created: "Run created",
  model_started: "Model started",
  model_streamed: "Model streamed",
  tool_requested: "Tool requested",
  tool_completed: "Tool completed",
  tool_failed: "Tool failed",
  approval_required: "Approval required",
  run_completed: "Run completed",
  run_failed: "Run failed",
  run_cancelled: "Run cancelled",
};

export function AgentEventList({
  events,
}: {
  events: AgentRunEvent[];
}): React.ReactNode {
  return (
    <Card className="bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="text-linkgo-blue size-4" /> Runtime events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No runtime events yet.
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
