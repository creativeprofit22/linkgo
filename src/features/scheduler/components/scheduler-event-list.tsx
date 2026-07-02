import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchedulerEvent } from "@/features/scheduler/types";

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
        <CardTitle className="text-base">Recent scheduler events</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No scheduler events yet.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{event.summary}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {event.campaign_name ?? "All campaigns"} ·{" "}
                      {formatDate(event.created_at)}
                    </p>
                  </div>
                  <Badge variant={severityVariant(event.severity)}>
                    {event.event_type.replace(/_/gu, " ")}
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
