import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyStatusBadge } from "@/features/safety/components/safety-status-badge";
import type { RateLimitEvent } from "@/features/safety/types";
import { toPlainMessage } from "@/lib/plain-message";

const ACTION_LABELS: Record<RateLimitEvent["action"], string> = {
  schedule_post: "Schedule post",
  publish_post: "Post",
  comment: "Comment",
  agent_run: "AI assistant task",
};

interface RateLimitEventListProps {
  events: RateLimitEvent[];
}

export function RateLimitEventList({
  events,
}: RateLimitEventListProps): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">Posting limits</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has been checked against your posting limits yet.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {toPlainMessage(event.summary)}
                  </p>
                  <SafetyStatusBadge
                    kind="rate-decision"
                    value={event.decision}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {ACTION_LABELS[event.action]} · {event.current_count} of{" "}
                  {event.limit_value} used · {event.created_at}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
