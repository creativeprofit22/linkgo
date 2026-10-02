import { Pencil } from "lucide-react";
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
  formatLabels,
  purposeLabels,
} from "@/features/content-calendar/components/content-calendar-status-badge";
import type {
  ContentCalendarFormat,
  ContentCalendarPurpose,
  ContentCalendarSlotWithDetails,
  UpdateContentCalendarSlotInput,
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

interface EditContentCalendarSlotDialogProps {
  slot: ContentCalendarSlotWithDetails;
  disabled: boolean;
  onUpdate: (input: UpdateContentCalendarSlotInput) => Promise<void>;
}

interface CalendarSlotFormState {
  slotFor: string;
  timezone: string;
  purpose: ContentCalendarPurpose;
  format: ContentCalendarFormat;
  angle: string;
  visualDirection: string;
  cta: string;
  notes: string;
}

function getInitialFormState(
  slot: ContentCalendarSlotWithDetails,
): CalendarSlotFormState {
  return {
    slotFor: slot.slot_for,
    timezone: slot.timezone,
    purpose: slot.purpose,
    format: slot.format,
    angle: slot.angle,
    visualDirection: slot.visual_direction,
    cta: slot.cta,
    notes: slot.notes,
  };
}

export function EditContentCalendarSlotDialog({
  slot,
  disabled,
  onUpdate,
}: EditContentCalendarSlotDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CalendarSlotFormState>(() =>
    getInitialFormState(slot),
  );

  useEffect(() => {
    if (!open) return;
    setForm(getInitialFormState(slot));
  }, [open, slot]);

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onUpdate({
        id: slot.id,
        purpose: form.purpose,
        slotFor: form.slotFor,
        timezone: form.timezone,
        format: form.format,
        angle: form.angle,
        visualDirection: form.visualDirection,
        cta: form.cta,
        notes: form.notes,
      });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    form.slotFor.trim() !== "" &&
    form.angle.trim() !== "" &&
    form.visualDirection.trim() !== "" &&
    form.cta.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <Pencil className="size-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit planned post</DialogTitle>
            <DialogDescription>
              Change the plan for this post. Its approval stays the same.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Date and time"
              htmlFor={`calendar-slot-for-${slot.id}`}
            >
              <Input
                id={`calendar-slot-for-${slot.id}`}
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
            <Field label="Time zone" htmlFor={`calendar-timezone-${slot.id}`}>
              <Input
                id={`calendar-timezone-${slot.id}`}
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
            <Field label="Goal" htmlFor={`calendar-purpose-${slot.id}`}>
              <OptionSelect
                id={`calendar-purpose-${slot.id}`}
                value={form.purpose}
                options={purposeOptions}
                labels={purposeLabels}
                onChange={(purpose) =>
                  setForm((current) => ({ ...current, purpose }))
                }
              />
            </Field>
            <Field label="Format" htmlFor={`calendar-format-${slot.id}`}>
              <OptionSelect
                id={`calendar-format-${slot.id}`}
                value={form.format}
                options={formatOptions}
                labels={formatLabels}
                onChange={(format) =>
                  setForm((current) => ({ ...current, format }))
                }
              />
            </Field>
          </div>

          <div className="space-y-4">
            <Field label="Angle" htmlFor={`calendar-angle-${slot.id}`}>
              <Textarea
                id={`calendar-angle-${slot.id}`}
                value={form.angle}
                required
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    angle: event.target.value,
                  }))
                }
              />
            </Field>
            <Field
              label="Look and feel"
              htmlFor={`calendar-visual-direction-${slot.id}`}
            >
              <Textarea
                id={`calendar-visual-direction-${slot.id}`}
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
            <Field label="Call to action" htmlFor={`calendar-cta-${slot.id}`}>
              <Textarea
                id={`calendar-cta-${slot.id}`}
                value={form.cta}
                required
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    cta: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Notes" htmlFor={`calendar-notes-${slot.id}`}>
              <Textarea
                id={`calendar-notes-${slot.id}`}
                value={form.notes}
                maxLength={1000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting ? "Saving…" : "Save changes"}
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
