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

Native quality settlement replaces the rewritten variant's deterministic findings in the same transaction as its text and revision update. It records the four required rules (`required_text`, `total_length`, `external_link`, `hashtag_limit`) plus applicable `weak_hook` and `specificity` warnings, bound to the persisted revision. A passing AI audit or quality score cannot override a deterministic block. Audit insertion failure rolls back the whole settlement; other variants' findings remain untouched.

`tests/fixtures/draft-deterministic-audits.json` is exercised against the TypeScript checker, Rust settlement/checker, and browser mock. Its boundary cases cover ECMAScript trimming, UTF-16 character counts, Unicode hashtags, and warning semantics. No new schema is required for this regeneration fix.

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

The native draft-generation commands (`src-tauri/src/draft_generation.rs`) validate optional planner scope, resume the linked draft step, and keep the agent run detached from that step so generic reconciliation cannot advance it. Provider failure or operator dismissal blocks linked work and permits a terminal-history retry. Each linked draft step allows one active request (unique index); a concurrent second claim is rejected with a clear message and rolls back its step update.

The lifecycle is five native commands, each one pinned `BEGIN IMMEDIATE` transaction: `linkgo_draft_generation_claim` (request + linked step, returns bounded reference context), `_link_agent_run`, `_settle` (reads the drafter's own completed `draft_post` call, cross-checks it against the durable request and records the variants, or fails the request and blocks the step), `_save` and `_dismiss`. The renderer never supplies generated variants or audit findings. Real-SQLite tests: `src-tauri/src/draft_generation_tests.rs`.

`saveGeneratedDraft` requires a `generated` request and runs one immediate transaction. It revalidates candidate/workflow scope, creates the draft, variants, and audits, marks the request saved, adds one `draft` workflow artifact, completes `draft`, starts `audit`, and appends lifecycle events. Any failure rolls back every write.

For a planner-linked saved draft, **Audit all saved variants** starts attended serial execution. The workflow audits every variant's current `content_revision` in ascending `variant_number` order. Each audit inherits the saved generation request's provider and model; a blank saved model resolves through that provider's default model. A completed audit for the same current revision is skipped, while historical findings and audits for older revisions remain evidence.

Each variant claim transaction validates saved request, campaign, draft, artifact, and workflow provenance; creates and links the workflow execution, AI audit, and auditor agent; and reserves only the next unaudited current revision before provider work begins. Success transactionally settles that execution. For the final variant, its six findings, audit and execution completion, `audit` step completion, and transition of `approve` and the workflow to `waiting_approval` commit atomically.

Failure transactionally fails the audit, agent, execution, audit step, and workflow, clears any agent approval checkpoint, and records failure history. Execution stops at that variant. The operator must explicitly choose **Resume variant audits**; resume skips current revisions already completed and retries from the failed/next unaudited variant rather than automatically retrying.

Planner-linked claims with no lifecycle activity for 15 minutes are reconciled transactionally as failed and expose the same explicit Resume path. This linked recovery is separate from the general manual-audit reconciliation described below. Warning and `block` AI findings are retained for human review but do not automatically block the transition to `approve`; approval itself remains a human waiting checkpoint.

`createDraft` validates the candidate, rejects archived campaigns, rejected candidates, and candidates that already have a draft, inserts the draft and variants in a transaction, writes audit rows, and updates `candidate_posts.status` to `drafted`.

`updateDraftVariant` updates only provided fields, deletes old audit rows, writes fresh deterministic audit rows, and updates the parent draft timestamp. SQLite increments `content_revision` only when stored hook, body, CTA, or hashtags change.

These manual mutations are native commands in `src-tauri/src/drafts_core.rs`, each on one pinned `BEGIN IMMEDIATE` connection that returns `{ id }`: `linkgo_draft_create` (`createDraft`), `linkgo_draft_variant_update` (`updateDraftVariant`, which skips no-op edits) and `linkgo_draft_variant_set_status` (`setDraftVariantStatus`, which clears sibling selections and moves the draft to `ready_for_review` or `drafting`). Deterministic findings are computed natively by `deterministic_draft_findings`, the same port quality rewrites use, so the renderer cannot supply its own. Inputs reject unknown fields. Any failure, including an audit insert, rolls back the draft, variants, audits and candidate status together. Real-SQLite tests: `src-tauri/src/drafts_core_tests.rs`.

Reads and the plain draft-field update are native too (`src-tauri/src/drafts_reads.rs`); the renderer has no direct SQL access to draft tables.

- `linkgo_draft_list` returns up to 500 drafts with their variants and audits, plus current-revision AI audit runs and findings and current quality runs with attempts and category scores, and `totalCount` (drafts matching the filter before the cap). Everything is read in one transaction. `listDraftPage` returns `{ items, totalCount }`; `listDrafts` returns only the items. When truncated, the Drafts screen shows "Showing the first 500 of N", uses `totalCount` for Total drafts, and labels the other counts as covering the shown rows.
- `linkgo_draft_generation_request_list` returns up to 500 generation requests.
- `linkgo_draft_workflow_options` returns up to 200 blocked workflow draft steps.
- `linkgo_draft_update` (`updateDraft`) sets only the fields provided (angle ≤ 240 and notes ≤ 1000 characters, trimmed; status must be a known draft status). It rejects an explicit `null` and writes in one transaction; a missing id is a silent no-op, as before.

Response shapes are checked by strict schemas in `src/features/drafts/record-schemas.ts`. Tests: `src-tauri/src/drafts_reads_tests.rs`.

## Manual AI auditor runtime ownership

`runDraftAiAudit` snapshots the variant and campaign, builds the canonical text by preserving each non-empty `hook`, `body`, `cta`, and `hashtags` segment byte-for-byte and joining them with two newlines, then reserves the current revision before any provider call. It creates an `auditor` agent run with the `linkedin_humanizer` playbook and persists the campaign ID, variant ID, revision, audit-run ID, and exact text under `input_context_json.auditRequest`.

The audit and agent are linked before provider execution. Success requires a completed agent and exactly one completed `audit_post` call. Native completion reads the stored tool input and output itself, compares every trusted identity and the canonical text (rebuilt from the stored variant) exactly, requires the output to preserve the provider-authored findings verbatim, and accepts only exactly one valid finding per category. Callers never supply findings: `completeDraftAiAuditRun` and the planner completion take identity only. `audit_post` itself does not write draft audit tables.

The lifecycle is five native commands in `src-tauri/src/draft_ai_audits.rs`, each one pinned `BEGIN IMMEDIATE` transaction: `linkgo_draft_ai_audit_start` (revision check and reservation; returns the run, campaign and canonical text; an omitted revision means the current one), `_link_agent_run` (same-campaign auditor only), `_complete`, `_fail` (a linked nonterminal agent is failed with it) and `_reconcile`. The planner completion (`planner_draft_audits.rs`) reuses the same native output reader. Each active audit is unique per variant revision; a concurrent second start is rejected with a clear message. Real-SQLite tests: `src-tauri/src/draft_ai_audits_tests.rs`.

Completion rechecks the current variant revision, refreshes the variant's deterministic rule audit, and inserts all six normalized findings in the same transaction that marks the audit completed. The required categories are `hook`, `specificity`, `generic_language`, `authenticity`, `clarity`, and `safety`; partial finding sets never commit.

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
