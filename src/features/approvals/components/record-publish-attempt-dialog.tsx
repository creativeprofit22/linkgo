import { Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  PublishAttemptStatus,
  RecordPublishAttemptInput,
} from "@/features/approvals/types";

interface RecordPublishAttemptDialogProps {
  approvalId: number;
  scheduleJobId: number | undefined;
  initialStatus: PublishAttemptStatus;
  triggerLabel: string;
  onRecord: (input: RecordPublishAttemptInput) => Promise<void>;
}

interface PublishAttemptFormState {
  status: PublishAttemptStatus;
  externalPostUrl: string;
  platformPostId: string;
  errorMessage: string;
}

function getInitialFormState(
  status: PublishAttemptStatus,
): PublishAttemptFormState {
  return {
    status,
    externalPostUrl: "",
    platformPostId: "",
    errorMessage: "",
  };
}

function getValidationMessage(form: PublishAttemptFormState): string {
  if (
    form.status === "succeeded" &&
    form.externalPostUrl.trim() === "" &&
    form.platformPostId.trim() === ""
  ) {
    return "LinkedIn URL or platform post ID is required for success";
  }

  if (form.status === "failed" && form.errorMessage.trim() === "") {
    return "Failure reason is required for failed attempts";
  }

  return "";
}

export function RecordPublishAttemptDialog({
  approvalId,
  scheduleJobId,
  initialStatus,
  triggerLabel,
  onRecord,
}: RecordPublishAttemptDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PublishAttemptFormState>(() =>
    getInitialFormState(initialStatus),
  );
  const validationMessage = getValidationMessage(form);
  const isSuccessEvidenceRequired = form.status === "succeeded";
  const isFailureReasonRequired = form.status === "failed";

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (validationMessage !== "") {
      return;
    }

    if (
      form.status === "succeeded" &&
      !window.confirm(
        "Record this post as published? This does not call LinkedIn.",
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const input: RecordPublishAttemptInput = {
        approvalId,
        status: form.status,
        externalPostUrl: form.externalPostUrl,
        platformPostId: form.platformPostId,
        errorMessage: form.errorMessage,
      };
      if (scheduleJobId !== undefined) input.scheduleJobId = scheduleJobId;
      await onRecord(input);
      setForm(getInitialFormState(initialStatus));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Send className="size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Record publish attempt</DialogTitle>
            <DialogDescription>
              Store the manual LinkedIn outcome locally. This does not call
              LinkedIn or publish anything.
            </DialogDescription>
          </DialogHeader>

          <Field label="Status" htmlFor="publish-attempt-status">
            <select
              id="publish-attempt-status"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as PublishAttemptStatus,
                }))
              }
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
            </select>
          </Field>

          <Field
            label="LinkedIn post URL"
            htmlFor="publish-attempt-url"
            required={isSuccessEvidenceRequired}
          >
            <Input
              id="publish-attempt-url"
              value={form.externalPostUrl}
              maxLength={1000}
              placeholder="https://www.linkedin.com/posts/..."
              required={
                isSuccessEvidenceRequired && form.platformPostId.trim() === ""
              }
              aria-describedby="publish-attempt-validation"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  externalPostUrl: event.target.value,
                }))
              }
            />
          </Field>

          <Field
            label="Platform post ID"
            htmlFor="publish-attempt-platform-id"
            required={isSuccessEvidenceRequired}
          >
            <Input
              id="publish-attempt-platform-id"
              value={form.platformPostId}
              maxLength={200}
              required={
                isSuccessEvidenceRequired && form.externalPostUrl.trim() === ""
              }
              aria-describedby="publish-attempt-validation"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  platformPostId: event.target.value,
                }))
              }
            />
          </Field>

          <Field
            label="Failure reason"
            htmlFor="publish-attempt-error"
            required={isFailureReasonRequired}
          >
            <Textarea
              id="publish-attempt-error"
              value={form.errorMessage}
              maxLength={1000}
              rows={4}
              required={isFailureReasonRequired}
              aria-describedby="publish-attempt-validation"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  errorMessage: event.target.value,
                }))
              }
            />
          </Field>

          {validationMessage !== "" ? (
            <p
              id="publish-attempt-validation"
              className="text-destructive text-sm"
            >
              {validationMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || validationMessage !== ""}
            >
              {submitting ? "Recording…" : "Record attempt"}
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
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
