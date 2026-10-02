import { AlertCircle, Check, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EditCandidatePolicyDialog } from "@/features/candidate-policy/components/edit-candidate-policy-dialog";
import type {
  CandidateIntakePolicy,
  UpdateCandidateIntakePolicyInput,
} from "@/features/candidate-policy/types";

interface CandidatePolicyCardProps {
  policy: CandidateIntakePolicy | null;
  loading: boolean;
  pending: boolean;
  error: string | null;
  archived: boolean;
  onRetry: () => Promise<void>;
  onSave: (
    input: UpdateCandidateIntakePolicyInput,
  ) => Promise<CandidateIntakePolicy>;
}

const fixedRules = [
  "Secure LinkedIn links only",
  "Post date and time required",
  "Skips people you've already contacted",
];

export function CandidatePolicyCard({
  policy,
  loading,
  pending,
  error,
  archived,
  onRetry,
  onSave,
}: CandidatePolicyCardProps): React.ReactNode {
  if (loading) {
    return (
      <Card className="bg-card/70" aria-busy="true">
        <CardContent className="text-muted-foreground p-5 text-sm">
          Loading idea filters…
        </CardContent>
      </Card>
    );
  }

  if (error || policy === null) {
    return (
      <Card className="bg-card/70">
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">We couldn't load your idea filters</p>
              <p className="text-muted-foreground mt-1 text-sm break-words">
                {error ?? "Select Try again to load them."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRetry()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/70" data-testid="candidate-policy-card">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="text-linkgo-green mt-0.5 size-5 shrink-0" />
          <div>
            <CardTitle className="text-base">Idea filters</CardTitle>
            <CardDescription className="mt-1">
              Imported ideas must pass these rules before Linkgo saves them.
            </CardDescription>
          </div>
        </div>
        <EditCandidatePolicyDialog
          policy={policy}
          pending={pending}
          disabled={archived}
          onSave={onSave}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <PolicyFact
            label={`Posts up to ${policy.max_post_age_days} days old`}
          />
          {fixedRules.map((rule) => (
            <PolicyFact key={rule} label={rule} />
          ))}
          <PolicyFact
            label={`${policy.banned_topics.length} blocked topic${
              policy.banned_topics.length === 1 ? "" : "s"
            }`}
          />
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Ideas you add yourself with Add idea skip these filters, so check them
          carefully.
          {archived
            ? " This campaign is archived, so you can't change its filters."
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function PolicyFact({ label }: { label: string }): React.ReactNode {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-sm">
      <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="break-words">{label}</span>
    </div>
  );
}
