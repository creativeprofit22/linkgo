import { Link2, Workflow } from "lucide-react";
import { AGENT_PROVIDER_LABELS } from "@/agent";

import { Card, CardContent } from "@/components/ui/card";
import type { AutopilotPlanDashboardItem } from "@/features/autopilot-planner/types";
import { getSourceConnector } from "@/features/source-imports/connectors";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatStatus(value: string): string {
  return value.replace(/_/gu, " ");
}

export function AutopilotPlanCard({
  plan,
}: {
  plan: AutopilotPlanDashboardItem;
}): React.ReactNode {
  const connector = getSourceConnector(plan.source_type);
  const backlogLink =
    plan.campaign_backlog_item_id === null
      ? plan.status === "skipped"
        ? "Not created"
        : "Linked item removed"
      : plan.backlog_status === null
        ? `Item #${plan.campaign_backlog_item_id} removed`
        : `Item #${plan.campaign_backlog_item_id} · ${formatStatus(plan.backlog_status)}`;
  const workflowLink =
    plan.workflow_run_id === null
      ? plan.status === "skipped"
        ? "Not created"
        : "Linked run removed"
      : plan.workflow_status === null
        ? `Run #${plan.workflow_run_id} removed`
        : `Run #${plan.workflow_run_id} · ${formatStatus(plan.workflow_status)}`;
  const scoringState =
    plan.score_step_status === null
      ? "Scoring state unavailable"
      : `Scoring is ${formatStatus(plan.score_step_status)} in Workflows`;
  const scorerState =
    plan.latest_scorer_provider_key === null
      ? "No scorer run has started"
      : `${AGENT_PROVIDER_LABELS[plan.latest_scorer_provider_key]} · ${formatStatus(plan.latest_scorer_run_status ?? "unknown")}`;

  return (
    <Card className="bg-card/70 forced-colors:border">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="font-semibold break-words">
              Plan #{plan.id} · {plan.campaign_name}
            </p>
            <p className="text-muted-foreground mt-1 text-sm break-words">
              {connector.label} · source batch #{plan.source_import_batch_id}
            </p>
          </div>
          <p className="shrink-0 text-sm font-medium">
            Outcome: {plan.status === "planned" ? "Planned" : "Skipped"}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-4">
          <PlanDetail
            label="Batch outcome"
            value={
              plan.source_batch_status === null
                ? "Batch removed"
                : formatStatus(plan.source_batch_status)
            }
          />
          <PlanDetail
            label="Imported accepted"
            value={String(plan.source_accepted_count ?? 0)}
          />
          <PlanDetail
            label="Current candidates"
            value={String(plan.current_candidate_count)}
          />
          <PlanDetail
            label="Planned candidates"
            value={String(plan.candidate_count)}
          />
        </dl>

        <p className="text-muted-foreground text-sm break-words">
          {plan.summary}
        </p>

        <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-2">
            <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Backlog</p>
              <p className="text-muted-foreground break-words">{backlogLink}</p>
              {plan.backlog_title ? (
                <p className="text-muted-foreground break-words">
                  {plan.backlog_title}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2">
            <Workflow aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Workflow</p>
              <p className="text-muted-foreground break-words">
                {workflowLink}
              </p>
              <p className="text-muted-foreground break-words">
                {scoringState}
              </p>
              <p className="text-muted-foreground break-words">{scorerState}</p>
              {plan.workflow_current_step_key ? (
                <p className="text-muted-foreground break-words">
                  Current step: {formatStatus(plan.workflow_current_step_key)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Created {formatDate(plan.created_at)} · Campaign status:{" "}
          {plan.campaign_status}
        </p>
      </CardContent>
    </Card>
  );
}

function PlanDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
