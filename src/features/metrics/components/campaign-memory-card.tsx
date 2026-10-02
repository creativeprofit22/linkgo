import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CampaignMemoryStatusBadge,
  MetricSignalBadge,
} from "@/features/metrics/components/metric-signal-badge";
import type {
  CampaignMemory,
  SetCampaignMemoryStatusInput,
} from "@/features/metrics/types";

interface CampaignMemoryCardProps {
  memory: CampaignMemory;
  selectedCampaignArchived: boolean;
  onSetStatus: (input: SetCampaignMemoryStatusInput) => Promise<void>;
}

export function CampaignMemoryCard({
  memory,
  selectedCampaignArchived,
  onSetStatus,
}: CampaignMemoryCardProps): React.ReactNode {
  const nextStatus = memory.status === "active" ? "archived" : "active";

  return (
    <Card className="bg-card/75">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MetricSignalBadge signal={memory.signal} />
            <CampaignMemoryStatusBadge status={memory.status} />
            <span className="text-muted-foreground text-sm">
              {memory.confidence}% sure
            </span>
          </div>
          {!selectedCampaignArchived && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void onSetStatus({ id: memory.id, status: nextStatus })
              }
            >
              {nextStatus === "archived" ? "Archive" : "Restore"}
            </Button>
          )}
        </div>
        <div>
          <p className="font-medium">{memory.summary}</p>
          {memory.evidence && (
            <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
              {memory.evidence}
            </p>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Updated {memory.updated_at}
        </p>
      </CardContent>
    </Card>
  );
}
