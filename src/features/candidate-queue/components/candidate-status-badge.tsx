import { Badge } from "@/components/ui/badge";
import type { CandidateStatus } from "@/features/candidate-queue/types";

const statusLabels: Record<CandidateStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  drafted: "Drafted",
};

const statusVariants: Record<
  CandidateStatus,
  "outline" | "success" | "warning" | "secondary" | "destructive"
> = {
  new: "outline",
  shortlisted: "success",
  rejected: "destructive",
  drafted: "warning",
};

export function CandidateStatusBadge({
  status,
}: {
  status: CandidateStatus;
}): React.ReactNode {
  return <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>;
}
