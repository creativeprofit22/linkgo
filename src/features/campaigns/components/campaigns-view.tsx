import { AlertCircle, Target } from "lucide-react";
import { AddCampaignDialog } from "@/features/campaigns/components/add-campaign-dialog";
import { CampaignCard } from "@/features/campaigns/components/campaign-card";
import { useCampaigns } from "@/features/campaigns/hooks/use-campaigns";
import { campaignsRoute } from "@/features/campaigns/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  navigateTo,
  useRouteParams,
} from "@/lib/navigation/use-hash-navigation";

/** Starter name for a first campaign opened from a setup link. */
export const STARTER_CAMPAIGN_NAME = "My posts";

interface CampaignsViewProps {
  /**
   * Replaces the empty card when there are no campaigns (the shell passes
   * the setup checklist). Receives the default card to fall back to.
   */
  renderEmpty?: (defaultEmpty: React.ReactNode) => React.ReactNode;
}

export function CampaignsView({
  renderEmpty,
}: CampaignsViewProps = {}): React.ReactNode {
  const { params: linkParams } = useRouteParams(campaignsRoute);
  const {
    campaigns,
    loading,
    error,
    loadCampaigns,
    addCampaign,
    updateCampaign,
    archiveCampaign,
    setStatus,
  } = useCampaigns();
  // `new=1` opens New campaign pre-filled. Closing it drops the flag from the
  // address (replace) so refresh doesn't reopen it.
  const newFromLink = !loading && linkParams?.new === "1";
  const closeNewLink = (open: boolean): void => {
    if (!open && linkParams?.new !== undefined) {
      navigateTo(campaignsRoute, undefined, { replace: true });
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <Target className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Campaigns
              </h2>
              <p className="text-muted-foreground text-sm">
                Group your posts by goal and audience. Active campaigns can be
                included in Autopilot. Linkgo never posts or comments without
                your OK.
              </p>
            </div>
          </div>
        </div>
        <AddCampaignDialog
          onCreate={addCampaign}
          open={newFromLink ? true : undefined}
          onOpenChange={newFromLink ? closeNewLink : undefined}
          initialName={newFromLink ? STARTER_CAMPAIGN_NAME : undefined}
        />
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadCampaigns()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading campaigns…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        (renderEmpty?.(<EmptyCampaigns onCreate={addCampaign} />) ?? (
          <EmptyCampaigns onCreate={addCampaign} />
        ))
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onArchive={archiveCampaign}
              onSetStatus={setStatus}
              onUpdate={updateCampaign}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyCampaigns({
  onCreate,
}: {
  onCreate: Parameters<typeof AddCampaignDialog>[0]["onCreate"];
}): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-green/10 text-linkgo-green flex size-14 items-center justify-center rounded-2xl">
          <Target className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No campaigns yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Start with one campaign. Linkgo uses it to find ideas, write drafts,
            and ask for your OK before anything posts.
          </p>
        </div>
        <AddCampaignDialog onCreate={onCreate} />
      </CardContent>
    </Card>
  );
}
