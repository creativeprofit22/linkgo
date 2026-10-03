import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleHelp,
  Lightbulb,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OTHER_AI_SERVICES,
  findFirstIdeaHref,
  setupStepHref,
} from "@/features/setup/data";
import type {
  SetupChecklist as SetupChecklistData,
  SetupStepKey,
  SetupStepNote,
  SetupStepState,
  SetupStepView,
} from "@/features/setup/types";
import { cn } from "@/lib/utils";

interface StepCopy {
  title: string;
  description: string;
  action: string;
}

const STEP_COPY: Record<SetupStepKey, StepCopy> = {
  linkedin: {
    title: "Connect LinkedIn",
    description:
      "So Linkgo can share posts for you. Nothing goes live without your OK.",
    action: "Connect LinkedIn",
  },
  ai: {
    title: "Connect an AI service",
    description:
      "The AI finds ideas and writes drafts for you. We recommend Claude.",
    action: "Connect Claude",
  },
  voice: {
    title: "Describe how you write",
    description: "Add a few lines about your style so drafts sound like you.",
    action: "Describe your style",
  },
  campaign: {
    title: "Create your first campaign",
    description:
      "A campaign groups posts by goal. We fill in the name “My posts” and you click Create.",
    action: "Create campaign",
  },
};

/** Copy that replaces a step's own when the step carries a note. */
const NOTE_COPY: Record<SetupStepNote, Omit<StepCopy, "title">> = {
  "writer-guide-off": {
    description:
      "Your style is saved, but the LinkedIn Writer guide is off. Turn it on so drafts use your style.",
    action: "Turn on the guide",
  },
};

/** Buttons wrap instead of overflowing on narrow windows with large text. */
const WRAPPING_BUTTON =
  "h-auto min-h-8 max-w-full text-center whitespace-normal";

const STATE_LABEL: Record<SetupStepState, string> = {
  done: "Done",
  todo: "To do",
  unknown: "Not checked yet",
};

interface SetupChecklistProps {
  /** `null` while the first check runs. */
  checklist: SetupChecklistData | null;
  onDismiss: () => void;
}

/** The first-run checklist card: progress, four steps, and one action each. */
export function SetupChecklist({
  checklist,
  onDismiss,
}: SetupChecklistProps): React.ReactNode {
  const doneCount = checklist?.doneCount ?? 0;
  const total = checklist?.total ?? 4;
  const complete = checklist?.complete ?? false;
  // The first step not done yet gets the filled (primary) button.
  const nextKey =
    checklist?.steps.find((step) => step.state !== "done")?.key ?? null;

  return (
    <Card
      className="bg-card/70"
      aria-labelledby="setup-checklist-title"
      role="region"
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="space-y-1">
            <h3
              id="setup-checklist-title"
              className="flex items-center gap-2 text-lg leading-none font-semibold"
            >
              <Rocket aria-hidden="true" className="text-linkgo-blue size-5" />
              {complete ? "You're all set" : "Get started with Linkgo"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {complete
                ? "Everything is ready. Find an idea and Linkgo will help you write about it."
                : "Four short steps. You can do them in any order and come back any time."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground shrink-0 self-start"
            onClick={onDismiss}
          >
            Hide setup
          </Button>
        </div>
        <SetupProgress
          doneCount={doneCount}
          total={total}
          loading={checklist === null}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {checklist === null ? (
          <p role="status" className="text-muted-foreground text-sm">
            Checking your setup…
          </p>
        ) : (
          <ol className="space-y-2" aria-label="Setup steps">
            {checklist.steps.map((step, index) => (
              <SetupStepRow
                key={step.key}
                step={step}
                number={index + 1}
                primary={step.key === nextKey}
              />
            ))}
          </ol>
        )}
        {complete ? (
          <div className="flex justify-end pt-1">
            <Button asChild className={WRAPPING_BUTTON}>
              <a href={findFirstIdeaHref()}>
                <Lightbulb aria-hidden="true" className="size-4" />
                Find your first idea
              </a>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SetupProgress({
  doneCount,
  total,
  loading,
}: {
  doneCount: number;
  total: number;
  loading: boolean;
}): React.ReactNode {
  const label = `${doneCount} of ${total} done`;
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        aria-valuetext={loading ? "Checking" : label}
        className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
      >
        <div
          className="bg-linkgo-blue h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(doneCount / total) * 100}%` }}
        />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
        {loading ? "Checking…" : label}
      </span>
    </div>
  );
}

function StepStatusIcon({ state }: { state: SetupStepState }): React.ReactNode {
  const className = "mt-0.5 size-5 shrink-0";
  if (state === "done") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className={cn(className, "text-linkgo-green")}
      />
    );
  }
  if (state === "unknown") {
    return (
      <CircleHelp
        aria-hidden="true"
        className={cn(className, "text-muted-foreground")}
      />
    );
  }
  return (
    <Circle
      aria-hidden="true"
      className={cn(className, "text-muted-foreground")}
    />
  );
}

function SetupStepRow({
  step,
  number,
  primary,
}: {
  step: SetupStepView;
  number: number;
  primary: boolean;
}): React.ReactNode {
  const copy: StepCopy =
    step.note === null
      ? STEP_COPY[step.key]
      : { ...STEP_COPY[step.key], ...NOTE_COPY[step.note] };
  const done = step.state === "done";
  const titleId = `setup-step-${step.key}-title`;
  return (
    <li
      aria-labelledby={titleId}
      data-testid={`setup-step-${step.key}`}
      data-state={step.state}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
        done ? "bg-muted/30" : "bg-background/50",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StepStatusIcon state={step.state} />
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-medium">
            <span className="sr-only">Step {number}: </span>
            {copy.title}
            <span className="sr-only"> ({STATE_LABEL[step.state]})</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {step.state === "unknown"
              ? `${copy.description} We couldn't check this step yet.`
              : copy.description}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {done ? (
          <span
            className="text-linkgo-green text-xs font-medium"
            aria-hidden="true"
          >
            Done
          </span>
        ) : (
          <>
            <Button
              asChild
              size="sm"
              variant={primary ? "default" : "outline"}
              className={WRAPPING_BUTTON}
            >
              <a href={setupStepHref(step.key)}>{copy.action}</a>
            </Button>
            {step.key === "ai" ? <MoreAiServicesMenu /> : null}
          </>
        )}
      </div>
    </li>
  );
}

function MoreAiServicesMenu(): React.ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={WRAPPING_BUTTON}
        >
          More AI services
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {OTHER_AI_SERVICES.map((service) => (
          <DropdownMenuItem key={service.key} asChild>
            <a href={setupStepHref("ai", service.key)}>
              Connect {service.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
