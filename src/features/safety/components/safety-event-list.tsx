import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SafetyStatusBadge } from "@/features/safety/components/safety-status-badge";
import type { SafetyAuditEvent } from "@/features/safety/types";
import { toPlainMessage } from "@/lib/plain-message";

const EVENT_LABELS: Record<SafetyAuditEvent["event_type"], string> = {
  kill_switch_enabled: "Emergency pause turned on",
  kill_switch_disabled: "Emergency pause turned off",
  schedule_allowed: "Scheduling allowed",
  schedule_blocked: "Scheduling stopped",
  schedule_cancelled: "Schedule cancelled",
  publish_succeeded: "Posted",
  publish_failed: "Posting failed",
  approval_rejected: "Approval rejected",
  agent_run_started: "AI assistant task started",
  agent_run_failed: "AI assistant task failed",
  error_item_created: "Problem added",
  error_item_updated: "Problem updated",
};

const SUBJECT_LABELS: Record<SafetyAuditEvent["subject_type"], string> = {
  campaign: "Campaign",
  approval: "Approval",
  schedule_job: "Scheduled post",
  publish_attempt: "Posting",
  agent_run: "AI assistant task",
  workflow_run: "Automation",
  error_queue_item: "Problem to fix",
  safety_settings: "Safety settings",
};

interface SafetyEventListProps {
  events: SafetyAuditEvent[];
}

export function SafetyEventList({
  events,
}: SafetyEventListProps): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="text-base">Safety history</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No safety activity yet.
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
                    kind="audit-severity"
                    value={event.severity}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {EVENT_LABELS[event.event_type]} ·{" "}
                  {SUBJECT_LABELS[event.subject_type]} · {event.created_at}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
