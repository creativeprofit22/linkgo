import { CalendarClock } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
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

interface ScheduleApprovalDialogProps {
  approvalId: number;
  onSchedule: (input: ScheduleApprovalInput) => Promise<void>;
}

interface ScheduleApprovalFormState {
  scheduledFor: string;
  timezone: string;
}

const initialFormState: ScheduleApprovalFormState = {
  scheduledFor: "",
  timezone: "local",
};

export function ScheduleApprovalDialog({
  approvalId,
  onSchedule,
}: ScheduleApprovalDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ScheduleApprovalFormState>(initialFormState);

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
      setForm(initialFormState);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <CalendarClock className="size-4" /> Schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Schedule approval</DialogTitle>
            <DialogDescription>
              Create a local schedule record only. Linkgo will not publish or
              run a background scheduler.
            </DialogDescription>
          </DialogHeader>

          <Field label="Scheduled for" htmlFor="approval-scheduled-for">
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

          <Field label="Timezone label" htmlFor="approval-timezone">
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
              {submitting ? "Scheduling…" : "Schedule approval"}
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
