import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  LearningEvent,
  LearningEventType,
} from "@/features/metrics/types";

const eventLabels: Record<LearningEventType, string> = {
  metric_recorded: "Metric recorded",
  memory_created: "Memory created",
  memory_archived: "Memory archived",
  memory_restored: "Memory restored",
};

export function LearningEventList({
  events,
}: {
  events: LearningEvent[];
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="text-linkgo-blue size-5" /> Learning events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No learning events yet. Record metrics or save memory to create the
            first event.
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
                  <span className="text-muted-foreground">
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
