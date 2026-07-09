import { AlertCircle, CalendarDays, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateContentCalendarSlotDialog } from "@/features/content-calendar/components/create-content-calendar-slot-dialog";
import { ContentCalendarSlotCard } from "@/features/content-calendar/components/content-calendar-slot-card";
import { getContentCalendarLifecycle } from "@/features/content-calendar/components/content-calendar-status-badge";
import { useContentCalendar } from "@/features/content-calendar/hooks/use-content-calendar";
import type {
  ContentCalendarSlotWithDetails,
  ContentCalendarSummary,
} from "@/features/content-calendar/types";

export function ContentCalendarView(): React.ReactNode {
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
  } = useContentCalendar();

  const summary = getCalendarSummary(slots);
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedCampaignArchived = selectedCampaign?.status === "archived";

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
                Content Calendar
              </h2>
              <p className="text-muted-foreground text-sm">
                Plan approved post slots before scheduler execution.
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
          />
        </div>
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
              onClick={() => void loadCalendar()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading content calendar…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <EmptyNoCampaigns />
      ) : (
        <>
          <div className="bg-card/60 flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Calendar scope</p>
              <p className="text-muted-foreground text-xs">
                Plan across campaigns or focus on one active campaign.
              </p>
            </div>
            <select
              value={selectedCampaignId ?? "all"}
              onChange={(event) => {
                const nextValue = event.target.value;
                selectCampaign(nextValue === "all" ? null : Number(nextValue));
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
                  <p className="font-medium">Campaign is archived</p>
                  <p className="text-muted-foreground text-sm">
                    Restore the campaign before creating, editing, archiving, or
                    scheduling calendar slots.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Planned" value={String(summary.planned)} />
            <SummaryCard label="Scheduled" value={String(summary.scheduled)} />
            <SummaryCard label="Published" value={String(summary.published)} />
            <SummaryCard label="Archived" value={String(summary.archived)} />
          </div>

          {eligibleApprovals.length === 0 && (
            <Card className="bg-card/70 border-dashed">
              <CardContent className="text-muted-foreground p-4 text-sm">
                No eligible approved posts are waiting for a calendar slot.
                Approve a draft in Approvals first.
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
            Open Campaigns first and create a campaign. Calendar slots attach to
            approved posts inside campaigns.
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
          <h3 className="text-lg font-semibold">No calendar slots yet</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            Create a slot from an approved post to plan purpose, format, visual
            direction, and CTA before scheduling.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
