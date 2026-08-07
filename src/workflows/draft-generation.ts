import type { CandidateStatus } from "@/features/candidate-queue/types";
import type { DraftContentIntent } from "@/features/drafts/types";
import type { LinkgoDatabase } from "@/lib/db";
import type { WorkflowRunStatus, WorkflowStepStatus } from "@/workflows/types";

interface LinkedDraftScopeRow {
  workflow_run_id: number;
  campaign_id: number;
  run_status: WorkflowRunStatus;
  current_step_key: string;
  workflow_step_id: number;
  step_status: WorkflowStepStatus;
  step_title: string;
  candidate_status: CandidateStatus;
  relevance_score: number | null;
  candidate_campaign_id: number;
}

export interface LinkedDraftGenerationScope {
  workflowRunId: number;
  workflowStepId: number;
}

interface CandidateDeletionDraftRequestRow {
  request_id: number;
  request_status: "pending" | "generated";
  agent_run_id: number | null;
  campaign_id: number;
  workflow_run_id: number | null;
  workflow_step_id: number | null;
  run_status: WorkflowRunStatus | null;
  current_step_key: string | null;
  step_status: WorkflowStepStatus | null;
}

export interface LinkedDraftRequestScope {
  workflowRunId: number | null;
  workflowStepId: number | null;
  campaignId: number;
  candidateId: number;
}

const ELIGIBLE_CANDIDATE_STATUSES: CandidateStatus[] = ["new", "shortlisted"];
const RESUMABLE_RUN_STATUSES: WorkflowRunStatus[] = [
  "running",
  "blocked",
  "failed",
];
const CLAIMABLE_STEP_STATUSES: WorkflowStepStatus[] = [
  "pending",
  "running",
  "blocked",
  "failed",
];

function boundWorkflowSummary(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= 1000
    ? normalized
    : `${normalized.slice(0, 999).trimEnd()}…`;
}

async function loadLinkedDraftScope(
  db: LinkgoDatabase,
  input: { workflowRunId: number; campaignId: number; candidateId: number },
): Promise<LinkedDraftScopeRow> {
  const rows = await db.select<LinkedDraftScopeRow[]>(
    `SELECT
      wr.id AS workflow_run_id,
      wr.campaign_id,
      wr.status AS run_status,
      wr.current_step_key,
      ws.id AS workflow_step_id,
      ws.status AS step_status,
      ws.title AS step_title,
      cp.status AS candidate_status,
      cp.relevance_score,
      cp.campaign_id AS candidate_campaign_id
    FROM workflow_runs wr
    INNER JOIN workflow_steps ws
      ON ws.workflow_run_id = wr.id AND ws.step_key = 'draft'
    INNER JOIN workflow_artifacts wa
      ON wa.workflow_run_id = wr.id
      AND wa.artifact_type = 'candidate_post'
      AND wa.artifact_id = $1
    INNER JOIN candidate_posts cp ON cp.id = wa.artifact_id
    WHERE wr.id = $2
    LIMIT 1`,
    [input.candidateId, input.workflowRunId],
  );
  const scope = rows[0];
  if (scope === undefined) {
    throw new Error("Workflow has no surviving artifact for this candidate");
  }
  if (
    scope.campaign_id !== input.campaignId ||
    scope.candidate_campaign_id !== input.campaignId
  ) {
    throw new Error(
      "Workflow and candidate must belong to the selected campaign",
    );
  }
  if (scope.current_step_key !== "draft") {
    throw new Error("Workflow is not at its draft step");
  }
  if (!RESUMABLE_RUN_STATUSES.includes(scope.run_status)) {
    throw new Error("Workflow is not running or resumable");
  }
  if (!CLAIMABLE_STEP_STATUSES.includes(scope.step_status)) {
    throw new Error("Workflow draft step is not eligible for generation");
  }
  if (scope.relevance_score === null) {
    throw new Error("Workflow candidate must have a relevance score");
  }
  if (!ELIGIBLE_CANDIDATE_STATUSES.includes(scope.candidate_status)) {
    throw new Error("Workflow candidate is not eligible for drafting");
  }
  return scope;
}

export async function claimLinkedDraftGenerationInTransaction(
  db: LinkgoDatabase,
  input: {
    workflowRunId: number | null;
    campaignId: number;
    candidateId: number;
  },
): Promise<LinkedDraftGenerationScope | null> {
  if (input.workflowRunId === null) return null;
  const scope = await loadLinkedDraftScope(db, {
    workflowRunId: input.workflowRunId,
    campaignId: input.campaignId,
    candidateId: input.candidateId,
  });
  const eventType =
    scope.step_status === "pending" ? "step_started" : "step_resumed";
  const eventSummary =
    scope.step_status === "pending"
      ? "Draft variants started with a save-gated generation request"
      : "Draft variants resumed with a new save-gated generation request";

  await db.execute(
    `UPDATE workflow_steps
    SET status = 'running',
      output_summary = 'Waiting for operator to save generated variants',
      error_message = '',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
    [scope.workflow_step_id],
  );
  await db.execute(
    `UPDATE workflow_runs
    SET status = 'running',
      current_step_key = 'draft',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
    [scope.workflow_run_id],
  );
  await db.execute(
    `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, $3, $4)`,
    [scope.workflow_run_id, scope.workflow_step_id, eventType, eventSummary],
  );

  return {
    workflowRunId: scope.workflow_run_id,
    workflowStepId: scope.workflow_step_id,
  };
}

export async function blockLinkedDraftGenerationInTransaction(
  db: LinkgoDatabase,
  input: LinkedDraftRequestScope & { reason: string },
): Promise<void> {
  if (input.workflowRunId === null || input.workflowStepId === null) return;
  const summary = boundWorkflowSummary(
    input.reason || "Draft generation stopped",
  );
  const rows = await db.select<
    Array<{
      step_status: WorkflowStepStatus;
      run_status: WorkflowRunStatus;
      current_step_key: string;
    }>
  >(
    `SELECT
      ws.status AS step_status,
      wr.status AS run_status,
      wr.current_step_key
    FROM workflow_steps ws
    INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
    WHERE ws.id = $1
      AND ws.workflow_run_id = $2
      AND ws.step_key = 'draft'
      AND wr.campaign_id = $3
    LIMIT 1`,
    [input.workflowStepId, input.workflowRunId, input.campaignId],
  );
  const scope = rows[0];
  if (
    scope === undefined ||
    scope.current_step_key !== "draft" ||
    ["completed", "cancelled"].includes(scope.run_status) ||
    ["completed", "skipped"].includes(scope.step_status)
  ) {
    return;
  }

  await db.execute(
    `UPDATE workflow_steps
    SET status = 'blocked',
      output_summary = '',
      error_message = $1,
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $2`,
    [summary, input.workflowStepId],
  );
  await db.execute(
    `UPDATE workflow_runs
    SET status = 'blocked',
      current_step_key = 'draft',
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
    [input.workflowRunId],
  );
  await db.execute(
    `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, 'step_blocked', $3)`,
    [input.workflowRunId, input.workflowStepId, summary],
  );
}

export async function settleLinkedDraftRequestsForCandidateDeletionInTransaction(
  db: LinkgoDatabase,
  candidateId: number,
): Promise<void> {
  const requests = await db.select<CandidateDeletionDraftRequestRow[]>(
    `SELECT
      dgr.id AS request_id,
      dgr.status AS request_status,
      dgr.agent_run_id,
      dgr.campaign_id,
      dgr.workflow_run_id,
      dgr.workflow_step_id,
      wr.status AS run_status,
      wr.current_step_key,
      ws.status AS step_status
    FROM draft_generation_requests dgr
    LEFT JOIN workflow_runs wr ON wr.id = dgr.workflow_run_id
    LEFT JOIN workflow_steps ws
      ON ws.id = dgr.workflow_step_id
      AND ws.workflow_run_id = dgr.workflow_run_id
      AND ws.step_key = 'draft'
    WHERE dgr.candidate_post_id = $1
      AND dgr.status IN ('pending', 'generated')
      AND (
        dgr.workflow_run_id IS NOT NULL
        OR dgr.workflow_step_id IS NOT NULL
      )
    ORDER BY dgr.id ASC`,
    [candidateId],
  );

  for (const request of requests) {
    const hasActiveDraftScope =
      request.workflow_run_id !== null &&
      request.workflow_step_id !== null &&
      request.run_status !== null &&
      request.step_status !== null &&
      request.current_step_key === "draft" &&
      RESUMABLE_RUN_STATUSES.includes(request.run_status) &&
      CLAIMABLE_STEP_STATUSES.includes(request.step_status);
    if (!hasActiveDraftScope) {
      throw new Error(
        `Candidate cannot be deleted because linked draft request #${request.request_id} is not attached to an active draft workflow step. Resolve the request from Drafts first.`,
      );
    }

    const reason = boundWorkflowSummary(
      `Candidate #${candidateId} was deleted. Linked draft request #${request.request_id} was removed, and the candidate remains recorded as a removed workflow artifact.`,
    );
    if (request.request_status === "pending" && request.agent_run_id !== null) {
      const cancelledRun = await db.execute(
        `UPDATE agent_runs
        SET status = 'cancelled',
          error_message = $1,
          completed_at = COALESCE(completed_at, datetime('now')),
          updated_at = datetime('now')
        WHERE id = $2 AND status IN ('queued', 'running')`,
        [reason, request.agent_run_id],
      );
      if (cancelledRun.rowsAffected === 1) {
        await db.execute(
          `DELETE FROM agent_run_approval_checkpoints
          WHERE agent_run_id = $1`,
          [request.agent_run_id],
        );
        await db.execute(
          `INSERT INTO agent_run_events (agent_run_id, event_type, summary)
          VALUES ($1, 'run_cancelled', $2)`,
          [request.agent_run_id, reason],
        );
      }
    }

    const dismissed = await db.execute(
      `UPDATE draft_generation_requests
      SET status = 'dismissed',
        error_message = $1,
        updated_at = datetime('now')
      WHERE id = $2 AND status IN ('pending', 'generated')`,
      [reason, request.request_id],
    );
    if (dismissed.rowsAffected !== 1) {
      throw new Error(
        `Linked draft request #${request.request_id} changed before candidate deletion`,
      );
    }

    await blockLinkedDraftGenerationInTransaction(db, {
      workflowRunId: request.workflow_run_id,
      workflowStepId: request.workflow_step_id,
      campaignId: request.campaign_id,
      candidateId,
      reason,
    });
  }
}

export async function validateLinkedDraftSaveInTransaction(
  db: LinkgoDatabase,
  input: LinkedDraftRequestScope,
): Promise<LinkedDraftGenerationScope | null> {
  if (input.workflowRunId === null && input.workflowStepId === null)
    return null;
  if (input.workflowRunId === null || input.workflowStepId === null) {
    throw new Error(
      "Draft generation request has incomplete workflow provenance",
    );
  }
  const scope = await loadLinkedDraftScope(db, {
    workflowRunId: input.workflowRunId,
    campaignId: input.campaignId,
    candidateId: input.candidateId,
  });
  if (scope.workflow_step_id !== input.workflowStepId) {
    throw new Error("Draft generation request points to a stale workflow step");
  }
  if (scope.step_status !== "running" || scope.run_status !== "running") {
    throw new Error("Linked workflow draft step must still be running");
  }
  return {
    workflowRunId: scope.workflow_run_id,
    workflowStepId: scope.workflow_step_id,
  };
}

export async function completeLinkedDraftSaveInTransaction(
  db: LinkgoDatabase,
  input: LinkedDraftGenerationScope & {
    draftId: number;
    contentIntent: DraftContentIntent;
  },
): Promise<void> {
  const auditRows = await db.select<
    Array<{ id: number; status: WorkflowStepStatus; title: string }>
  >(
    `SELECT id, status, title
    FROM workflow_steps
    WHERE workflow_run_id = $1 AND step_key = 'audit'
    LIMIT 1`,
    [input.workflowRunId],
  );
  const auditStep = auditRows[0];
  if (auditStep === undefined || auditStep.status !== "pending") {
    throw new Error("Linked workflow audit step is not ready to advance");
  }

  await db.execute(
    `INSERT INTO workflow_artifacts (
      workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary,
      updated_at
    ) VALUES ($1, $2, 'draft', $3, $4, datetime('now'))`,
    [
      input.workflowRunId,
      input.workflowStepId,
      input.draftId,
      `${input.contentIntent} intent · saved draft`,
    ],
  );
  const completedDraftStep = await db.execute(
    `UPDATE workflow_steps
    SET status = 'completed',
      output_summary = $1,
      error_message = '',
      completed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = $2 AND status = 'running'`,
    ["Generated variants saved by operator", input.workflowStepId],
  );
  if (completedDraftStep.rowsAffected !== 1) {
    throw new Error("Linked workflow draft step changed before save completed");
  }
  const startedAuditStep = await db.execute(
    `UPDATE workflow_steps
    SET status = 'running',
      output_summary = '',
      error_message = '',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1 AND status = 'pending'`,
    [auditStep.id],
  );
  if (startedAuditStep.rowsAffected !== 1) {
    throw new Error("Linked workflow audit step changed before save completed");
  }
  await db.execute(
    `UPDATE workflow_runs
    SET status = 'running',
      current_step_key = 'audit',
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
    [input.workflowRunId],
  );
  await db.execute(
    `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, 'step_completed', 'Draft variants saved by operator')`,
    [input.workflowRunId, input.workflowStepId],
  );
  await db.execute(
    `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, 'step_started', 'Audit drafts started')`,
    [input.workflowRunId, auditStep.id],
  );
}
