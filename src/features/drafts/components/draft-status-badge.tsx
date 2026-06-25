import { Badge } from "@/components/ui/badge";
import type {
  DraftAuditSeverity,
  DraftStatus,
  DraftVariantStatus,
} from "@/features/drafts/types";

const draftStatusLabels: Record<DraftStatus, string> = {
  drafting: "Drafting",
  needs_revision: "Needs revision",
  ready_for_review: "Ready for review",
  archived: "Archived",
};

const draftStatusVariants: Record<
  DraftStatus,
  "outline" | "success" | "warning" | "secondary"
> = {
  drafting: "outline",
  needs_revision: "warning",
  ready_for_review: "success",
  archived: "secondary",
};

const variantStatusLabels: Record<DraftVariantStatus, string> = {
  draft: "Draft",
  selected: "Selected",
  rejected: "Rejected",
};

const variantStatusVariants: Record<
  DraftVariantStatus,
  "outline" | "success" | "secondary" | "destructive"
> = {
  draft: "outline",
  selected: "success",
  rejected: "destructive",
};

const auditSeverityLabels: Record<DraftAuditSeverity, string> = {
  block: "Blocked",
  warning: "Warnings",
  pass: "Passed",
};

const auditSeverityVariants: Record<
  DraftAuditSeverity,
  "success" | "warning" | "destructive"
> = {
  block: "destructive",
  warning: "warning",
  pass: "success",
};

export function DraftStatusBadge({
  status,
}: {
  status: DraftStatus;
}): React.ReactNode {
  return (
    <Badge variant={draftStatusVariants[status]}>
      {draftStatusLabels[status]}
    </Badge>
  );
}

export function DraftVariantStatusBadge({
  status,
}: {
  status: DraftVariantStatus;
}): React.ReactNode {
  return (
    <Badge variant={variantStatusVariants[status]}>
      {variantStatusLabels[status]}
    </Badge>
  );
}

export function DraftAuditSeverityBadge({
  severity,
}: {
  severity: DraftAuditSeverity;
}): React.ReactNode {
  return (
    <Badge variant={auditSeverityVariants[severity]}>
      {auditSeverityLabels[severity]}
    </Badge>
  );
}
