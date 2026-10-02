import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentRunEvent } from "@/features/agent-runtime/types";
import type { AgentRunEventType } from "@/agent";
import { toPlainMessage } from "@/lib/plain-message";

const eventLabels: Record<AgentRunEventType, string> = {
  run_created: "Task created",
  model_started: "AI started",
  model_streamed: "AI replied",
  tool_requested: "Action asked for",
  tool_completed: "Action done",
  tool_failed: "Action failed",
  approval_required: "Needs your approval",
  run_completed: "Task done",
  run_failed: "Task failed",
  run_cancelled: "Task cancelled",
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
          <Activity className="text-linkgo-blue size-4" /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has happened yet. Activity shows up here once the task
            starts.
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
