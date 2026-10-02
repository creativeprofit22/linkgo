import { Archive, CalendarClock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EditContentCalendarSlotDialog } from "@/features/content-calendar/components/edit-content-calendar-slot-dialog";
import {
  ContentCalendarLifecycleBadge,
  ContentCalendarPurposeBadge,
  formatLabels,
  getContentCalendarLifecycle,
  publishStatusLabels,
  scheduleStatusLabels,
} from "@/features/content-calendar/components/content-calendar-status-badge";
import { toPlainMessage } from "@/lib/plain-message";
import { cn } from "@/lib/utils";
import type {
  ArchiveContentCalendarSlotInput,
  ContentCalendarSlotWithDetails,
  ScheduleContentCalendarSlotInput,
  UpdateContentCalendarSlotInput,
} from "@/features/content-calendar/types";

interface ContentCalendarSlotCardProps {
  slot: ContentCalendarSlotWithDetails;
  /** True when a link pointed at this post; it scrolls into view. */
  highlighted?: boolean;
  saving: boolean;
  onUpdate: (input: UpdateContentCalendarSlotInput) => Promise<void>;
  onArchive: (input: ArchiveContentCalendarSlotInput) => Promise<void>;
  onSchedule: (input: ScheduleContentCalendarSlotInput) => Promise<void>;
}

export function ContentCalendarSlotCard({
  slot,
  highlighted = false,
  saving,
  onUpdate,
  onArchive,
  onSchedule,
}: ContentCalendarSlotCardProps): React.ReactNode {
  const lifecycle = getContentCalendarLifecycle(slot);
  const campaignArchived = slot.approval.campaign_status === "archived";
  const scheduleBlocksReschedule =
    slot.scheduleJob !== null &&
    !["cancelled", "failed"].includes(slot.scheduleJob.status);
  const canSchedule =
    !saving &&
    slot.status !== "archived" &&
    !campaignArchived &&
    slot.approval.status === "approved" &&
    !scheduleBlocksReschedule;
  const canMutate = !saving && slot.status === "planned" && !campaignArchived;

  function archiveSlot(): void {
    if (
      window.confirm(
        "Archive this planned post? It stays approved, so you can plan it again later.",
      )
    ) {
      void onArchive({ id: slot.id });
    }
  }

  return (
    <Card
      id={`calendar-slot-${slot.id}`}
      data-highlighted={highlighted ? "true" : undefined}
      aria-current={highlighted ? "true" : undefined}
      className={cn(
        "linkgo-card bg-card/82 scroll-mt-6 overflow-hidden",
        highlighted && "ring-primary ring-2 ring-offset-2",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">
                {slot.slot_for} · {slot.timezone}
              </CardTitle>
              <ContentCalendarPurposeBadge purpose={slot.purpose} />
              <ContentCalendarLifecycleBadge lifecycle={lifecycle} />
            </div>
            <p className="text-muted-foreground text-sm">
              {slot.approval.campaign_name} · Version{" "}
              {slot.variant.variant_number}
            </p>
            <a
              href={slot.draft.target_url}
              target="_blank"
              rel="noreferrer"
              className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline"
            >
              <span className="truncate">
                Inspired by: {slot.draft.target_author_name || "Unknown author"}
              </span>
              <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {campaignArchived && (
              <p className="bg-muted/60 text-muted-foreground max-w-72 rounded-md border px-3 py-2 text-right text-sm">
                This campaign is archived, so its posts can't be changed.
              </p>
            )}
            <EditContentCalendarSlotDialog
              slot={slot}
              disabled={!canMutate}
              onUpdate={onUpdate}
            />
            {canSchedule && (
              <Button
                type="button"
                size="sm"
                onClick={() => void onSchedule({ id: slot.id })}
              >
                <CalendarClock className="size-4" /> Schedule post
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canMutate}
              onClick={archiveSlot}
            >
              <Archive className="size-4" /> Archive
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <TextBlock label="Opening line" value={slot.variant.hook} />
          <TextBlock label="Angle" value={slot.angle} />
          <TextBlock label="Format" value={formatLabels[slot.format]} />
          <TextBlock label="Look and feel" value={slot.visual_direction} />
          <TextBlock label="Call to action" value={slot.cta} />
          <TextBlock label="Hashtags" value={slot.variant.hashtags || "None"} />
        </div>

        {slot.notes && <TextBlock label="Notes" value={slot.notes} />}
        <TextBlock label="Original post" value={slot.draft.target_content} />

        {(slot.scheduleJob || slot.publishAttempt) && <Separator />}

        {slot.scheduleJob && (
          <div className="bg-muted/30 rounded-xl border p-4">
            <p className="font-medium">Schedule</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {slot.scheduleJob.scheduled_for} · {slot.scheduleJob.timezone} ·{" "}
              {scheduleStatusLabels[slot.scheduleJob.status]}
            </p>
            {slot.scheduleJob.last_error && (
              <p className="text-destructive mt-2 text-sm">
                {toPlainMessage(slot.scheduleJob.last_error)}
              </p>
            )}
          </div>
        )}

        {slot.publishAttempt && (
          <div className="bg-muted/30 rounded-xl border p-4">
            <p className="font-medium">Posting result</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {slot.publishAttempt.created_at} ·{" "}
              {publishStatusLabels[slot.publishAttempt.status]}
            </p>
            {(slot.publishAttempt.external_post_url ||
              slot.publishAttempt.platform_post_id) && (
              <p className="text-muted-foreground mt-1 text-sm break-all">
                {slot.publishAttempt.external_post_url ||
                  slot.publishAttempt.platform_post_id}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="bg-muted/30 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {value}
      </p>
    </div>
  );
}
