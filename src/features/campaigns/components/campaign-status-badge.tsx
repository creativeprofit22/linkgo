import { Badge } from "@/components/ui/badge";
import type { CampaignStatus } from "@/features/campaigns/types";

const statusLabels: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

const statusVariants: Record<
  CampaignStatus,
  "outline" | "success" | "warning" | "secondary"
> = {
  draft: "outline",
  active: "success",
  paused: "warning",
  archived: "secondary",
};

export function CampaignStatusBadge({
  status,
}: {
  status: CampaignStatus;
}): React.ReactNode {
  return <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>;
}
