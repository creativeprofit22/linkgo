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
  CommentAttemptStatus,
  CommentThreadWithDetails,
  RecordCommentAttemptInput,
} from "@/features/comments/types";

interface RecordCommentAttemptDialogProps {
  thread: CommentThreadWithDetails;
  status: CommentAttemptStatus;
  onRecord: (input: RecordCommentAttemptInput) => Promise<void>;
  disabled?: boolean;
  triggerLabel?: string;
}

interface AttemptFormState {
  externalCommentUrl: string;
  platformCommentId: string;
  errorMessage: string;
}

const emptyForm: AttemptFormState = {
  externalCommentUrl: "",
  platformCommentId: "",
  errorMessage: "",
};

export function RecordCommentAttemptDialog({
  thread,
  status,
  onRecord,
  disabled = false,
  triggerLabel,
}: RecordCommentAttemptDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AttemptFormState>(emptyForm);
  const isSuccess = status === "succeeded";
  const successReferenceMissing =
    isSuccess &&
    form.externalCommentUrl.trim() === "" &&
    form.platformCommentId.trim() === "";

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (successReferenceMissing) return;
    setSubmitting(true);
    try {
      await onRecord({ commentThreadId: thread.id, status, ...form });
      setForm(emptyForm);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={isSuccess ? "default" : "outline"}
          disabled={disabled}
        >
          {triggerLabel ?? (isSuccess ? "Record posted" : "Record failure")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>
              {isSuccess ? "Record posted comment" : "Record failed comment"}
            </DialogTitle>
            <DialogDescription>
              Store manual LinkedIn comment history locally as a fallback.
            </DialogDescription>
          </DialogHeader>

          {isSuccess ? (
            <div className="space-y-4">
              <Field label="Comment URL" htmlFor={`comment-url-${thread.id}`}>
                <Input
                  id={`comment-url-${thread.id}`}
                  type="url"
                  value={form.externalCommentUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      externalCommentUrl: event.target.value,
                    }))
                  }
                  placeholder="https://www.linkedin.com/feed/update/..."
                />
              </Field>
              <Field
                label="Platform comment ID"
                htmlFor={`comment-id-${thread.id}`}
              >
                <Input
                  id={`comment-id-${thread.id}`}
                  value={form.platformCommentId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      platformCommentId: event.target.value,
                    }))
                  }
                  placeholder="Optional if URL is present"
                />
              </Field>
              {successReferenceMissing ? (
                <p className="text-muted-foreground text-sm">
                  Add a comment URL or platform comment ID.
                </p>
              ) : null}
            </div>
          ) : (
            <Field label="Error message" htmlFor={`comment-error-${thread.id}`}>
              <Textarea
                id={`comment-error-${thread.id}`}
                value={form.errorMessage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    errorMessage: event.target.value,
                  }))
                }
                required
                maxLength={2000}
                placeholder="Paste the manual posting failure or reviewer note."
              />
            </Field>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting || successReferenceMissing}
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
