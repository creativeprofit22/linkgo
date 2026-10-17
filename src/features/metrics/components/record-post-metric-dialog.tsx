import { BarChart3 } from "lucide-react";
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
import { parseStoredUtc } from "@/features/metrics/patterns";
import type {
  MetricEligibleApproval,
  PostMetric,
  RecordPostMetricInput,
} from "@/features/metrics/types";

interface RecordMetricFormState {
  approvalId: string;
  measuredAt: string;
  impressions: string;
  reactions: string;
  comments: string;
  reposts: string;
  profileVisits: string;
  linkClicks: string;
  ctr: string;
  notes: string;
}

interface RecordPostMetricDialogProps {
  eligibleApprovals: MetricEligibleApproval[];
  selectedCampaignArchived: boolean;
  disabled: boolean;
  onRecord: (input: RecordPostMetricInput) => Promise<void>;
  /** Controlled open state, e.g. when a link opens the dialog. */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /**
   * Post picked when the dialog opens; must be in `eligibleApprovals`. The
   * post is then shown read-only ("How did it do?") unless the person chooses
   * to pick a different one.
   */
  initialApprovalId?: number | undefined;
  /**
   * Newest LinkedIn snapshot per post (keyed by approval id). When the
   * selected post has one, reactions and comments are prefilled so the person
   * only checks and adds the rest.
   */
  latestAutoMetrics?: ReadonlyMap<number, LatestAutoMetric> | undefined;
}

export type LatestAutoMetric = Pick<
  PostMetric,
  "approval_id" | "reactions" | "comments" | "measured_at"
>;

function formatPostDay(stored: string): string {
  const date = parseStoredUtc(stored);
  if (date === null) return "on an unknown day";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getLocalDateTimeValue(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getInitialFormState(
  eligibleApprovals: MetricEligibleApproval[],
): RecordMetricFormState {
  return {
    approvalId: String(eligibleApprovals[0]?.approval.id ?? ""),
    measuredAt: getLocalDateTimeValue(),
    impressions: "0",
    reactions: "0",
    comments: "0",
    reposts: "0",
    profileVisits: "0",
    linkClicks: "0",
    ctr: "",
    notes: "",
  };
}

function parseRequiredInteger(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000
    ? parsed
    : null;
}

function getValidationMessage(form: RecordMetricFormState): string {
  if (form.approvalId === "") return "Choose a post.";
  if (!Number.isFinite(Date.parse(form.measuredAt))) {
    return "Pick the date and time you checked these numbers.";
  }
  const fields = [
    form.impressions,
    form.reactions,
    form.comments,
    form.reposts,
    form.profileVisits,
    form.linkClicks,
  ];
  if (fields.some((field) => parseRequiredInteger(field) === null)) {
    return "Enter whole numbers from 0 to 1,000,000,000.";
  }
  if (form.ctr.trim() !== "") {
    const ctr = Number(form.ctr);
    if (!Number.isFinite(ctr) || ctr < 0 || ctr > 100) {
      return "Click-through rate must be from 0 to 100.";
    }
  }
  return "";
}

export function RecordPostMetricDialog({
  eligibleApprovals,
  selectedCampaignArchived,
  disabled,
  onRecord,
  open: openProp,
  onOpenChange,
  initialApprovalId,
  latestAutoMetrics,
}: RecordPostMetricDialogProps): React.ReactNode {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (next: boolean): void => {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [prefilled, setPrefilled] = useState<{
    approvalId: string;
    measuredAt: string;
  } | null>(null);
  // Once the person types reactions or comments, prefill never overwrites them.
  const [countsTouched, setCountsTouched] = useState(false);
  const [form, setForm] = useState<RecordMetricFormState>(() =>
    getInitialFormState(eligibleApprovals),
  );
  const selectedApproval = useMemo(
    () =>
      eligibleApprovals.find(
        (approval) => approval.approval.id === Number(form.approvalId),
      ) ?? null,
    [eligibleApprovals, form.approvalId],
  );

  // Opening from a link picks that post; nothing is saved until submit.
  useEffect(() => {
    if (!open || initialApprovalId === undefined) return;
    setPicking(false);
    setForm((current) => ({
      ...current,
      approvalId: String(initialApprovalId),
    }));
  }, [open, initialApprovalId]);

  // Whichever post is selected, fill in reactions and comments from its
  // newest LinkedIn snapshot while the person hasn't typed them yet.
  const selectedAuto = latestAutoMetrics?.get(Number(form.approvalId));
  const autoReactions = selectedAuto?.reactions;
  const autoComments = selectedAuto?.comments;
  const autoMeasuredAt = selectedAuto?.measured_at;
  const selectedApprovalId = form.approvalId;
  useEffect(() => {
    if (!open || countsTouched) return;
    const prefill =
      autoReactions !== undefined &&
      autoComments !== undefined &&
      autoMeasuredAt !== undefined;
    setPrefilled(
      prefill
        ? { approvalId: selectedApprovalId, measuredAt: autoMeasuredAt }
        : null,
    );
    // Untouched counts are either the defaults or an earlier prefill, so a
    // post without a snapshot goes back to the defaults.
    setForm((current) => ({
      ...current,
      reactions: prefill ? String(autoReactions) : "0",
      comments: prefill ? String(autoComments) : "0",
    }));
  }, [
    open,
    countsTouched,
    selectedApprovalId,
    autoReactions,
    autoComments,
    autoMeasuredAt,
  ]);

  const linkedApproval =
    initialApprovalId === undefined
      ? null
      : (eligibleApprovals.find(
          (approval) => approval.approval.id === initialApprovalId,
        ) ?? null);
  const showLinkedPost =
    !picking &&
    linkedApproval !== null &&
    linkedApproval.approval.id === Number(form.approvalId);
  const prefilledAt =
    prefilled !== null && prefilled.approvalId === form.approvalId
      ? prefilled.measuredAt
      : null;

  useEffect(() => {
    const approvalStillEligible = eligibleApprovals.some(
      (approval) => approval.approval.id === Number(form.approvalId),
    );
    if (!approvalStillEligible) {
      // Keep a linked post picked when it is eligible; else the first one.
      const linked = eligibleApprovals.find(
        (approval) => approval.approval.id === initialApprovalId,
      );
      const fallback = linked ?? eligibleApprovals[0];
      setForm((current) => ({
        ...current,
        approvalId: String(fallback?.approval.id ?? ""),
      }));
    }
  }, [eligibleApprovals, form.approvalId, initialApprovalId]);

  const validationMessage = getValidationMessage(form);
  const disabledReason = selectedCampaignArchived
    ? "Campaign archived"
    : eligibleApprovals.length === 0
      ? "No posts yet"
      : "Add results";

  function updateForm<K extends keyof RecordMetricFormState>(
    key: K,
    value: RecordMetricFormState[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (validationMessage !== "" || selectedApproval === null) return;
    setSubmitting(true);
    try {
      const input: RecordPostMetricInput = {
        campaignId: selectedApproval.campaign.id,
        approvalId: selectedApproval.approval.id,
        publishAttemptId: selectedApproval.latestPublishAttempt.id,
        measuredAt: form.measuredAt,
        impressions: Number(form.impressions),
        reactions: Number(form.reactions),
        comments: Number(form.comments),
        reposts: Number(form.reposts),
        profileVisits: Number(form.profileVisits),
        linkClicks: Number(form.linkClicks),
        ctr: form.ctr.trim() === "" ? null : Number(form.ctr),
        notes: form.notes,
      };
      await onRecord(input);
      setForm(getInitialFormState(eligibleApprovals));
      setPrefilled(null);
      setCountsTouched(false);
      setPicking(false);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled || selectedCampaignArchived}>
          <BarChart3 className="size-4" />{" "}
          {disabled ? disabledReason : "Add results"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>
              {showLinkedPost ? "How did it do?" : "Add results"}
            </DialogTitle>
            <DialogDescription>
              Copy the numbers from LinkedIn for this post. Linkgo saves them on
              this computer.
            </DialogDescription>
          </DialogHeader>

          {showLinkedPost ? (
            <div
              className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="metric-linked-post"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-muted-foreground text-xs font-medium">
                  Post
                </p>
                <p className="truncate text-sm font-medium">
                  {linkedApproval.variant.hook.trim() || "Untitled post"}
                </p>
                <p className="text-muted-foreground text-xs">
                  Went out{" "}
                  {formatPostDay(
                    linkedApproval.latestPublishAttempt.created_at,
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => setPicking(true)}
              >
                Pick a different post
              </Button>
            </div>
          ) : (
            <Field label="Post" htmlFor="metric-approval" required>
              <select
                id="metric-approval"
                value={form.approvalId}
                required
                onChange={(event) =>
                  updateForm("approvalId", event.target.value)
                }
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {eligibleApprovals.map((approval) => (
                  <option
                    key={approval.approval.id}
                    value={approval.approval.id}
                  >
                    {approval.source.author_name || "Unknown author"} · Version{" "}
                    {approval.variant.variant_number}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {prefilledAt !== null ? (
            <p
              role="status"
              className="text-muted-foreground bg-linkgo-blue/5 rounded-md border px-3 py-2 text-xs"
            >
              Reactions and comments are filled in from LinkedIn on{" "}
              {formatPostDay(prefilledAt)}. Check them, then add the rest.
            </p>
          ) : null}

          <Field label="Checked on" htmlFor="metric-measured-at" required>
            <Input
              id="metric-measured-at"
              type="datetime-local"
              value={form.measuredAt}
              required
              onChange={(event) => updateForm("measuredAt", event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Impressions"
              id="metric-impressions"
              value={form.impressions}
              onChange={(value) => updateForm("impressions", value)}
            />
            <NumberField
              label="Reactions"
              id="metric-reactions"
              value={form.reactions}
              onChange={(value) => {
                setCountsTouched(true);
                updateForm("reactions", value);
              }}
            />
            <NumberField
              label="Comments"
              id="metric-comments"
              value={form.comments}
              onChange={(value) => {
                setCountsTouched(true);
                updateForm("comments", value);
              }}
            />
            <NumberField
              label="Reposts"
              id="metric-reposts"
              value={form.reposts}
              onChange={(value) => updateForm("reposts", value)}
            />
            <NumberField
              label="Profile visits"
              id="metric-profile-visits"
              value={form.profileVisits}
              onChange={(value) => updateForm("profileVisits", value)}
            />
            <NumberField
              label="Link clicks"
              id="metric-link-clicks"
              value={form.linkClicks}
              onChange={(value) => updateForm("linkClicks", value)}
            />
          </div>

          <Field label="Click-through rate % (optional)" htmlFor="metric-ctr">
            <Input
              id="metric-ctr"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.ctr}
              onChange={(event) => updateForm("ctr", event.target.value)}
            />
          </Field>

          <Field label="Notes" htmlFor="metric-notes">
            <Textarea
              id="metric-notes"
              value={form.notes}
              rows={4}
              maxLength={1000}
              onChange={(event) => updateForm("notes", event.target.value)}
            />
          </Field>

          {validationMessage !== "" ? (
            <p className="text-destructive text-sm">{validationMessage}</p>
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
              {submitting ? "Saving…" : "Save results"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <Field label={label} htmlFor={id} required>
      <Input
        id={id}
        type="number"
        min={0}
        max={1_000_000_000}
        value={value}
        required
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
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
