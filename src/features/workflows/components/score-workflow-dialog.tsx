import { useEffect, useMemo, useState } from "react";
import { Gauge, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AGENT_PROVIDER_KEYS,
  AGENT_PROVIDER_LABELS,
  type AgentProviderKey,
} from "@/agent";
import { defaultAgentModelFor } from "@/agent/provider-catalog";
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
import { isAgentProviderReady } from "@/features/agent-runtime/provider-readiness";
import type { ConnectedAccount } from "@/features/integrations/types";
import type {
  ExecuteWorkflowRunInput,
  WorkflowRunWithDetails,
  WorkflowScoringInput,
} from "@/workflows/types";

interface ScoreWorkflowDialogProps {
  run: WorkflowRunWithDetails;
  connectedAccounts: ConnectedAccount[];
  pending: boolean;
  disabled: boolean;
  killSwitchEnabled: boolean;
  onExecute: (input: ExecuteWorkflowRunInput) => Promise<void>;
}

type ConnectedProviderKey = Exclude<AgentProviderKey, "dry_run">;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Scoring could not start";
}

export function ScoreWorkflowDialog({
  run,
  connectedAccounts,
  pending,
  disabled,
  killSwitchEnabled,
  onExecute,
}: ScoreWorkflowDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const connectedProviders = useMemo(
    () =>
      AGENT_PROVIDER_KEYS.filter(
        (providerKey): providerKey is ConnectedProviderKey =>
          providerKey !== "dry_run" &&
          isAgentProviderReady(providerKey, connectedAccounts),
      ),
    [connectedAccounts],
  );
  const [providerKey, setProviderKey] = useState<ConnectedProviderKey | null>(
    connectedProviders[0] ?? null,
  );
  const [modelName, setModelName] = useState(
    connectedProviders[0] === undefined
      ? ""
      : defaultAgentModelFor(connectedProviders[0], connectedAccounts),
  );
  const [minimumScore, setMinimumScore] = useState(60);
  const [autoRejectBelowMinimum, setAutoRejectBelowMinimum] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const scope = run.candidateScope;
  const needsProvider = (scope?.unscored ?? 0) > 0;

  useEffect(() => {
    if (providerKey !== null && connectedProviders.includes(providerKey)) {
      return;
    }
    const nextProvider = connectedProviders[0] ?? null;
    setProviderKey(nextProvider);
    setModelName(
      nextProvider === null
        ? ""
        : defaultAgentModelFor(nextProvider, connectedAccounts),
    );
  }, [connectedAccounts, connectedProviders, providerKey]);

  async function handleSubmit(
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (pending || killSwitchEnabled) return;
    if (needsProvider && (providerKey === null || modelName.trim() === ""))
      return;

    setSubmitError("");
    const input: ExecuteWorkflowRunInput = { id: run.id };
    if (needsProvider && providerKey !== null) {
      const scoring: WorkflowScoringInput = {
        providerKey,
        modelName: modelName.trim(),
        minimumScore,
        autoRejectBelowMinimum,
      };
      input.scoring = scoring;
    }
    try {
      await onExecute(input);
      setOpen(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    }
  }

  const submitDisabled =
    pending ||
    disabled ||
    killSwitchEnabled ||
    scope === null ||
    (needsProvider &&
      (providerKey === null ||
        modelName.trim() === "" ||
        connectedProviders.length === 0));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        if (nextOpen) toast.dismiss();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled || pending}>
          <Gauge aria-hidden="true" className="size-4" />
          {pending ? "Scoring batch…" : "Score batch"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Score attached candidate batch</DialogTitle>
          <DialogDescription>
            Confirm the exact local scope and connected model before sending
            approved campaign context.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {scope === null ? (
            <div className="rounded-lg border p-3 text-sm" role="status">
              No candidate scope is attached. This score step cannot run.
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4">
              <ScopeFact label="Current" value={scope.current} />
              <ScopeFact label="Unscored" value={scope.unscored} />
              <ScopeFact label="Already scored" value={scope.alreadyScored} />
              <ScopeFact label="Removed" value={scope.removed} />
            </dl>
          )}

          {needsProvider ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`score-provider-${run.id}`}>
                  Model provider
                </Label>
                <select
                  id={`score-provider-${run.id}`}
                  autoFocus
                  value={providerKey ?? ""}
                  onChange={(event) => {
                    const nextProvider = event.target
                      .value as ConnectedProviderKey;
                    setProviderKey(nextProvider);
                    setModelName(
                      defaultAgentModelFor(nextProvider, connectedAccounts),
                    );
                  }}
                  disabled={connectedProviders.length === 0 || pending}
                  aria-describedby={`score-provider-help-${run.id}`}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full min-w-0 rounded-md border py-1 ps-3 pe-10 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-2 forced-colors:border"
                >
                  {connectedProviders.length === 0 ? (
                    <option value="">No connected model provider</option>
                  ) : null}
                  {connectedProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {AGENT_PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </select>
                <p
                  id={`score-provider-help-${run.id}`}
                  className="text-muted-foreground text-xs"
                >
                  {connectedProviders.length === 0
                    ? "Open Integrations and connect a model provider before scoring."
                    : "Dry run is excluded from planner scoring."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`score-model-${run.id}`}>Model</Label>
                <Input
                  id={`score-model-${run.id}`}
                  value={modelName}
                  maxLength={120}
                  disabled={pending}
                  onChange={(event) => setModelName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`score-minimum-${run.id}`}>Minimum score</Label>
                <Input
                  id={`score-minimum-${run.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={minimumScore}
                  disabled={pending}
                  onChange={(event) => {
                    const nextScore = Number(event.target.value);
                    setMinimumScore(Math.min(100, Math.max(0, nextScore)));
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Scores range from 0 to 100. The default threshold is 60.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  id={`score-auto-reject-${run.id}`}
                  type="checkbox"
                  checked={autoRejectBelowMinimum}
                  disabled={pending}
                  onChange={(event) =>
                    setAutoRejectBelowMinimum(event.target.checked)
                  }
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <div className="space-y-1">
                  <Label htmlFor={`score-auto-reject-${run.id}`}>
                    Reject new candidates below minimum
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Off by default. Only still-new candidates in this exact
                    batch can be rejected.
                  </p>
                </div>
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed">
                {
                  AGENT_PROVIDER_LABELS[
                    providerKey ?? connectedProviders[0] ?? "dry_run"
                  ]
                }{" "}
                receives the displayed candidate scope and approved campaign
                product, audience, voice, tone, and saved keywords. Credentials
                stay in the native provider boundary.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm" role="status">
              No model call is needed. Continuing will{" "}
              {scope?.current === 0
                ? "block the score step because all attached candidates were removed"
                : "advance the workflow because no unscored new candidates remain"}
              .
            </p>
          )}

          {killSwitchEnabled ? (
            <div
              className="flex items-start gap-2 rounded-lg border p-3 text-sm"
              role="alert"
            >
              <ShieldAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              Global kill switch is enabled. Disable it in Safety before
              scoring.
            </div>
          ) : null}
          {submitError ? (
            <p className="text-destructive text-sm" role="alert">
              {submitError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {pending
                ? "Scoring batch…"
                : needsProvider
                  ? "Confirm and score"
                  : "Continue without model"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScopeFact({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
