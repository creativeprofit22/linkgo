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
  "HTTPS LinkedIn only",
  "Absolute timestamp required",
  "Prior successful contacts blocked",
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
          Loading candidate intake policy…
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
              <p className="font-medium">
                Candidate policy could not be loaded
              </p>
              <p className="text-muted-foreground mt-1 text-sm break-words">
                {error ?? "Retry to load the campaign policy."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRetry()}
          >
            Retry
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
            <CardTitle className="text-base">Candidate intake policy</CardTitle>
            <CardDescription className="mt-1">
              Enforced before bulk or unattended intake writes candidate data.
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
          <PolicyFact label={`${policy.max_post_age_days}-day maximum`} />
          {fixedRules.map((rule) => (
            <PolicyFact key={rule} label={rule} />
          ))}
          <PolicyFact
            label={`${policy.banned_topics.length} banned topic${
              policy.banned_topics.length === 1 ? "" : "s"
            }`}
          />
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Manual Add candidate entry is an attended override for historical or
          exceptional material. The operator must review it deliberately.
          {archived ? " This archived campaign is read-only." : ""}
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
