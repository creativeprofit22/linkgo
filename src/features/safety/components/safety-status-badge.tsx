import { Badge } from "@/components/ui/badge";
import type {
  ErrorQueueSeverity,
  ErrorQueueStatus,
  RateLimitDecision,
  SafetyAuditSeverity,
} from "@/features/safety/types";

type SafetyStatusBadgeProps =
  | { kind: "error-status"; value: ErrorQueueStatus }
  | { kind: "error-severity"; value: ErrorQueueSeverity }
  | { kind: "audit-severity"; value: SafetyAuditSeverity }
  | { kind: "rate-decision"; value: RateLimitDecision };

export const ERROR_STATUS_LABELS: Record<ErrorQueueStatus, string> = {
  open: "Needs attention",
  in_progress: "Working on it",
  awaiting_review: "Ready to check",
  resolved: "Fixed",
  failed: "Couldn't fix",
};

const LABELS: Record<SafetyStatusBadgeProps["kind"], Record<string, string>> = {
  "error-status": ERROR_STATUS_LABELS,
  "error-severity": {
    warning: "Minor",
    error: "Problem",
    critical: "Urgent",
  },
  "audit-severity": {
    info: "Info",
    warning: "Warning",
    block: "Stopped",
  },
  "rate-decision": {
    allowed: "Allowed",
    blocked: "Over limit",
  },
};

export function SafetyStatusBadge(
  props: SafetyStatusBadgeProps,
): React.ReactNode {
  const label =
    LABELS[props.kind][props.value] ?? props.value.replace(/_/gu, " ");
  const variant = getVariant(props);
  return <Badge variant={variant}>{label}</Badge>;
}

function getVariant(
  props: SafetyStatusBadgeProps,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  if (props.kind === "rate-decision") {
    return props.value === "blocked" ? "destructive" : "success";
  }
  if (props.kind === "audit-severity") {
    if (props.value === "block") return "destructive";
    if (props.value === "warning") return "warning";
    return "secondary";
  }
  if (props.kind === "error-severity") {
    if (props.value === "critical") return "destructive";
    if (props.value === "error") return "warning";
    return "secondary";
  }
  if (props.value === "resolved") return "success";
  if (props.value === "failed") return "destructive";
  if (props.value === "awaiting_review") return "warning";
  return "secondary";
}
