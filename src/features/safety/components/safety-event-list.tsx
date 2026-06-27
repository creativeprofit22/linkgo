import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyStatusBadge } from "@/features/safety/components/safety-status-badge";
import type { SafetyAuditEvent } from "@/features/safety/types";

interface SafetyEventListProps {
  events: SafetyAuditEvent[];
}

export function SafetyEventList({
  events,
}: SafetyEventListProps): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">Safety audit events</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No safety audit events recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{event.summary}</p>
                  <SafetyStatusBadge
                    kind="audit-severity"
                    value={event.severity}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {event.event_type.replace(/_/gu, " ")} · {event.subject_type}
                  {event.subject_id ? ` #${event.subject_id}` : ""} ·{" "}
                  {event.created_at}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
