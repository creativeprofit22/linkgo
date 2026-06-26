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
import type {
  MetricEligibleApproval,
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
  if (form.approvalId === "") return "Published post is required";
  if (!Number.isFinite(Date.parse(form.measuredAt))) {
    return "Measured time must be a valid date";
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
    return "Metric counts must be whole numbers from 0 through 1,000,000,000";
  }
  if (form.ctr.trim() !== "") {
    const ctr = Number(form.ctr);
    if (!Number.isFinite(ctr) || ctr < 0 || ctr > 100) {
      return "CTR must be 0 through 100";
    }
  }
  return "";
}

export function RecordPostMetricDialog({
  eligibleApprovals,
  selectedCampaignArchived,
  disabled,
  onRecord,
}: RecordPostMetricDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    const approvalStillEligible = eligibleApprovals.some(
      (approval) => approval.approval.id === Number(form.approvalId),
    );
    if (!approvalStillEligible) {
      setForm((current) => ({
        ...current,
        approvalId: String(eligibleApprovals[0]?.approval.id ?? ""),
      }));
    }
  }, [eligibleApprovals, form.approvalId]);

  const validationMessage = getValidationMessage(form);
  const disabledReason = selectedCampaignArchived
    ? "Archived campaign"
    : eligibleApprovals.length === 0
      ? "No published posts"
      : "Record metrics";

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
          {disabled ? disabledReason : "Record metrics"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Record metrics</DialogTitle>
            <DialogDescription>
              Add a manual LinkedIn metric snapshot. Linkgo stores it locally
              and does not collect metrics automatically.
            </DialogDescription>
          </DialogHeader>

          <Field label="Published post" htmlFor="metric-approval" required>
            <select
              id="metric-approval"
              value={form.approvalId}
              required
              onChange={(event) => updateForm("approvalId", event.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {eligibleApprovals.map((approval) => (
                <option key={approval.approval.id} value={approval.approval.id}>
                  {approval.source.author_name || "Unknown author"} · Variant{" "}
                  {approval.variant.variant_number}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Measured at" htmlFor="metric-measured-at" required>
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
              onChange={(value) => updateForm("reactions", value)}
            />
            <NumberField
              label="Comments"
              id="metric-comments"
              value={form.comments}
              onChange={(value) => updateForm("comments", value)}
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

          <Field label="CTR percent optional" htmlFor="metric-ctr">
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
              {submitting ? "Recording…" : "Record metrics"}
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
