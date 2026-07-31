# Planner-linked relevance scoring

## Purpose

Roadmap 5A connects a Roadmap 3D planner workflow to attended model scoring without turning the native planner into a model runner. The operator starts scoring from Workflows, reviews the exact durable candidate scope, chooses a connected provider/model, confirms the threshold policy, and sees the resulting state projected into Autopilot and Backlog.

Roadmap 5 remains partial. This slice completes attended planner-linked scoring; unattended/background scoring and a compliant production source connector remain future work.

## Durable scope

Migration 29 expands `workflow_artifacts.artifact_type` to `agent_run | candidate_post`. Planner materialization attaches one `candidate_post` artifact to the score step for every surviving accepted candidate in the source batch. Existing planned workflows are backfilled from their source batch.

Candidate artifacts preserve provenance rather than foreign-key ownership. Deleting a candidate leaves the artifact in place, and scope queries report it as removed. Cards aggregate candidate artifacts into current, unscored, already-scored, ineligible, and removed counts instead of rendering source content.

## Operator flow

1. The local planner creates a score-first workflow, exact candidate artifacts, and one Linkgo-owned scoring backlog item.
2. Workflows displays **Score batch** for the planner score step.
3. The dialog shows scope counts, excludes `dry_run`, defaults to the first connected provider and its project model, uses a minimum score of 60, and leaves low-score rejection unchecked.
4. The operator confirms the provider, model, threshold, and optional rejection policy.
5. The restricted native claim command acquires one SQLx connection, starts `BEGIN IMMEDIATE`, revalidates scope, and atomically creates the attempt, scorer run, agent artifact, workflow projection, and backlog projection.
6. The selected provider receives one labeled JSON context block containing only the approved campaign and attached candidate fields; the network call runs after the claim commits.
7. The restricted native score command validates exact ID coverage and writes all scores on one pinned connection.
8. Native no-work, failure, and scorer-result commands reconcile the execution, workflow, draft handoff, and linked backlog atomically.

All-scored scope advances without a provider call. All-removed scope blocks without a provider call. A non-planner score step without candidate artifacts cannot execute.

## Context contract

`relevanceScoringContextSchema` limits context to:

- campaign ID, name, product, audience, voice, tone, and at most 12 saved keywords;
- source batch, autopilot plan, workflow run, and workflow step IDs;
- minimum score and auto-reject policy;
- 1–50 candidates with ID, source keyword, author name/profile URL, posted time, source URL, and a bounded content excerpt.

Each excerpt is at most 1,200 characters and the serialized context is at most 48,000 characters. `agent_runs.input_context_json` stores valid JSON up to 50,000 characters so retries retain the exact input. Credentials, OAuth payloads, planner event metadata, unrelated candidates, and raw source-import audit JSON are excluded.

## Atomicity and concurrency

`score_relevance` requires 1–50 unique candidate IDs and exactly one score/rationale for each requested ID. Missing, duplicate, extra, or foreign score IDs fail validation.

Before writing, Linkgo rechecks campaign ownership, `new` status, and a null existing score for every requested candidate. Every update must affect exactly one row. Any missing ownership, stale state, cross-campaign artifact, policy mismatch, or write failure rolls back the full score set.

Renderer code never composes transactions from separate `@tauri-apps/plugin-sql` calls. `src-tauri/src/relevance_scoring.rs` exposes only capability-specific commands and pins each complete mutation to one managed `SqlitePool` connection; it does not expose arbitrary SQL.

A score claim rejects an existing `claimed`, `running`, or `waiting_approval` execution. Retries recalculate the current unscored scope and create the next attempt; they do not overwrite scores committed by another path.

## Backlog authority

The workflow score step owns the linked one-off scoring item:

- `pending` projects to `pending`;
- `running` or `waiting_approval` projects to `in_progress`;
- `blocked` or `failed` projects to `blocked`;
- `completed` projects to `completed`;
- `skipped` projects to `cancelled`.

Terminal legacy backlog rows are never reopened, and projection never creates a recurring successor. Live planner-linked backlog controls are read-only; recovery happens in Workflows.

## Safety boundaries

- The native Autopilot Planner never invokes a provider.
- Scoring is foreground, attended, and operator-confirmed.
- `dry_run` is unavailable for planner-linked scoring.
- The global kill switch is read again inside the pinned native score-write transaction. If it changes during provider latency, Linkgo commits a blocked scorer/execution/workflow/backlog projection plus safety audit evidence, returns a bounded explicit error, and leaves every candidate unchanged.
- Archived campaign state, missing provider, missing scope, and invalid context fail closed.
- Provider calls occur outside SQLite transactions.
- Credentials remain behind the native Tauri provider boundary.
- No scraping, remote source search, drafting, publishing, commenting, or after-quit execution is added.

## Verification

Focused Playwright coverage verifies renderer behavior: exact artifact display, bounded context transmission, provider success and errors, optional rejection, duplicate-submit guards, all-scored/all-removed messaging, provider/archive/kill-switch gates, a kill-switch flip after claim but before tool application, backlog read-only controls, keyboard focus return, 320-pixel reflow, 200% text, reduced motion, and forced colors. Its JavaScript SQL mock is not evidence of database atomicity.

Rust coverage runs the production commands through migrated SQLite pools with two connections. It proves duplicate-claim exclusion, exact score-set commits and rejection, complete rollback after late validation or injected SQLite write failure, stale/cross-campaign zero-write behavior, the final transactional kill-switch gate with durable blocked state and audit evidence, all-scored completion, all-removed blocking with durable artifacts, and atomic workflow/execution/backlog projection.
