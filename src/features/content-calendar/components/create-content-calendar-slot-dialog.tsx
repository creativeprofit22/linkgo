import { CalendarPlus } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
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
  formatLabels,
  purposeLabels,
} from "@/features/content-calendar/components/content-calendar-status-badge";
import type {
  ContentCalendarEligibleApproval,
  ContentCalendarFormat,
  ContentCalendarPurpose,
  CreateContentCalendarSlotInput,
} from "@/features/content-calendar/types";

const purposeOptions: ContentCalendarPurpose[] = [
  "reach",
  "trust",
  "proof",
  "conversion",
  "community",
];

const formatOptions: ContentCalendarFormat[] = [
  "text",
  "image",
  "carousel",
  "document",
  "video",
  "poll",
  "event",
];

interface CreateContentCalendarSlotDialogProps {
  eligibleApprovals: ContentCalendarEligibleApproval[];
  disabled: boolean;
  onCreate: (input: CreateContentCalendarSlotInput) => Promise<void>;
  /** Controlled open state, used by "Add to plan" from a link. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Approved post chosen by a link. Preselected (and its schedule time
   * prefilled) each time the dialog opens for it.
   */
  presetApprovalId?: number | null;
}

interface CalendarSlotFormState {
  approvalId: string;
  slotFor: string;
  timezone: string;
  purpose: ContentCalendarPurpose;
  format: ContentCalendarFormat;
  angle: string;
  visualDirection: string;
  cta: string;
  notes: string;
}

const initialFormState: CalendarSlotFormState = {
  approvalId: "",
  slotFor: "",
  timezone: "local",
  purpose: "reach",
  format: "text",
  angle: "",
  visualDirection: "",
  cta: "",
  notes: "",
};

/**
 * Stored schedule formats accepted natively (`is_supported_timestamp`):
 * `YYYY-MM-DD[T ]HH:MM[:SS[.fff]]` with an optional `Z` or `±HH:MM` suffix.
 */
const scheduleTimestampPattern =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Wall-clock `YYYY-MM-DDTHH:mm` of an instant in a zone; "" if unknown. */
function toZonedWallClock(instant: Date, timezone: string): string {
  const zone = timezone.trim();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone:
        zone === "" || zone.toLowerCase() === "local" ? undefined : zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    const value = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : "";
  } catch {
    // RangeError: the stored time zone isn't one Intl knows.
    return "";
  }
}

/**
 * `datetime-local` value (`YYYY-MM-DDTHH:mm`) from a stored schedule time.
 * `T` or space separators are accepted; seconds are dropped. A `Z` or
 * `±HH:MM` suffix is converted to the wall clock in `timezone` ("local"
 * means the device zone), or "" when the zone is unknown, so the shown
 * time never silently shifts to a different moment.
 */
export function toDateTimeLocalValue(
  value: string,
  timezone = "local",
): string {
  const match = scheduleTimestampPattern.exec(value.trim());
  if (!match) return "";
  const [, date, time, seconds, offset] = match;
  if (date === undefined || time === undefined) return "";
  const wallClock = `${date}T${time}`;
  if (offset === undefined) return wallClock;
  const instant = new Date(`${wallClock}:${seconds ?? "00"}${offset}`);
  if (Number.isNaN(instant.getTime())) return "";
  return toZonedWallClock(instant, timezone);
}

function getPresetFormState(
  approval: ContentCalendarEligibleApproval,
): CalendarSlotFormState {
  return {
    ...initialFormState,
    approvalId: String(approval.id),
    angle: approval.draft.angle,
    cta: approval.variant.cta,
    slotFor: approval.scheduleJob
      ? toDateTimeLocalValue(
          approval.scheduleJob.scheduled_for,
          approval.scheduleJob.timezone,
        )
      : "",
    timezone: approval.scheduleJob?.timezone ?? initialFormState.timezone,
  };
}

export function CreateContentCalendarSlotDialog({
  eligibleApprovals,
  disabled,
  onCreate,
  open: controlledOpen,
  onOpenChange,
  presetApprovalId = null,
}: CreateContentCalendarSlotDialogProps): React.ReactNode {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CalendarSlotFormState>(initialFormState);
  const presetApproval =
    presetApprovalId === null
      ? null
      : (eligibleApprovals.find(
          (approval) => approval.id === presetApprovalId,
        ) ?? null);

  // A link-chosen post is applied once per opening, so later edits stick.
  const [appliedPresetId, setAppliedPresetId] = useState<number | null>(null);
  useEffect(() => {
    if (!open) {
      setAppliedPresetId(null);
      return;
    }
    if (presetApproval === null || appliedPresetId === presetApproval.id)
      return;
    setAppliedPresetId(presetApproval.id);
    setForm(getPresetFormState(presetApproval));
  }, [appliedPresetId, open, presetApproval]);

  const selectedApproval = useMemo(
    () =>
      eligibleApprovals.find(
        (approval) => String(approval.id) === form.approvalId,
      ) ?? null,
    [eligibleApprovals, form.approvalId],
  );

  useEffect(() => {
    if (!open || presetApproval !== null) return;
    if (form.approvalId || eligibleApprovals.length === 0) return;
    const firstApproval = eligibleApprovals[0];
    if (!firstApproval) return;
    setForm((current) => ({
      ...current,
      approvalId: String(firstApproval.id),
      angle: firstApproval.draft.angle,
      cta: firstApproval.variant.cta,
    }));
  }, [eligibleApprovals, form.approvalId, open, presetApproval]);

  function setSelectedApproval(approvalId: string): void {
    const approval = eligibleApprovals.find(
      (candidate) => String(candidate.id) === approvalId,
    );
    setForm((current) => ({
      ...current,
      approvalId,
      angle: approval?.draft.angle ?? current.angle,
      cta: approval?.variant.cta ?? current.cta,
    }));
  }

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const approvalId = Number(form.approvalId);
    setSubmitting(true);
    try {
      await onCreate({
        approvalId,
        purpose: form.purpose,
        slotFor: form.slotFor,
        timezone: form.timezone,
        format: form.format,
        angle: form.angle,
        visualDirection: form.visualDirection,
        cta: form.cta,
        notes: form.notes,
      });
      setForm(initialFormState);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Number.isFinite(Number(form.approvalId)) &&
    form.slotFor.trim() !== "" &&
    form.angle.trim() !== "" &&
    form.visualDirection.trim() !== "" &&
    form.cta.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          disabled={disabled || eligibleApprovals.length === 0}
        >
          <CalendarPlus className="size-4" /> Plan a post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Plan a post</DialogTitle>
            <DialogDescription>
              Pick an approved post, then choose when it goes out and how it
              should look. You can schedule it after that.
            </DialogDescription>
          </DialogHeader>

          <Field label="Approved post" htmlFor="calendar-approval">
            <select
              id="calendar-approval"
              value={form.approvalId}
              required
              onChange={(event) => setSelectedApproval(event.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="" disabled>
                Select an approved post
              </option>
              {eligibleApprovals.map((approval) => (
                <option key={approval.id} value={approval.id}>
                  {approval.campaign_name} · {approval.draft.target_author_name}{" "}
                  · Version {approval.variant.variant_number}
                </option>
              ))}
            </select>
          </Field>

          {selectedApproval && (
            <div className="bg-muted/40 rounded-lg border p-3 text-sm">
              <p className="font-medium">{selectedApproval.variant.hook}</p>
              <p className="text-muted-foreground mt-1 line-clamp-2">
                {selectedApproval.variant.body}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date and time" htmlFor="calendar-slot-for">
              <Input
                id="calendar-slot-for"
                type="datetime-local"
                value={form.slotFor}
                required
                maxLength={80}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    slotFor: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Time zone" htmlFor="calendar-timezone">
              <Input
                id="calendar-timezone"
                value={form.timezone}
                maxLength={80}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Goal" htmlFor="calendar-purpose">
              <OptionSelect
                id="calendar-purpose"
                value={form.purpose}
                options={purposeOptions}
                labels={purposeLabels}
                onChange={(purpose) =>
                  setForm((current) => ({ ...current, purpose }))
                }
              />
            </Field>
            <Field label="Format" htmlFor="calendar-format">
              <OptionSelect
                id="calendar-format"
                value={form.format}
                options={formatOptions}
                labels={formatLabels}
                onChange={(format) =>
                  setForm((current) => ({ ...current, format }))
                }
              />
            </Field>
          </div>

          <PlanningFields form={form} setForm={setForm} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Saving…" : "Plan post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionSelect<T extends string>({
  id,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}): React.ReactNode {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

function PlanningFields({
  form,
  setForm,
}: {
  form: CalendarSlotFormState;
  setForm: React.Dispatch<React.SetStateAction<CalendarSlotFormState>>;
}): React.ReactNode {
  return (
    <div className="space-y-4">
      <Field label="Angle" htmlFor="calendar-angle">
        <Textarea
          id="calendar-angle"
          value={form.angle}
          required
          maxLength={500}
          onChange={(event) =>
            setForm((current) => ({ ...current, angle: event.target.value }))
          }
        />
      </Field>
      <Field label="Look and feel" htmlFor="calendar-visual-direction">
        <Textarea
          id="calendar-visual-direction"
          value={form.visualDirection}
          required
          maxLength={500}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              visualDirection: event.target.value,
            }))
          }
        />
      </Field>
      <Field label="Call to action" htmlFor="calendar-cta">
        <Textarea
          id="calendar-cta"
          value={form.cta}
          required
          maxLength={500}
          onChange={(event) =>
            setForm((current) => ({ ...current, cta: event.target.value }))
          }
        />
      </Field>
      <Field label="Notes" htmlFor="calendar-notes">
        <Textarea
          id="calendar-notes"
          value={form.notes}
          maxLength={1000}
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
