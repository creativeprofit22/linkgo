import {
  Ban,
  CalendarClock,
  Check,
  CirclePause,
  Play,
  Repeat2,
  Tags,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { CancelCampaignBacklogItemDialog } from "@/features/campaign-backlog/components/cancel-campaign-backlog-item-dialog";
import { CampaignBacklogStatusBadge } from "@/features/campaign-backlog/components/campaign-backlog-status-badge";
import { UpsertCampaignBacklogItemDialog } from "@/features/campaign-backlog/components/upsert-campaign-backlog-item-dialog";
import {
  CAMPAIGN_BACKLOG_OWNER_LABELS,
  CAMPAIGN_BACKLOG_RECURRENCE_LABELS,
  CAMPAIGN_BACKLOG_WORK_TYPE_LABELS,
  type CampaignBacklogItemDetail,
  type CampaignBacklogStatus,
  type CreateCampaignBacklogItemInput,
  type UpdateCampaignBacklogItemInput,
} from "@/features/campaign-backlog/types";
import type { CampaignWithKeywords } from "@/features/campaigns/types";

interface CampaignBacklogItemCardProps {
  item: CampaignBacklogItemDetail;
  campaigns: CampaignWithKeywords[];
  asOf: string;
  pending: boolean;
  onCreate: (
    input: CreateCampaignBacklogItemInput,
  ) => Promise<CampaignBacklogItemDetail>;
  onUpdate: (
    input: UpdateCampaignBacklogItemInput,
  ) => Promise<CampaignBacklogItemDetail>;
  onSetStatus: (id: number, status: CampaignBacklogStatus) => Promise<unknown>;
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDueAt(item: CampaignBacklogItemDetail): string {
  if (item.recurrence === "none" || item.recurrence_timezone === "") {
    return DATE_FORMATTER.format(new Date(item.due_at));
  }
  try {
    const dueAt = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: item.recurrence_timezone,
    }).format(new Date(item.due_at));
    return `${dueAt} (${item.recurrence_timezone})`;
  } catch {
    return `${DATE_FORMATTER.format(new Date(item.due_at))} (invalid schedule zone)`;
  }
}

export function CampaignBacklogItemCard({
  item,
  campaigns,
  asOf,
  pending,
  onCreate,
  onUpdate,
  onSetStatus,
}: CampaignBacklogItemCardProps): React.ReactNode {
  const terminal = item.status === "completed" || item.status === "cancelled";
  const archived = item.campaign_status === "archived";
  const mutationDisabled = pending || archived || terminal;
  const overdue = !terminal && Date.parse(item.due_at) <= Date.parse(asOf);

  return (
    <Card className="bg-card/82 overflow-hidden">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {item.campaign_name}
              {archived ? " · Archived" : ""}
            </p>
            <h4 className="text-base leading-snug font-semibold break-words">
              {item.title}
            </h4>
          </div>
          <CampaignBacklogStatusBadge status={item.status} />
        </div>
        {item.details ? (
          <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed whitespace-pre-wrap">
            {item.details}
          </p>
        ) : null}
      </CardHeader>

      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Fact
            icon={CalendarClock}
            label={overdue ? "Overdue" : "Due"}
            value={formatDueAt(item)}
          />
          <Fact
            icon={UserRound}
            label="Owner"
            value={CAMPAIGN_BACKLOG_OWNER_LABELS[item.owner_type]}
          />
          <Fact
            icon={Repeat2}
            label="Recurrence"
            value={CAMPAIGN_BACKLOG_RECURRENCE_LABELS[item.recurrence]}
          />
          <Fact
            icon={Tags}
            label="Work type"
            value={CAMPAIGN_BACKLOG_WORK_TYPE_LABELS[item.work_type]}
          />
        </dl>

        {item.owner_type === "linkgo" && !terminal ? (
          <p className="text-muted-foreground mt-4 border-s-2 ps-3 text-xs leading-relaxed">
            Linkgo owns the planning responsibility only. No automatic work runs
            until the autopilot planner is delivered.
          </p>
        ) : null}
        {item.recurrence !== "none" && !terminal ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Completing this item creates one future {item.recurrence} successor.
          </p>
        ) : null}
        {archived && !terminal ? (
          <p className="mt-4 rounded-lg border p-3 text-sm">
            This campaign is archived. Its backlog is read-only until the
            campaign is restored.
          </p>
        ) : null}
      </CardContent>

      {!terminal ? (
        <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
          {item.status === "pending" ? (
            <Button
              type="button"
              size="sm"
              disabled={mutationDisabled}
              onClick={() => void onSetStatus(item.id, "in_progress")}
            >
              <Play aria-hidden="true" className="size-4" /> Start
            </Button>
          ) : null}
          {item.status === "blocked" ? (
            <Button
              type="button"
              size="sm"
              disabled={mutationDisabled}
              onClick={() => void onSetStatus(item.id, "in_progress")}
            >
              <Play aria-hidden="true" className="size-4" /> Resume
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={item.status === "in_progress" ? "default" : "outline"}
            disabled={mutationDisabled}
            onClick={() => void onSetStatus(item.id, "completed")}
          >
            <Check aria-hidden="true" className="size-4" /> Complete
          </Button>
          {item.status === "in_progress" || item.status === "blocked" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mutationDisabled}
              onClick={() => void onSetStatus(item.id, "pending")}
            >
              <CirclePause aria-hidden="true" className="size-4" /> Pending
            </Button>
          ) : null}
          {item.status !== "blocked" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mutationDisabled}
              onClick={() => void onSetStatus(item.id, "blocked")}
            >
              <Ban aria-hidden="true" className="size-4" /> Block
            </Button>
          ) : null}
          <UpsertCampaignBacklogItemDialog
            campaigns={campaigns}
            defaultCampaignId={item.campaign_id}
            item={item}
            pending={pending}
            disabled={archived}
            onCreate={onCreate}
            onUpdate={onUpdate}
          />
          <CancelCampaignBacklogItemDialog
            item={item}
            pending={pending}
            disabled={archived}
            onCancel={(id) => onSetStatus(id, "cancelled")}
          />
        </CardFooter>
      ) : null}
    </Card>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="bg-background/45 min-w-0 rounded-lg border p-3">
      <dt className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        <Icon aria-hidden="true" className="size-3.5" /> {label}
      </dt>
      <dd className="mt-1.5 break-words">{value}</dd>
    </div>
  );
}
