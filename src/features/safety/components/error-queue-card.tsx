import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ERROR_STATUS_LABELS,
  SafetyStatusBadge,
} from "@/features/safety/components/safety-status-badge";
import type {
  ErrorQueueItem,
  ErrorQueueStatus,
  SetErrorQueueItemStatusInput,
} from "@/features/safety/types";

const NEXT_STATUSES: Record<ErrorQueueStatus, ErrorQueueStatus[]> = {
  open: ["in_progress", "failed"],
  in_progress: ["awaiting_review", "failed"],
  awaiting_review: ["resolved", "failed"],
  resolved: ["in_progress"],
  failed: ["in_progress"],
};

const SOURCE_LABELS: Record<ErrorQueueItem["source_type"], string> = {
  approval: "Approval",
  publish_attempt: "Posting",
  schedule_job: "Scheduled post",
  agent_run: "AI assistant task",
  workflow_run: "Automation",
  manual: "Added by you",
};

interface ErrorQueueCardProps {
  item: ErrorQueueItem;
  disabled: boolean;
  onChangeStatus: (input: SetErrorQueueItemStatusInput) => Promise<void>;
}

export function ErrorQueueCard({
  item,
  disabled,
  onChangeStatus,
}: ErrorQueueCardProps): React.ReactNode {
  const nextStatuses = NEXT_STATUSES[item.status];

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="space-y-1">
            <CardTitle className="text-base">{item.title}</CardTitle>
            <p className="text-muted-foreground text-xs">
              {SOURCE_LABELS[item.source_type]}
              {item.campaign_name ? ` · ${item.campaign_name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SafetyStatusBadge kind="error-status" value={item.status} />
            <SafetyStatusBadge kind="error-severity" value={item.severity} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{item.detail || "No details saved."}</p>
        {item.resolution_notes && (
          <Textarea
            value={item.resolution_notes}
            readOnly
            aria-label="How it was fixed"
          />
        )}
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              type="button"
              variant={status === "failed" ? "destructive" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() =>
                void onChangeStatus({
                  id: item.id,
                  status,
                  resolutionNotes:
                    status === "resolved" ? "Resolved by operator" : "",
                })
              }
            >
              Mark as “{ERROR_STATUS_LABELS[status]}”
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
