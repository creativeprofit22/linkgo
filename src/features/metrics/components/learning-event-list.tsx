import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  LearningEvent,
  LearningEventType,
} from "@/features/metrics/types";
import { toPlainMessage } from "@/lib/plain-message";

const eventLabels: Record<LearningEventType, string> = {
  metric_recorded: "Results added",
  memory_created: "Lesson saved",
  memory_archived: "Lesson archived",
  memory_restored: "Lesson restored",
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
          <Activity className="text-linkgo-blue size-5" /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing here yet. Add results or save a lesson, and it shows up
            here.
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
                <p>{toPlainMessage(event.summary)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
