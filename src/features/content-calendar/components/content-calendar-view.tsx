import {
  AlertCircle,
  CalendarDays,
  CalendarPlus,
  Info,
  RefreshCw,
  Target,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateContentCalendarSlotDialog } from "@/features/content-calendar/components/create-content-calendar-slot-dialog";
import { ContentCalendarSlotCard } from "@/features/content-calendar/components/content-calendar-slot-card";
import { getContentCalendarLifecycle } from "@/features/content-calendar/components/content-calendar-status-badge";
import { useContentCalendar } from "@/features/content-calendar/hooks/use-content-calendar";
import { contentCalendarRoute } from "@/features/content-calendar/schemas";
import type {
  ContentCalendarEligibleApproval,
  ContentCalendarRouteParams,
  ContentCalendarSlotWithDetails,
  ContentCalendarSummary,
} from "@/features/content-calendar/types";
import {
  navigateTo,
  useRouteParams,
} from "@/lib/navigation/use-hash-navigation";

export function ContentCalendarView(): React.ReactNode {
  const { params: linkParams, linkIssue } =
    useRouteParams(contentCalendarRoute);
  const {
    campaigns,
    selectedCampaignId,
    slots,
    eligibleApprovals,
    loading,
    saving,
    error,
    loadCalendar,
    selectCampaign,
    createSlot,
    updateSlot,
    archiveSlot,
    scheduleSlot,
  } = useContentCalendar({ initialCampaignId: linkParams?.campaignId });

  const summary = getCalendarSummary(slots);
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const link = resolveCalendarLink({
    linkParams,
    linkIssue,
    ready: !loading && error === null,
    campaignExists: campaigns.some(
      (campaign) => campaign.id === linkParams?.campaignId,
    ),
    selectedCampaignId,
    slots,
    eligibleApprovals,
  });
  const highlightedSlotId = link.kind === "slot" ? link.slotId : null;
  // "Add to plan" opens Plan a post for the linked approval; nothing is
  // saved until the operator submits it.
  const [planOpen, setPlanOpen] = useState(false);
  const presetApprovalId = link.kind === "unplanned" ? link.approval.id : null;
  const dismissLink = (): void =>
    navigateTo(
      contentCalendarRoute,
      selectedCampaignId === null ? {} : { campaignId: selectedCampaignId },
      { replace: true },
    );

  useEffect(() => {
    if (highlightedSlotId === null) return;
    document
      .getElementById(`calendar-slot-${highlightedSlotId}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [highlightedSlotId]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Calendar
              </h2>
              <p className="text-muted-foreground text-sm">
                Plan when each approved post goes out.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading || saving}
            onClick={() => void loadCalendar()}
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          <CreateContentCalendarSlotDialog
            eligibleApprovals={eligibleApprovals}
            disabled={
              loading ||
              saving ||
              campaigns.length === 0 ||
              selectedCampaignArchived
            }
            onCreate={createSlot}
            open={planOpen}
            onOpenChange={setPlanOpen}
            presetApprovalId={presetApprovalId}
          />
        </div>
      </div>

      {link.kind === "unplanned" && (
        <div
          role="status"
          data-testid="calendar-link-unplanned"
          className="bg-muted/50 text-muted-foreground flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center"
        >
          <span className="flex items-center gap-2">
            <Info aria-hidden="true" className="size-4 shrink-0" />
            {getUnplannedMessage(link.approval)}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={saving || selectedCampaignArchived}
              onClick={() => setPlanOpen(true)}
            >
              <CalendarPlus aria-hidden="true" className="size-4" />
              Add to plan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={dismissLink}
            >
              Not now
            </Button>
          </div>
        </div>
      )}

      {link.kind === "notice" && (
        <div
          role="status"
          data-testid="calendar-link-notice"
          className="bg-muted/50 text-muted-foreground flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center"
        >
          <span className="flex items-center gap-2">
            <Info aria-hidden="true" className="size-4 shrink-0" />
            {link.message}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={dismissLink}
          >
            OK
          </Button>
        </div>
      )}

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
              onClick={() => void loadCalendar()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading your calendar…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyNoCampaigns />
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Show posts from</p>
              <p className="text-muted-foreground text-xs">
                See every campaign, or focus on one.
              </p>
            </div>
            <select
              value={selectedCampaignId ?? "all"}
              onChange={(event) => {
                const nextValue = event.target.value;
                selectCampaign(nextValue === "all" ? null : Number(nextValue));
                // Keep the address in step so Back returns to this campaign.
                if (linkParams?.campaignId !== undefined)
                  navigateTo(
                    contentCalendarRoute,
                    nextValue === "all"
                      ? {}
                      : { campaignId: Number(nextValue) },
                    { replace: true },
                  );
              }}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 min-w-60 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="all">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                  {campaign.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedCampaignArchived && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertCircle className="text-destructive mt-0.5 size-5" />
                <div>
                  <p className="font-medium">This campaign is archived</p>
                  <p className="text-muted-foreground text-sm">
                    Restore the campaign before you add, edit, archive, or
                    schedule its posts.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Planned" value={String(summary.planned)} />
            <SummaryCard label="Scheduled" value={String(summary.scheduled)} />
            <SummaryCard label="Posted" value={String(summary.published)} />
            <SummaryCard label="Archived" value={String(summary.archived)} />
          </div>

          {eligibleApprovals.length === 0 && (
            <Card className="bg-card/70 border-dashed">
              <CardContent className="text-muted-foreground p-4 text-sm">
                No approved posts are waiting to be planned. Approve a draft in
                Approvals first.
              </CardContent>
            </Card>
          )}

          {slots.length === 0 ? (
            <EmptyNoSlots />
          ) : (
            <div className="space-y-4">
              {slots.map((slot) => (
                <ContentCalendarSlotCard
                  key={slot.id}
                  slot={slot}
                  highlighted={slot.id === highlightedSlotId}
                  saving={saving}
                  onUpdate={updateSlot}
                  onArchive={archiveSlot}
                  onSchedule={scheduleSlot}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type CalendarLinkState =
  | { kind: "none" }
  | { kind: "slot"; slotId: number }
  | { kind: "unplanned"; approval: ContentCalendarEligibleApproval }
  | { kind: "notice"; message: string };

/**
 * Link params are untrusted: the approval must belong to the linked campaign
 * and be on the calendar (or eligible to plan) before anything is shown.
 */
function resolveCalendarLink(input: {
  linkParams: ContentCalendarRouteParams | null;
  linkIssue: boolean;
  ready: boolean;
  campaignExists: boolean;
  selectedCampaignId: number | null;
  slots: ContentCalendarSlotWithDetails[];
  eligibleApprovals: ContentCalendarEligibleApproval[];
}): CalendarLinkState {
  if (input.linkIssue)
    return {
      kind: "notice",
      message: "That link doesn't point to a valid post. Showing your plan.",
    };
  const { linkParams } = input;
  if (!linkParams || linkParams.campaignId === undefined || !input.ready)
    return { kind: "none" };
  if (!input.campaignExists)
    return {
      kind: "notice",
      message: "We couldn't find that campaign. Showing all campaigns.",
    };
  if (input.selectedCampaignId !== linkParams.campaignId)
    return { kind: "none" };
  if (linkParams.approvalId === undefined) return { kind: "none" };
  const approvalId = linkParams.approvalId;
  const slots = input.slots.filter((slot) => slot.approval_id === approvalId);
  const slot =
    slots.find((candidate) => candidate.status !== "archived") ?? slots[0];
  if (slot) return { kind: "slot", slotId: slot.id };
  const approval = input.eligibleApprovals.find(
    (candidate) => candidate.id === approvalId,
  );
  if (approval) return { kind: "unplanned", approval };
  return {
    kind: "notice",
    message:
      "That post isn't approved yet, so it can't go on the calendar. Approve it in Approvals first.",
  };
}

function getUnplannedMessage(
  approval: ContentCalendarEligibleApproval,
): string {
  const author = approval.draft.target_author_name || "This post";
  return approval.scheduleJob?.status === "scheduled"
    ? `${author}'s post is scheduled for ${approval.scheduleJob.scheduled_for} but isn't on your plan yet.`
    : `${author}'s post is approved but isn't on your plan yet.`;
}

function getCalendarSummary(
  slots: ContentCalendarSlotWithDetails[],
): ContentCalendarSummary {
  return slots.reduce<ContentCalendarSummary>(
    (summary, slot) => {
      const lifecycle = getContentCalendarLifecycle(slot);
      return { ...summary, [lifecycle]: summary[lifecycle] + 1 };
    },
    { planned: 0, scheduled: 0, published: 0, archived: 0 },
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyNoCampaigns(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-green/10 text-linkgo-green flex size-14 items-center justify-center rounded-2xl">
          <Target className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No campaigns yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Go to Campaigns and create a campaign first. Then you can plan its
            approved posts here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyNoSlots(): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-14 items-center justify-center rounded-2xl">
          <CalendarDays className="size-7" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No posts planned yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Click Plan a post to pick an approved post and choose its goal,
            format, look, and call to action before you schedule it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
