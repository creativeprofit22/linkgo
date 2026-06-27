import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyStatusBadge } from "@/features/safety/components/safety-status-badge";
import type { RateLimitEvent } from "@/features/safety/types";

interface RateLimitEventListProps {
  events: RateLimitEvent[];
}

export function RateLimitEventList({
  events,
}: RateLimitEventListProps): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">Rate-limit decisions</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No rate-limit decisions recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{event.summary}</p>
                  <SafetyStatusBadge
                    kind="rate-decision"
                    value={event.decision}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {event.action.replace(/_/gu, " ")} · {event.window_key} ·{" "}
                  {event.current_count}/{event.limit_value} · {event.created_at}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
