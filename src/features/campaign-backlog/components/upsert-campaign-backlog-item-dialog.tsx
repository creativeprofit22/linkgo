import { Pencil, Plus } from "lucide-react";
import { useEffect, useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPAIGN_BACKLOG_DETAILS_MAX_LENGTH,
  CAMPAIGN_BACKLOG_TITLE_MAX_LENGTH,
  createCampaignBacklogItemSchema,
  updateCampaignBacklogItemSchema,
} from "@/features/campaign-backlog/schemas";
import {
  formatUtcAsDateTimeLocal,
  getCurrentIanaTimeZone,
  getSupportedIanaTimeZones,
  isIanaTimeZone,
  localDateTimeToUtc,
} from "@/features/campaign-backlog/time-zone";
import {
  CAMPAIGN_BACKLOG_OWNER_LABELS,
  CAMPAIGN_BACKLOG_OWNER_TYPES,
  CAMPAIGN_BACKLOG_RECURRENCE_LABELS,
  CAMPAIGN_BACKLOG_RECURRENCES,
  CAMPAIGN_BACKLOG_WORK_TYPE_LABELS,
  CAMPAIGN_BACKLOG_WORK_TYPES,
  type CampaignBacklogItemDetail,
  type CreateCampaignBacklogItemInput,
  type UpdateCampaignBacklogItemInput,
} from "@/features/campaign-backlog/types";
import type { CampaignWithKeywords } from "@/features/campaigns/types";

interface BacklogFormState {
  campaignId: string;
  workType: string;
  title: string;
  details: string;
  dueAt: string;
  ownerType: string;
  recurrence: string;
  recurrenceTimeZone: string;
}

interface UpsertCampaignBacklogItemDialogProps {
  campaigns: CampaignWithKeywords[];
  defaultCampaignId: number | null;
  item?: CampaignBacklogItemDetail;
  pending: boolean;
  disabled?: boolean;
  onCreate: (
    input: CreateCampaignBacklogItemInput,
  ) => Promise<CampaignBacklogItemDetail>;
  onUpdate: (
    input: UpdateCampaignBacklogItemInput,
  ) => Promise<CampaignBacklogItemDetail>;
}

function getDefaultDueAt(timeZone: string): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return formatUtcAsDateTimeLocal(date.toISOString(), timeZone);
}

function getInitialForm(
  campaigns: CampaignWithKeywords[],
  defaultCampaignId: number | null,
  item?: CampaignBacklogItemDetail,
): BacklogFormState {
  const defaultCampaign =
    campaigns.find(
      (campaign) =>
        campaign.id === defaultCampaignId && campaign.status !== "archived",
    ) ?? campaigns.find((campaign) => campaign.status !== "archived");
  const currentTimeZone = getCurrentIanaTimeZone();
  const recurrenceTimeZone =
    item?.recurrence !== undefined && item.recurrence !== "none"
      ? item.recurrence_timezone
      : "";
  const displayTimeZone = recurrenceTimeZone || currentTimeZone;
  return {
    campaignId: String(item?.campaign_id ?? defaultCampaign?.id ?? ""),
    workType: item?.work_type ?? "research",
    title: item?.title ?? "",
    details: item?.details ?? "",
    dueAt: item
      ? formatUtcAsDateTimeLocal(item.due_at, displayTimeZone)
      : getDefaultDueAt(displayTimeZone),
    ownerType: item?.owner_type ?? "operator",
    recurrence: item?.recurrence ?? "none",
    recurrenceTimeZone,
  };
}

export function UpsertCampaignBacklogItemDialog({
  campaigns,
  defaultCampaignId,
  item,
  pending,
  disabled = false,
  onCreate,
  onUpdate,
}: UpsertCampaignBacklogItemDialogProps): React.ReactNode {
  const editing = item !== undefined;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BacklogFormState>(() =>
    getInitialForm(campaigns, defaultCampaignId, item),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const timeZones = [
    ...new Set([
      ...getSupportedIanaTimeZones(),
      ...(form.recurrenceTimeZone ? [form.recurrenceTimeZone] : []),
    ]),
  ];

  useEffect(() => {
    if (!open) {
      setForm(getInitialForm(campaigns, defaultCampaignId, item));
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [campaigns, defaultCampaignId, item, open]);

  const updateField = (field: keyof BacklogFormState, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setSubmitError(null);
  };

  const updateRecurrence = (recurrence: string): void => {
    setForm((current) => ({
      ...current,
      recurrence,
      recurrenceTimeZone:
        recurrence === "none"
          ? ""
          : current.recurrenceTimeZone || getCurrentIanaTimeZone(),
    }));
    setFieldErrors((current) => ({
      ...current,
      recurrence: "",
      recurrenceTimeZone: "",
    }));
    setSubmitError(null);
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (pending && !nextOpen) return;
    setOpen(nextOpen);
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    setSubmitError(null);

    const scheduleTimeZone =
      form.recurrence === "none"
        ? getCurrentIanaTimeZone()
        : form.recurrenceTimeZone;
    let dueAt = form.dueAt;
    if (isIanaTimeZone(scheduleTimeZone)) {
      try {
        dueAt = localDateTimeToUtc(form.dueAt, scheduleTimeZone);
      } catch {
        dueAt = form.dueAt;
      }
    }
    const commonInput = {
      workType: form.workType,
      title: form.title,
      details: form.details,
      ownerType: form.ownerType,
      dueAt,
      recurrence: form.recurrence,
      recurrenceTimeZone:
        form.recurrence === "none" ? "" : form.recurrenceTimeZone,
    };
    const candidate = editing
      ? { id: item.id, ...commonInput }
      : { campaignId: Number(form.campaignId), ...commonInput };
    const result = editing
      ? updateCampaignBacklogItemSchema.safeParse(candidate)
      : createCampaignBacklogItemSchema.safeParse(candidate);

    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "form");
        nextErrors[field] ??= issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    try {
      if (editing) {
        await onUpdate(result.data as UpdateCampaignBacklogItemInput);
      } else {
        await onCreate(result.data as CreateCampaignBacklogItemInput);
      }
      setOpen(false);
    } catch (caught) {
      setSubmitError(
        caught instanceof Error
          ? caught.message
          : "Backlog item could not be saved",
      );
    }
  };

  const activeCampaigns = campaigns.filter(
    (campaign) => campaign.status !== "archived",
  );
  const triggerDisabled =
    disabled || pending || (!editing && activeCampaigns.length === 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={editing ? "outline" : "default"}
          size={editing ? "sm" : "default"}
          disabled={triggerDisabled}
        >
          {editing ? (
            <Pencil aria-hidden="true" className="size-4" />
          ) : (
            <Plus aria-hidden="true" className="size-4" />
          )}
          {editing ? "Edit" : "New backlog item"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit backlog item" : "Create backlog item"}
            </DialogTitle>
            <DialogDescription>
              Plan who is responsible and when the work is due. Linkgo ownership
              is a planning label only; automatic execution arrives with the
              autopilot planner.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Campaign"
              error={fieldErrors.campaignId}
              id="backlog-campaign"
            >
              {(descriptionProps) => (
                <select
                  id="backlog-campaign"
                  {...descriptionProps}
                  value={form.campaignId}
                  disabled={editing}
                  aria-invalid={Boolean(fieldErrors.campaignId)}
                  onChange={(event) =>
                    updateField("campaignId", event.target.value)
                  }
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border"
                >
                  {!editing && <option value="">Choose a campaign</option>}
                  {campaigns.map((campaign) => (
                    <option
                      key={campaign.id}
                      value={campaign.id}
                      disabled={!editing && campaign.status === "archived"}
                    >
                      {campaign.name}
                      {campaign.status === "archived" ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label="Work type"
              error={fieldErrors.workType}
              id="backlog-work-type"
            >
              {(descriptionProps) => (
                <select
                  id="backlog-work-type"
                  {...descriptionProps}
                  value={form.workType}
                  aria-invalid={Boolean(fieldErrors.workType)}
                  onChange={(event) =>
                    updateField("workType", event.target.value)
                  }
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  {CAMPAIGN_BACKLOG_WORK_TYPES.map((workType) => (
                    <option key={workType} value={workType}>
                      {CAMPAIGN_BACKLOG_WORK_TYPE_LABELS[workType]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <FormField label="Title" error={fieldErrors.title} id="backlog-title">
            {(descriptionProps) => (
              <Input
                id="backlog-title"
                {...descriptionProps}
                value={form.title}
                maxLength={CAMPAIGN_BACKLOG_TITLE_MAX_LENGTH}
                aria-invalid={Boolean(fieldErrors.title)}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Review this week’s campaign research"
              />
            )}
          </FormField>

          <FormField
            label="Details"
            error={fieldErrors.details}
            id="backlog-details"
          >
            {(descriptionProps) => (
              <Textarea
                id="backlog-details"
                {...descriptionProps}
                rows={4}
                value={form.details}
                maxLength={CAMPAIGN_BACKLOG_DETAILS_MAX_LENGTH}
                aria-invalid={Boolean(fieldErrors.details)}
                onChange={(event) => updateField("details", event.target.value)}
                placeholder="Add the context needed to complete this work."
              />
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Due time"
              error={fieldErrors.dueAt}
              id="backlog-due-at"
            >
              {(descriptionProps) => (
                <Input
                  id="backlog-due-at"
                  {...descriptionProps}
                  type="datetime-local"
                  value={form.dueAt}
                  aria-invalid={Boolean(fieldErrors.dueAt)}
                  onChange={(event) => updateField("dueAt", event.target.value)}
                />
              )}
            </FormField>

            <FormField
              label="Owner"
              error={fieldErrors.ownerType}
              id="backlog-owner"
            >
              {(descriptionProps) => (
                <select
                  id="backlog-owner"
                  {...descriptionProps}
                  value={form.ownerType}
                  aria-invalid={Boolean(fieldErrors.ownerType)}
                  onChange={(event) =>
                    updateField("ownerType", event.target.value)
                  }
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  {CAMPAIGN_BACKLOG_OWNER_TYPES.map((ownerType) => (
                    <option key={ownerType} value={ownerType}>
                      {CAMPAIGN_BACKLOG_OWNER_LABELS[ownerType]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label="Recurrence"
              error={fieldErrors.recurrence}
              id="backlog-recurrence"
            >
              {(descriptionProps) => (
                <select
                  id="backlog-recurrence"
                  {...descriptionProps}
                  value={form.recurrence}
                  aria-invalid={Boolean(fieldErrors.recurrence)}
                  onChange={(event) => updateRecurrence(event.target.value)}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  {CAMPAIGN_BACKLOG_RECURRENCES.map((recurrence) => (
                    <option key={recurrence} value={recurrence}>
                      {CAMPAIGN_BACKLOG_RECURRENCE_LABELS[recurrence]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          {form.recurrence === "none" ? null : (
            <FormField
              label="Schedule time zone"
              error={fieldErrors.recurrenceTimeZone}
              id="backlog-recurrence-time-zone"
              describedBy="backlog-recurrence-time-zone-help"
            >
              {(descriptionProps) => (
                <>
                  <select
                    id="backlog-recurrence-time-zone"
                    {...descriptionProps}
                    value={form.recurrenceTimeZone}
                    aria-invalid={Boolean(fieldErrors.recurrenceTimeZone)}
                    onChange={(event) =>
                      updateField("recurrenceTimeZone", event.target.value)
                    }
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                  >
                    {timeZones.map((timeZone) => (
                      <option key={timeZone} value={timeZone}>
                        {timeZone}
                      </option>
                    ))}
                  </select>
                  <p
                    id="backlog-recurrence-time-zone-help"
                    className="text-muted-foreground text-xs leading-relaxed"
                  >
                    Future items keep this wall-clock time even when the device
                    time zone changes.
                  </p>
                </>
              )}
            </FormField>
          )}

          {submitError === null ? null : (
            <p role="alert" className="text-destructive text-sm">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FormFieldDescriptionProps {
  "aria-describedby": string | undefined;
}

function FormField({
  label,
  error,
  id,
  describedBy,
  children,
}: {
  label: string;
  error: string | undefined;
  id: string;
  describedBy?: string;
  children: (descriptionProps: FormFieldDescriptionProps) => React.ReactNode;
}): React.ReactNode {
  const errorId = `${id}-error`;
  const descriptionIds = [describedBy, error ? errorId : undefined].filter(
    (descriptionId): descriptionId is string => descriptionId !== undefined,
  );

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        "aria-describedby":
          descriptionIds.length > 0 ? descriptionIds.join(" ") : undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
