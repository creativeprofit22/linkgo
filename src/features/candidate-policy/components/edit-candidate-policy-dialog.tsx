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
  MAX_BANNED_TOPICS,
  MAX_BANNED_TOPIC_LENGTH,
  updateCandidateIntakePolicySchema,
} from "@/features/candidate-policy/schemas";
import type {
  CandidateIntakePolicy,
  UpdateCandidateIntakePolicyInput,
} from "@/features/candidate-policy/types";

interface EditCandidatePolicyDialogProps {
  policy: CandidateIntakePolicy;
  disabled?: boolean;
  pending: boolean;
  onSave: (
    input: UpdateCandidateIntakePolicyInput,
  ) => Promise<CandidateIntakePolicy>;
}

interface PolicyFormState {
  maxPostAgeDays: string;
  bannedTopics: string;
}

function formFromPolicy(policy: CandidateIntakePolicy): PolicyFormState {
  return {
    maxPostAgeDays: String(policy.max_post_age_days),
    bannedTopics: policy.banned_topics.join("\n"),
  };
}

export function EditCandidatePolicyDialog({
  policy,
  disabled = false,
  pending,
  onSave,
}: EditCandidatePolicyDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PolicyFormState>(() =>
    formFromPolicy(policy),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(formFromPolicy(policy));
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [open, policy]);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (pending && !nextOpen) return;
    setOpen(nextOpen);
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);
    const bannedTopics = form.bannedTopics
      .split(/\r?\n/gu)
      .map((topic) => topic.trim())
      .filter(Boolean);
    const result = updateCandidateIntakePolicySchema.safeParse({
      campaignId: policy.campaign_id,
      maxPostAgeDays: Number(form.maxPostAgeDays),
      bannedTopics,
    });
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
      await onSave(result.data);
      setOpen(false);
    } catch (caught) {
      setSubmitError(
        caught instanceof Error ? caught.message : "Policy could not be saved",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Pencil className="size-4" /> Edit policy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>Edit candidate intake policy</DialogTitle>
            <DialogDescription>
              Bulk and unattended intake must pass every rule before Linkgo
              stores candidate records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="policy-max-post-age">
              Maximum post age in days
            </Label>
            <Input
              id="policy-max-post-age"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={form.maxPostAgeDays}
              aria-describedby="policy-max-post-age-help policy-max-post-age-error"
              aria-invalid={fieldErrors.maxPostAgeDays !== undefined}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  maxPostAgeDays: event.target.value,
                }))
              }
            />
            <p
              id="policy-max-post-age-help"
              className="text-muted-foreground text-xs"
            >
              Allowed range: 1 to 365 days. The timestamp must include a
              timezone.
            </p>
            {fieldErrors.maxPostAgeDays && (
              <p
                id="policy-max-post-age-error"
                className="text-destructive text-sm"
              >
                {fieldErrors.maxPostAgeDays}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-banned-topics">Banned topics</Label>
            <Textarea
              id="policy-banned-topics"
              rows={7}
              value={form.bannedTopics}
              aria-describedby="policy-banned-topics-help policy-banned-topics-error"
              aria-invalid={fieldErrors.bannedTopics !== undefined}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  bannedTopics: event.target.value,
                }))
              }
              placeholder={"cryptocurrency\npolitical campaigning"}
            />
            <p
              id="policy-banned-topics-help"
              className="text-muted-foreground text-xs"
            >
              One phrase per line. Up to {MAX_BANNED_TOPICS} phrases, each up to{" "}
              {MAX_BANNED_TOPIC_LENGTH} characters. Matching uses whole words
              and phrases.
            </p>
            {fieldErrors.bannedTopics && (
              <p
                id="policy-banned-topics-error"
                className="text-destructive text-sm"
              >
                {fieldErrors.bannedTopics}
              </p>
            )}
          </div>

          <section
            aria-labelledby="policy-fixed-rules"
            className="rounded-lg border p-4"
          >
            <h3 id="policy-fixed-rules" className="text-sm font-semibold">
              Fixed safety rules
            </h3>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>
                Source must use HTTPS on linkedin.com or a LinkedIn subdomain.
              </li>
              <li>
                Timestamp must be absolute and timezone-bearing. Values more
                than five minutes in the future are blocked.
              </li>
              <li>
                Successful prior contact by target, URN, or profile is blocked.
              </li>
            </ul>
          </section>

          {submitError && (
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
              {pending ? "Saving…" : "Save policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
