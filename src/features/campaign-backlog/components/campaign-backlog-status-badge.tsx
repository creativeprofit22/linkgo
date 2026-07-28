import {
  Ban,
  CheckCircle2,
  Circle,
  CirclePlay,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CAMPAIGN_BACKLOG_STATUS_LABELS,
  type CampaignBacklogStatus,
} from "@/features/campaign-backlog/types";

const STATUS_ICONS: Record<CampaignBacklogStatus, LucideIcon> = {
  pending: Circle,
  in_progress: CirclePlay,
  blocked: Ban,
  completed: CheckCircle2,
  cancelled: XCircle,
};

export function CampaignBacklogStatusBadge({
  status,
}: {
  status: CampaignBacklogStatus;
}): React.ReactNode {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant="outline" className="bg-background gap-1.5">
      <Icon aria-hidden="true" className="size-3.5" />
      {CAMPAIGN_BACKLOG_STATUS_LABELS[status]}
    </Badge>
  );
}
