import { Badge } from "@/components/ui/badge";
import type {
  ApprovalStatus,
  PublishAttemptStatus,
  ScheduleJobStatus,
} from "@/features/approvals/types";

const approvalLabels: Record<ApprovalStatus, string> = {
  needs_review: "Waiting for approval",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  published: "Posted",
  cancelled: "Cancelled",
};

const scheduleLabels: Record<ScheduleJobStatus, string> = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  completed: "Done",
  failed: "Didn't post",
};

const publishAttemptLabels: Record<PublishAttemptStatus, string> = {
  succeeded: "Went live",
  failed: "Didn't post",
};

const approvalVariants: Record<
  ApprovalStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  needs_review: "secondary",
  changes_requested: "outline",
  approved: "default",
  rejected: "destructive",
  scheduled: "default",
  published: "default",
  cancelled: "outline",
};

const scheduleVariants: Record<
  ScheduleJobStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  scheduled: "default",
  cancelled: "outline",
  completed: "default",
  failed: "destructive",
};

const publishAttemptVariants: Record<
  PublishAttemptStatus,
  "default" | "destructive"
> = {
  succeeded: "default",
  failed: "destructive",
};

export function ApprovalStatusBadge({
  status,
}: {
  status: ApprovalStatus;
}): React.ReactNode {
  return (
    <Badge variant={approvalVariants[status]}>{approvalLabels[status]}</Badge>
  );
}

export function ScheduleJobStatusBadge({
  status,
}: {
  status: ScheduleJobStatus;
}): React.ReactNode {
  return (
    <Badge variant={scheduleVariants[status]}>{scheduleLabels[status]}</Badge>
  );
}

export function PublishAttemptStatusBadge({
  status,
}: {
  status: PublishAttemptStatus;
}): React.ReactNode {
  return (
    <Badge variant={publishAttemptVariants[status]}>
      {publishAttemptLabels[status]}
    </Badge>
  );
}
