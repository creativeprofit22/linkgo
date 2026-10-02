import {
  AlertCircle,
  Archive,
  ClipboardList,
  Clock3,
  Link2,
  ListRestart,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignBacklogItemCard } from "@/features/campaign-backlog/components/campaign-backlog-item-card";
import { UpsertCampaignBacklogItemDialog } from "@/features/campaign-backlog/components/upsert-campaign-backlog-item-dialog";
import { useCampaignBacklog } from "@/features/campaign-backlog/hooks/use-campaign-backlog";
import {
  CAMPAIGN_BACKLOG_OWNER_LABELS,
  CAMPAIGN_BACKLOG_OWNER_TYPES,
  type CampaignBacklogItemDetail,
} from "@/features/campaign-backlog/types";

const DUE_NEXT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function CampaignBacklogView(): React.ReactNode {
  const {
    campaigns,
    dashboard,
    filters,
    loading,
    pending,
    error,
    selectedCampaign,
    loadBacklog,
    setCampaignFilter,
    setOwnerFilter,
    setView,
    createItem,
    updateItem,
    setItemStatus,
  } = useCampaignBacklog();
  const selectedCampaignArchived = selectedCampaign?.status === "archived";
  const activeCampaignCount = campaigns.filter(
    (campaign) => campaign.status !== "archived",
  ).length;

  const handleCampaignFilter = (value: string): void => {
    const campaignId = value === "all" ? null : Number(value);
    setCampaignFilter(campaignId);
    const campaign = campaigns.find((candidate) => candidate.id === campaignId);
    if (campaign?.status === "archived") setView("history");
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 shrink-0 items-center justify-center rounded-xl">
            <ClipboardList aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">Tasks</h2>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
              What's due, who owns it, and repeating tasks. Changing a task
              never posts or does anything on LinkedIn.
            </p>
          </div>
        </div>
        <UpsertCampaignBacklogItemDialog
          campaigns={campaigns}
          defaultCampaignId={filters.campaignId}
          pending={pending}
          disabled={
            loading || activeCampaignCount === 0 || selectedCampaignArchived
          }
          onCreate={createItem}
          onUpdate={updateItem}
        />
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <AlertCircle
                aria-hidden="true"
                className="text-destructive mt-0.5 size-5 shrink-0"
              />
              <div>
                <p className="font-medium">We couldn't load your tasks</p>
                <p className="text-muted-foreground text-sm break-words">
                  {error}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadBacklog()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading && dashboard === null ? (
        <Card className="bg-card/70">
          <CardContent
            className="text-muted-foreground p-8 text-center text-sm"
            role="status"
          >
            Loading tasks…
          </CardContent>
        </Card>
      ) : campaigns.length === 0 && !loading ? (
        <EmptyState
          icon={Target}
          title="Create a campaign first"
          description="Every task belongs to a campaign. Open Campaigns and create one to get started."
        />
      ) : dashboard !== null ? (
        <>
          <section
            aria-label="Tasks summary"
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            <SummaryCard
              label="Due now"
              value={dashboard.summary.dueNow}
              icon={Clock3}
            />
            <SummaryCard
              label="In progress"
              value={dashboard.summary.inProgress}
              icon={ListRestart}
            />
            <SummaryCard
              label="On hold"
              value={dashboard.summary.blocked}
              icon={AlertCircle}
            />
            <SummaryCard
              label="Owned by Linkgo"
              value={dashboard.summary.linkgoOwned}
              icon={Link2}
            />
          </section>

          <section
            aria-labelledby="backlog-filters-heading"
            className="bg-card/60 rounded-xl border p-4"
          >
            <div className="mb-4">
              <h3
                id="backlog-filters-heading"
                className="text-sm font-semibold"
              >
                Filter tasks
              </h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Tasks you assign to Linkgo are just labels. Tasks made by
                Autopilot show the import and automation they came from. Neither
                posts anything.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FilterField label="Campaign" id="backlog-filter-campaign">
                <select
                  id="backlog-filter-campaign"
                  value={filters.campaignId ?? "all"}
                  onChange={(event) => handleCampaignFilter(event.target.value)}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  <option value="all">All campaigns</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                      {campaign.status === "archived" ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Owner" id="backlog-filter-owner">
                <select
                  id="backlog-filter-owner"
                  value={filters.owner}
                  onChange={(event) =>
                    setOwnerFilter(
                      event.target.value as "all" | "operator" | "linkgo",
                    )
                  }
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  <option value="all">All owners</option>
                  {CAMPAIGN_BACKLOG_OWNER_TYPES.map((owner) => (
                    <option key={owner} value={owner}>
                      {CAMPAIGN_BACKLOG_OWNER_LABELS[owner]}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="View" id="backlog-filter-view">
                <select
                  id="backlog-filter-view"
                  value={filters.view}
                  onChange={(event) =>
                    setView(event.target.value as "open" | "history")
                  }
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  <option value="open">To do</option>
                  <option value="history">History</option>
                </select>
              </FilterField>
            </div>
          </section>

          {selectedCampaignArchived ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <Archive
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                <div>
                  <p className="font-medium">Archived campaign history</p>
                  <p className="text-muted-foreground text-sm">
                    You can still see past tasks. Restore the campaign to add,
                    edit, or update tasks.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {dashboard.items.length} task
            {dashboard.items.length === 1 ? "" : "s"} shown.
          </p>

          {dashboard.items.length === 0 ? (
            dashboard.totalItems === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Add your first task"
                description="Tasks keep track of research, drafts, approvals, scheduling, analytics, and anything else you need to do. Select New task to start."
              />
            ) : (
              <EmptyState
                icon={filters.view === "history" ? Archive : ClipboardList}
                title="No tasks match these filters"
                description="Change the campaign, owner, or view filter to see other tasks."
              />
            )
          ) : filters.view === "history" ? (
            <ItemSection
              title="History"
              items={dashboard.items}
              campaigns={campaigns}
              asOf={dashboard.asOf}
              pending={pending}
              onCreate={createItem}
              onUpdate={updateItem}
              onSetStatus={setItemStatus}
            />
          ) : (
            <OpenItemGroups
              items={dashboard.items}
              campaigns={campaigns}
              asOf={dashboard.asOf}
              pending={pending}
              onCreate={createItem}
              onUpdate={updateItem}
              onSetStatus={setItemStatus}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

interface ItemSectionProps {
  title: string;
  items: CampaignBacklogItemDetail[];
  campaigns: ReturnType<typeof useCampaignBacklog>["campaigns"];
  asOf: string;
  pending: boolean;
  onCreate: ReturnType<typeof useCampaignBacklog>["createItem"];
  onUpdate: ReturnType<typeof useCampaignBacklog>["updateItem"];
  onSetStatus: ReturnType<typeof useCampaignBacklog>["setItemStatus"];
}

function OpenItemGroups(
  props: Omit<ItemSectionProps, "title">,
): React.ReactNode {
  const now = Date.parse(props.asOf);
  const dueNextEnd = now + DUE_NEXT_WINDOW_MS;
  const groups = [
    {
      title: "Overdue",
      items: props.items.filter((item) => Date.parse(item.due_at) <= now),
    },
    {
      title: "Due next",
      items: props.items.filter((item) => {
        const due = Date.parse(item.due_at);
        return due > now && due <= dueNextEnd;
      }),
    },
    {
      title: "Later",
      items: props.items.filter((item) => Date.parse(item.due_at) > dueNextEnd),
    },
  ];
  return (
    <div className="space-y-6">
      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <ItemSection
            key={group.title}
            {...props}
            title={group.title}
            items={group.items}
          />
        ),
      )}
    </div>
  );
}

function ItemSection({
  title,
  items,
  campaigns,
  asOf,
  pending,
  onCreate,
  onUpdate,
  onSetStatus,
}: ItemSectionProps): React.ReactNode {
  return (
    <section
      aria-labelledby={`backlog-${title.toLowerCase().replace(/\s+/gu, "-")}`}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id={`backlog-${title.toLowerCase().replace(/\s+/gu, "-")}`}
          className="text-sm font-semibold tracking-wide uppercase"
        >
          {title}
        </h3>
        <span className="text-muted-foreground text-xs">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-4">
        {items.map((item) => (
          <CampaignBacklogItemCard
            key={item.id}
            item={item}
            campaigns={campaigns}
            asOf={asOf}
            pending={pending}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onSetStatus={onSetStatus}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <Icon aria-hidden="true" className="text-muted-foreground size-4" />
      </CardContent>
    </Card>
  );
}

function FilterField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ClipboardList;
  title: string;
  description: string;
}): React.ReactNode {
  return (
    <Card className="bg-card/70 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
        <Icon aria-hidden="true" className="text-muted-foreground size-8" />
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
