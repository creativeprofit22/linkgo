import { Badge } from "@/components/ui/badge";
import {
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
} from "@/features/campaigns/types";

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
  return (
    <Badge variant={statusVariants[status]}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </Badge>
  );
}
