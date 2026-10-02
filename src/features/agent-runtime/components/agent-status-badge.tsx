import { Badge } from "@/components/ui/badge";
import type { AgentRunStatus, AgentToolCallStatus } from "@/agent";

const runLabels: Record<AgentRunStatus, string> = {
  queued: "Not started",
  running: "In progress",
  waiting_approval: "Waiting for approval",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

const toolLabels: Record<AgentToolCallStatus, string> = {
  requested: "Asked for",
  running: "In progress",
  waiting_approval: "Waiting for approval",
  completed: "Done",
  failed: "Failed",
  rejected: "Rejected",
};

function getVariant(
  status: AgentRunStatus | AgentToolCallStatus,
): "default" | "destructive" | "secondary" | "outline" {
  if (status === "failed" || status === "rejected") return "destructive";
  if (status === "completed") return "default";
  if (status === "waiting_approval") return "secondary";
  return "outline";
}

export function AgentRunStatusBadge({
  status,
}: {
  status: AgentRunStatus;
}): React.ReactNode {
  return <Badge variant={getVariant(status)}>{runLabels[status]}</Badge>;
}

export function AgentToolCallStatusBadge({
  status,
}: {
  status: AgentToolCallStatus;
}): React.ReactNode {
  return <Badge variant={getVariant(status)}>{toolLabels[status]}</Badge>;
}
