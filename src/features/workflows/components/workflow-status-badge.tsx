import { Badge } from "@/components/ui/badge";
import type { WorkflowRunStatus, WorkflowStepStatus } from "@/workflows/types";

const runLabels: Record<WorkflowRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_approval: "Waiting approval",
  blocked: "Blocked",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const stepLabels: Record<WorkflowStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  waiting_approval: "Waiting approval",
  blocked: "Blocked",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

function getVariant(
  status: WorkflowRunStatus | WorkflowStepStatus,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  if (["completed", "skipped"].includes(status)) return "success";
  if (["blocked", "failed", "cancelled"].includes(status)) return "destructive";
  if (["waiting_approval", "queued", "pending"].includes(status))
    return "warning";
  if (status === "running") return "default";
  return "outline";
}

export function WorkflowRunStatusBadge({
  status,
}: {
  status: WorkflowRunStatus;
}): React.ReactNode {
  return <Badge variant={getVariant(status)}>{runLabels[status]}</Badge>;
}

export function WorkflowStepStatusBadge({
  status,
}: {
  status: WorkflowStepStatus;
}): React.ReactNode {
  return <Badge variant={getVariant(status)}>{stepLabels[status]}</Badge>;
}

export function getWorkflowRunStatusLabel(status: WorkflowRunStatus): string {
  return runLabels[status];
}

export function getWorkflowStepStatusLabel(status: WorkflowStepStatus): string {
  return stepLabels[status];
}
