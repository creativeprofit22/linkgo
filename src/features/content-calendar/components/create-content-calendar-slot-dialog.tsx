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

export function CreateContentCalendarSlotDialog({
  eligibleApprovals,
  disabled,
  onCreate,
}: CreateContentCalendarSlotDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CalendarSlotFormState>(initialFormState);

  const selectedApproval = useMemo(
    () =>
      eligibleApprovals.find(
        (approval) => String(approval.id) === form.approvalId,
      ) ?? null,
    [eligibleApprovals, form.approvalId],
  );

  useEffect(() => {
    if (!open) return;
    if (form.approvalId || eligibleApprovals.length === 0) return;
    const firstApproval = eligibleApprovals[0];
    if (!firstApproval) return;
    setForm((current) => ({
      ...current,
      approvalId: String(firstApproval.id),
      angle: firstApproval.draft.angle,
      cta: firstApproval.variant.cta,
    }));
  }, [eligibleApprovals, form.approvalId, open]);

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
          <CalendarPlus className="size-4" /> Create slot
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Create calendar slot</DialogTitle>
            <DialogDescription>
              Pick an approved post and add the planning metadata required
              before scheduling.
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
                  · Approval #{approval.id}
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
            <Field label="Slot for" htmlFor="calendar-slot-for">
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
            <Field label="Timezone label" htmlFor="calendar-timezone">
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
            <Field label="Purpose" htmlFor="calendar-purpose">
              <OptionSelect
                id="calendar-purpose"
                value={form.purpose}
                options={purposeOptions}
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
              {submitting ? "Creating…" : "Create slot"}
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
  onChange,
}: {
  id: string;
  value: T;
  options: T[];
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
          {option}
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
      <Field label="Visual direction" htmlFor="calendar-visual-direction">
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
      <Field label="CTA" htmlFor="calendar-cta">
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
