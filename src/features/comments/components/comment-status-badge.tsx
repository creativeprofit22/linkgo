import { Badge } from "@/components/ui/badge";
import type {
  CommentAuditSeverity,
  CommentThreadStatus,
  CommentVariantStatus,
} from "@/features/comments/types";

const threadStatusLabels: Record<CommentThreadStatus, string> = {
  drafting: "Drafting",
  needs_review: "Needs review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  posted: "Posted",
  cancelled: "Cancelled",
};

const threadStatusVariants: Record<
  CommentThreadStatus,
  "outline" | "success" | "warning" | "secondary" | "destructive"
> = {
  drafting: "outline",
  needs_review: "warning",
  changes_requested: "warning",
  approved: "success",
  rejected: "destructive",
  posted: "success",
  cancelled: "secondary",
};

const variantStatusLabels: Record<CommentVariantStatus, string> = {
  draft: "Draft",
  selected: "Selected",
  rejected: "Rejected",
};

const variantStatusVariants: Record<
  CommentVariantStatus,
  "outline" | "success" | "destructive"
> = {
  draft: "outline",
  selected: "success",
  rejected: "destructive",
};

const auditSeverityLabels: Record<CommentAuditSeverity, string> = {
  block: "Blocked",
  warning: "Warnings",
  pass: "Passed",
};

const auditSeverityVariants: Record<
  CommentAuditSeverity,
  "success" | "warning" | "destructive"
> = {
  block: "destructive",
  warning: "warning",
  pass: "success",
};

export function CommentThreadStatusBadge({
  status,
}: {
  status: CommentThreadStatus;
}): React.ReactNode {
  return (
    <Badge variant={threadStatusVariants[status]}>
      {threadStatusLabels[status]}
    </Badge>
  );
}

export function CommentVariantStatusBadge({
  status,
}: {
  status: CommentVariantStatus;
}): React.ReactNode {
  return (
    <Badge variant={variantStatusVariants[status]}>
      {variantStatusLabels[status]}
    </Badge>
  );
}

export function CommentAuditSeverityBadge({
  severity,
}: {
  severity: CommentAuditSeverity;
}): React.ReactNode {
  return (
    <Badge variant={auditSeverityVariants[severity]}>
      {auditSeverityLabels[severity]}
    </Badge>
  );
}
