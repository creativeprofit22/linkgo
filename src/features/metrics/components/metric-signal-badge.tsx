import { Badge } from "@/components/ui/badge";
import type {
  CampaignMemoryStatus,
  MemorySignal,
} from "@/features/metrics/types";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const signalLabels: Record<MemorySignal, string> = {
  winner: "Winner",
  underperformer: "Didn't land",
  insight: "Lesson",
  avoid: "Avoid",
};

const signalVariants: Record<MemorySignal, BadgeVariant> = {
  winner: "success",
  underperformer: "warning",
  insight: "secondary",
  avoid: "destructive",
};

export function MetricSignalBadge({
  signal,
}: {
  signal: MemorySignal;
}): React.ReactNode {
  return <Badge variant={signalVariants[signal]}>{signalLabels[signal]}</Badge>;
}

export function CampaignMemoryStatusBadge({
  status,
}: {
  status: CampaignMemoryStatus;
}): React.ReactNode {
  return (
    <Badge variant={status === "active" ? "success" : "outline"}>
      {status === "active" ? "Active" : "Archived"}
    </Badge>
  );
}
