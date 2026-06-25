import {
  MoreHorizontal,
  Pause,
  Play,
  Archive,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { EditCampaignDialog } from "@/features/campaigns/components/add-campaign-dialog";
import { CampaignStatusBadge } from "@/features/campaigns/components/campaign-status-badge";
import type {
  CampaignStatus,
  CampaignWithKeywords,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

interface CampaignCardProps {
  campaign: CampaignWithKeywords;
  onSetStatus: (id: number, status: CampaignStatus) => Promise<void>;
  onArchive: (id: number) => Promise<void>;
  onUpdate: (input: UpdateCampaignInput) => Promise<void>;
}

export function CampaignCard({
  campaign,
  onSetStatus,
  onArchive,
  onUpdate,
}: CampaignCardProps): React.ReactNode {
  const [editOpen, setEditOpen] = useState(false);
  const isAutoPilot = campaign.auto_pilot === 1;
  const visibleKeywords = campaign.keywords.slice(0, 8);

  return (
    <Card className="linkgo-card bg-card/82 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">{campaign.name}</CardTitle>
              <CampaignStatusBadge status={campaign.status} />
              <span className="border-border text-muted-foreground rounded-md border px-2 py-0.5 text-xs">
                {isAutoPilot ? "Autopilot intent on" : "Manual mode"}
              </span>
            </div>
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {campaign.product || "No product context yet."}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Open ${campaign.name} actions`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 size-4" /> Edit
              </DropdownMenuItem>
              {campaign.status !== "active" && (
                <DropdownMenuItem
                  onClick={() => void onSetStatus(campaign.id, "active")}
                >
                  <Play className="mr-2 size-4" /> Activate
                </DropdownMenuItem>
              )}
              {campaign.status !== "paused" &&
                campaign.status !== "archived" && (
                  <DropdownMenuItem
                    onClick={() => void onSetStatus(campaign.id, "paused")}
                  >
                    <Pause className="mr-2 size-4" /> Pause
                  </DropdownMenuItem>
                )}
              {campaign.status === "archived" && (
                <DropdownMenuItem
                  onClick={() => void onSetStatus(campaign.id, "draft")}
                >
                  <RotateCcw className="mr-2 size-4" /> Restore to draft
                </DropdownMenuItem>
              )}
              {campaign.status !== "archived" && (
                <DropdownMenuItem onClick={() => void onArchive(campaign.id)}>
                  <Archive className="mr-2 size-4" /> Archive
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <EditCampaignDialog
            campaign={campaign}
            open={editOpen}
            onOpenChange={setEditOpen}
            onUpdate={onUpdate}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <InfoBlock
            label="Audience"
            value={
              campaign.audience || "Define who this campaign should attract."
            }
          />
          <InfoBlock
            label="Voice"
            value={campaign.voice || "No voice guidance yet."}
          />
          <InfoBlock
            label="Tone"
            value={campaign.tone || "No tone guidance yet."}
          />
          <InfoBlock
            label="Limits"
            value={`${campaign.daily_post_limit} posts/day · ${campaign.daily_comment_limit} comments/day`}
          />
        </div>

        <Separator />

        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Keywords
          </p>
          {visibleKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleKeywords.map((keyword) => (
                <span
                  key={keyword.id}
                  className="bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-xs"
                >
                  {keyword.keyword}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No keywords attached.
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          type="button"
          size="sm"
          variant={campaign.status === "active" ? "secondary" : "default"}
          onClick={() =>
            void onSetStatus(
              campaign.id,
              campaign.status === "active" ? "paused" : "active",
            )
          }
        >
          {campaign.status === "active" ? "Pause" : "Activate"}
        </Button>
        {campaign.status !== "archived" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onArchive(campaign.id)}
          >
            Archive
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="bg-background/45 rounded-lg border p-3">
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}
