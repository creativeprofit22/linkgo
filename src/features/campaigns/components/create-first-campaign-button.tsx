import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { campaignsRoute } from "@/features/campaigns/schemas";
import { formatRouteHash } from "@/lib/navigation/route-contract";

/**
 * The fix for screens that need a campaign: opens New campaign pre-filled
 * with "My posts". Nothing is created until the user clicks Create.
 */
export function CreateFirstCampaignButton(): React.ReactNode {
  return (
    // Wraps instead of overflowing on narrow windows with large text.
    <Button
      asChild
      className="h-auto min-h-9 max-w-full text-center whitespace-normal"
    >
      <a href={formatRouteHash(campaignsRoute, { new: "1" })}>
        <Plus aria-hidden="true" className="size-4" />
        Create your first campaign
      </a>
    </Button>
  );
}
