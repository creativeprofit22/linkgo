import { CalendarClock } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { z } from "zod";
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
import type { ScheduleApprovalInput } from "@/features/approvals/types";
import { useSessionFormState } from "@/hooks/use-session-form-state";

interface ScheduleApprovalDialogProps {
  approvalId: number;
  onSchedule: (input: ScheduleApprovalInput) => Promise<void>;
}

const scheduleApprovalFormSchema = z.object({
  scheduledFor: z.string().max(80),
  timezone: z.string().max(80),
});

type ScheduleApprovalFormState = z.infer<typeof scheduleApprovalFormSchema>;

function getInitialFormState(): ScheduleApprovalFormState {
  return { scheduledFor: "", timezone: "local" };
}

export function ScheduleApprovalDialog({
  approvalId,
  onSchedule,
}: ScheduleApprovalDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Typed values survive Cancel and Back until the post is scheduled.
  const {
    value: form,
    setValue: setForm,
    clear: clearForm,
  } = useSessionFormState(
    `schedule.${approvalId}`,
    scheduleApprovalFormSchema,
    getInitialFormState,
  );

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSchedule({
        approvalId,
        scheduledFor: form.scheduledFor,
        timezone: form.timezone,
      });
      clearForm();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CalendarClock aria-hidden="true" className="size-4" /> Pick a time
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Schedule post</DialogTitle>
            <DialogDescription>
              Choose when this approved post should go out. Linkgo never posts
              without your OK.
            </DialogDescription>
          </DialogHeader>

          <Field label="Date and time" htmlFor="approval-scheduled-for">
            <Input
              id="approval-scheduled-for"
              type="datetime-local"
              value={form.scheduledFor}
              maxLength={80}
              required
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  scheduledFor: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Time zone" htmlFor="approval-timezone">
            <Input
              id="approval-timezone"
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !form.scheduledFor}>
              {submitting ? "Scheduling…" : "Schedule post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
