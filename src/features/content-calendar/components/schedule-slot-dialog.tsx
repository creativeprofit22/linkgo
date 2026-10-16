import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { DateTimePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ContentCalendarSlotWithDetails,
  RescheduleContentCalendarSlotInput,
} from "@/features/content-calendar/types";
import { toDateTimeLocalValue } from "@/lib/date-time/wall-clock";

interface ScheduleSlotDialogProps {
  slot: ContentCalendarSlotWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReschedule: (input: RescheduleContentCalendarSlotInput) => Promise<void>;
}

interface ScheduleFormState {
  slotFor: string;
  timezone: string;
}

function getInitialFormState(
  slot: ContentCalendarSlotWithDetails,
): ScheduleFormState {
  return {
    slotFor: toDateTimeLocalValue(slot.slot_for, slot.timezone),
    timezone: slot.timezone,
  };
}

/**
 * Picks a new time for a slot that is waiting to post or didn't post. Only
 * the time changes; the rest of the plan is sent back as it is.
 */
export function ScheduleSlotDialog({
  slot,
  open,
  onOpenChange,
  onReschedule,
}: ScheduleSlotDialogProps): React.ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ScheduleFormState>(() =>
    getInitialFormState(slot),
  );

  // Reset only when the dialog opens: a slot reload mid-edit (or after a
  // failed save) must not overwrite the time the user picked.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) setForm(getInitialFormState(slot));
  }, [open, slot]);

  const waiting = slot.scheduleJob?.status === "scheduled";
  const canSubmit = form.slotFor.trim() !== "" && !submitting;

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onReschedule({
        id: slot.id,
        purpose: slot.purpose,
        slotFor: form.slotFor,
        timezone: form.timezone,
        format: slot.format,
        angle: slot.angle,
        visualDirection: slot.visual_direction,
        cta: slot.cta,
        notes: slot.notes,
        activeScheduleJobId:
          waiting && slot.scheduleJob ? slot.scheduleJob.id : null,
      });
      onOpenChange(false);
    } catch {
      // The hook already showed what went wrong; keep the dialog open.
    } finally {
      setSubmitting(false);
    }
  };

  const timezoneId = `calendar-reschedule-timezone-${slot.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Pick a new time</DialogTitle>
            <DialogDescription>
              {waiting
                ? "The current time is cancelled and the post is scheduled for the new one."
                : "This post didn't go out. Pick a time to try again."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <DateTimePicker
              id={`calendar-reschedule-for-${slot.id}`}
              className="sm:col-span-2"
              value={form.slotFor}
              timezone={form.timezone}
              onChange={(slotFor) =>
                setForm((current) => ({ ...current, slotFor }))
              }
            />
            <div className="space-y-2">
              <Label htmlFor={timezoneId}>Time zone</Label>
              <Input
                id={timezoneId}
                value={form.timezone}
                maxLength={80}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Not now
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Saving…" : "Save new time"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
