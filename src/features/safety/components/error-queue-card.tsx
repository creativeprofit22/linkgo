import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SafetyStatusBadge } from "@/features/safety/components/safety-status-badge";
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
              {item.source_type.replace(/_/gu, " ")} #
              {item.source_id ?? "manual"}
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
        <p className="text-sm">{item.detail || "No detail recorded."}</p>
        {item.resolution_notes && (
          <Textarea
            value={item.resolution_notes}
            readOnly
            aria-label="Resolution notes"
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
              Move to {status.replace(/_/gu, " ")}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
