# Drafting + Audit Feature

Drafting + Audit turns the Drafts tab into a local-first workspace for manual or operator-triggered AI-assisted LinkedIn post variants and deterministic review checks.

## Purpose

The feature stores:

- One draft workspace per candidate post.
- One to five operator-written or explicitly saved generated draft variants.
- Local generation request history for approval-gated AI draft assistance.
- Deterministic audit findings for each saved variant.
- Variant status: `draft`, `selected`, or `rejected`.
- Draft status: `drafting`, `needs_revision`, `ready_for_review`, or `archived`.

Creating a draft marks the source candidate as `drafted` in the Candidate Queue.

AI draft generation is operator-triggered and save-gated: generated text stays in request history until the operator clicks `Save as draft`. AI audit remains explicit. After a canonical non-blocking current-revision audit, the operator may confirm **Run quality loop**: five categories are scored against 70, with at most two automatic evidence-grounded rewrites. Every rewrite increments `content_revision`, regenerates deterministic findings, and is AI-audited before automatic re-scoring. Interrupted/failed work is durable and only continues through **Resume quality loop**. The loop never approves, schedules, publishes, scrapes, or comments.

## Schema

Migrations: `src-tauri/src/migrations/drafts.rs`, `src-tauri/src/migrations/draft_generation.rs`, Migration 30 in `planner_draft_generation.rs`, Migration 31 in `draft_ai_audits.rs`, Migration 32 in `planner_draft_audits.rs`, and Migration 33 in `draft_quality.rs`.

Tables:

- `drafts`
- `draft_variants`
- `draft_audits`
- `draft_generation_requests`
- `draft_ai_audit_runs`
- `draft_ai_audit_findings`
- `draft_quality_runs`
- `draft_quality_attempts`
- `draft_quality_category_scores`

Key constraints:

- `drafts.candidate_post_id` is unique so one candidate has one active local draft workspace.
- `draft_variants` allows variant numbers `1` through `5` and keeps them unique per draft.
- `draft_audits.severity` is limited to `pass`, `warning`, or `block`.
- All draft tables cascade when their campaign or candidate source is deleted.
- `draft_generation_requests.status` is limited to `pending`, `generated`, `saved`, `failed`, or `dismissed`.
- New provider requests require exactly 3, 4, or 5 variants; historical 1–2 variant requests remain readable.
- Drafts and requests persist one fixed content intent: `event`, `launch`, `idea`, or `community`.
- Linked requests persist workflow run/step provenance, with one active request per draft step.
- Generation requests keep agent-run provenance and generated variants as bounded JSON until the operator saves them.
- Variant text changes increment `content_revision`; each active AI audit is unique by variant and revision.
- Each AI audit has at most one linked agent run, and normalized findings are unique by audit run and category.
- Migration 32 gives a planner-owned AI audit at most one `workflow_step_execution` link; existing and manual audit rows remain valid with no execution link.

See `docs/DATA_MODEL.md` for column-level details.

## Frontend contract

Types live in `src/features/drafts/types/index.ts`.

Schemas live in `src/features/drafts/schemas.ts` and use Zod 4.

Data functions live in `src/features/drafts/data.ts`:

- `auditDraftVariant(input)`
- `createDraft(input)`
- `listDrafts(campaignId)`
- `listDraftGenerationRequests(campaignId)`
- `generateDraftVariants(input)`
- `runDraftAiAudit(input)`
- `reconcileDraftAiAuditLifecycle(input?)`
- `startDraftAiAuditRun(input)`
- `completeDraftAiAuditRun(input)`
- `failDraftAiAuditRun(input)`
- `saveGeneratedDraft(input)`
- `dismissDraftGenerationRequest(id)`
- `updateDraft(input)`
- `updateDraftVariant(input)`
- `setDraftVariantStatus(input)`
- `archiveDraft(id)`

`generateDraftVariants` persists the durable request before provider execution. It uses one code-owned intent route, puts candidate/campaign text only in bounded untrusted reference data, and requires `draft_post` arguments to carry exactly 3–5 provider-authored `hook`/`body`/`cta`/`hashtags` variants. The completed tool call must preserve those normalized variants and match the durable request ID, campaign, candidate, intent, and exact count before JSON persistence.

`src/workflows/draft-generation.ts` validates optional planner scope, resumes the linked draft step, and keeps the agent run detached from that step so generic reconciliation cannot advance it. Provider failure or operator dismissal blocks linked work and permits a terminal-history retry.

`saveGeneratedDraft` requires a `generated` request and runs one immediate transaction. It revalidates candidate/workflow scope, creates the draft, variants, and audits, marks the request saved, adds one `draft` workflow artifact, completes `draft`, starts `audit`, and appends lifecycle events. Any failure rolls back every write.

For a planner-linked saved draft, **Audit all saved variants** starts attended serial execution. The workflow audits every variant's current `content_revision` in ascending `variant_number` order. Each audit inherits the saved generation request's provider and model; a blank saved model resolves through that provider's default model. A completed audit for the same current revision is skipped, while historical findings and audits for older revisions remain evidence.

Each variant claim transaction validates saved request, campaign, draft, artifact, and workflow provenance; creates and links the workflow execution, AI audit, and auditor agent; and reserves only the next unaudited current revision before provider work begins. Success transactionally settles that execution. For the final variant, its six findings, audit and execution completion, `audit` step completion, and transition of `approve` and the workflow to `waiting_approval` commit atomically.

Failure transactionally fails the audit, agent, execution, audit step, and workflow, clears any agent approval checkpoint, and records failure history. Execution stops at that variant. The operator must explicitly choose **Resume variant audits**; resume skips current revisions already completed and retries from the failed/next unaudited variant rather than automatically retrying.

Planner-linked claims with no lifecycle activity for 15 minutes are reconciled transactionally as failed and expose the same explicit Resume path. This linked recovery is separate from the general manual-audit reconciliation described below. Warning and `block` AI findings are retained for human review but do not automatically block the transition to `approve`; approval itself remains a human waiting checkpoint.

`createDraft` validates the candidate, rejects archived campaigns, rejected candidates, and candidates that already have a draft, inserts the draft and variants in a transaction, writes audit rows, and updates `candidate_posts.status` to `drafted`.

`updateDraftVariant` updates only provided fields, deletes old audit rows, writes fresh deterministic audit rows, and updates the parent draft timestamp. SQLite increments `content_revision` only when stored hook, body, CTA, or hashtags change.

## Manual AI auditor runtime ownership

`runDraftAiAudit` snapshots the variant and campaign, builds the canonical text by preserving each non-empty `hook`, `body`, `cta`, and `hashtags` segment byte-for-byte and joining them with two newlines, then reserves the current revision before any provider call. It creates an `auditor` agent run with the `linkedin_humanizer` playbook and persists the campaign ID, variant ID, revision, audit-run ID, and exact text under `input_context_json.auditRequest`.

The audit and agent are linked before provider execution. Success requires a completed agent and exactly one completed `audit_post` call. The drafts feature parses the stored tool input and output, compares every trusted identity and the canonical text exactly, and accepts only the validated provider-authored findings. `audit_post` itself does not write draft audit tables.

Completion rechecks the current variant revision and inserts all six normalized findings in the same transaction that marks the audit completed. The required categories are `hook`, `specificity`, `generic_language`, `authenticity`, `clarity`, and `safety`; partial finding sets never commit.

Provider, tool, identity, and stale-revision failures durably mark the audit failed with a bounded error and no accepted findings. Provider/tool evidence remains on the linked agent run. If orchestration fails while that agent is nonterminal, failure settlement marks it failed and clears its approval checkpoint in the same transaction; completed or already failed agents are not rewritten.

Startup calls the bounded `reconcileDraftAiAuditLifecycle` API. Each immediate transaction claims at most 25 stale active audits and 25 stale orphaned auditor agents. Reserved audits and unlinked auditor agents are stale after 5 minutes; linked audit execution is stale after 30 minutes since the newest audit/agent lifecycle activity. Reconciliation atomically fails stale audits plus linked nonterminal agents, clears their approval checkpoints, and records `run_failed` events. It also closes reserved-but-unlinked audits and auditor agents whose durable `auditRequest.auditRunId` never became linked. Terminal agent status, output, events, tool calls, audit summary, and normalized findings are preserved as evidence. Callers may reduce or raise each batch bound from 1 to 100.

## Deterministic audit rules

The local audit records blockers and warnings without calling a model:

- `required_text`: blocks variants with no hook and no body.
- `total_length`: blocks variants over 3,000 combined characters.
- `external_link`: blocks links in hook, body, or CTA.
- `hashtag_limit`: blocks more than five parsed hashtags.
- `weak_hook`: warns for short or generic hooks.
- `specificity`: warns when the text lacks a number and first-person signal.

The UI shows passing findings for hard blockers so operators can see why a variant is safe enough to review.

## UI

`DraftsView` renders:

- Header explaining generation is operator-triggered and save-gated.
- Campaign selector.
- `Generate variants` action.
- `Create draft` action.
- Loading, retry, no-campaign, and empty-draft states.
- Summary cards for total drafts, ready-for-review drafts, blocked variants, selected variants, and generated drafts pending.
- Draft cards with candidate source context and variant cards.

`GenerateDraftDialog` captures candidate, provider, model, playbook, a 3/4/5 count, one of four fixed content intents, optional eligible workflow scope, angle, and voice notes. A single eligible workflow defaults selected; multiple matches require an explicit workflow or ad-hoc choice. Linked scope explains that advancement happens only on save.

`DraftGenerationRequestCard` shows generated, failed, dismissed, and saved request states. Generated requests expose `Save as draft` and `Dismiss`; failed requests show the error and can be dismissed.

`AddDraftDialog` captures candidate, content intent, angle, notes, and one to five manual variants. It excludes rejected and already-drafted candidates, and disables draft creation for archived campaigns so the UI matches the `createDraft` data guard.

`DraftVariantCard` supports:

- Reviewing hook, body, CTA, and hashtags.
- Seeing audit severity and finding messages.
- Editing a variant and re-running audit.
- Selecting one clean variant for review.
- Rejecting or resetting a variant.

Selecting a blocked variant is rejected by the data API with `Blocked variants cannot be selected`.

## Verification

The committed audit coverage includes:

- `tests/draft-ai-audits.spec.ts` for the unchanged manual audit path: exact identity/text handoff, six-finding completion, provider/tool/identity/stale-revision failures, no-op versus real edits, atomic rollback, bounded startup reconciliation, crash boundaries, retries, and evidence preservation.
- `tests/workflows.spec.ts` for attended planner-linked serial audit order, inherited provider/default model, completed-current skipping, explicit failure Resume, revision changes, 15-minute stale recovery, provenance and duplicate-claim rejection, findings that do not auto-block approval, and atomic claim/fail/final settlement boundaries.
- `tests/agent-schema-contract.spec.ts`, `tests/agent-tool-contracts.spec.ts`, and `tests/agent-runtime.spec.ts` for the native/frontend `audit_post` contract, canonical-text bounds, auditor allowlisting, and dry-run persistence.
- Rust tests in `src-tauri/src/migrations/draft_ai_audits.rs`, `src-tauri/src/migrations/planner_draft_audits.rs`, and `src-tauri/src/planner_draft_audits.rs` for migration ordering and constraints plus transactional planner claim, failure, completion, and stale recovery.

Run:

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
