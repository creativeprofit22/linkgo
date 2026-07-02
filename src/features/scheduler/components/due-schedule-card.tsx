import { AlertTriangle, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DueScheduleCardItem } from "@/features/scheduler/types";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function DueScheduleCard({
  job,
}: {
  job: DueScheduleCardItem;
}): React.ReactNode {
  const hasError = (job.last_error ?? "").trim().length > 0;
  return (
    <Card
      className={
        hasError ? "border-linkgo-amber/40 bg-linkgo-amber/5" : "bg-card/70"
      }
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarClock className="size-4" />
            </div>
            <div>
              <p className="font-medium">{job.campaign_name}</p>
              <p className="text-muted-foreground line-clamp-2 text-sm">
                {job.variant_hook || `Approval #${job.approval_id}`}
              </p>
            </div>
          </div>
          <Badge variant={hasError ? "warning" : "secondary"}>
            {job.status}
          </Badge>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Scheduled" value={formatDate(job.scheduled_for)} />
          <Detail
            label="Attempts"
            value={`${job.attempt_count ?? 0}/${job.max_attempts ?? 3}`}
          />
          <Detail label="Next retry" value={formatDate(job.next_attempt_at)} />
          <Detail
            label="Approval"
            value={`#${job.approval_id} · ${job.approval_status}`}
          />
        </div>

        {hasError && (
          <div className="text-linkgo-amber border-linkgo-amber/30 bg-linkgo-amber/10 flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{job.last_error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
