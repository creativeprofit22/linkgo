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

AI draft generation is operator-triggered and save-gated: generated text stays in request history until the operator clicks `Save as draft`. A callable data/runtime API can audit one persisted variant revision, but this slice does not add a UI trigger, workflow automation, automatic retries or resume, AI rewrites, LinkedIn scraping, scheduling, publishing, or comment automation.

## Schema

Migrations: `src-tauri/src/migrations/drafts.rs`, `src-tauri/src/migrations/draft_generation.rs`, and Migration 31 in `draft_ai_audits.rs`.

Tables:

- `drafts`
- `draft_variants`
- `draft_audits`
- `draft_generation_requests`
- `draft_ai_audit_runs`
- `draft_ai_audit_findings`

Key constraints:

- `drafts.candidate_post_id` is unique so one candidate has one active local draft workspace.
- `draft_variants` allows variant numbers `1` through `5` and keeps them unique per draft.
- `draft_audits.severity` is limited to `pass`, `warning`, or `block`.
- All draft tables cascade when their campaign or candidate source is deleted.
- `draft_generation_requests.status` is limited to `pending`, `generated`, `saved`, `failed`, or `dismissed`.
- Generation requests keep agent-run provenance and generated variants as bounded JSON until the operator saves them.
- Variant text changes increment `content_revision`; each active AI audit is unique by variant and revision.
- Each AI audit has at most one linked agent run, and normalized findings are unique by audit run and category.

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

`generateDraftVariants` validates campaign/candidate eligibility, starts a drafter agent run with `draft_post`, stores generated variants as a local request, and records failures when the model does not return valid tool output.

`saveGeneratedDraft` requires a `generated` request, revalidates candidate eligibility, converts generated hashtags to the existing draft shape, and calls `createDraft` so deterministic audits and candidate status updates remain centralized.

`createDraft` validates the candidate, rejects archived campaigns, rejected candidates, and candidates that already have a draft, inserts the draft and variants in a transaction, writes audit rows, and updates `candidate_posts.status` to `drafted`.

`updateDraftVariant` updates only provided fields, deletes old audit rows, writes fresh deterministic audit rows, and updates the parent draft timestamp. SQLite increments `content_revision` only when stored hook, body, CTA, or hashtags change.

## AI auditor runtime ownership

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

`GenerateDraftDialog` captures candidate, provider, model, playbook, variant count, angle, and voice notes. It defaults to `dry_run`, the provider catalog's default model, and the LinkedIn Writer playbook.

`DraftGenerationRequestCard` shows generated, failed, dismissed, and saved request states. Generated requests expose `Save as draft` and `Dismiss`; failed requests show the error and can be dismissed.

`AddDraftDialog` captures candidate, angle, notes, and one to five manual variants. It excludes rejected and already-drafted candidates, and disables draft creation for archived campaigns so the UI matches the `createDraft` data guard.

`DraftVariantCard` supports:

- Reviewing hook, body, CTA, and hashtags.
- Seeing audit severity and finding messages.
- Editing a variant and re-running audit.
- Selecting one clean variant for review.
- Rejecting or resetting a variant.

Selecting a blocked variant is rejected by the data API with `Blocked variants cannot be selected`.

## Verification

The committed audit coverage includes:

- `tests/draft-ai-audits.spec.ts` for exact identity/text handoff, six-finding completion, provider/tool/identity/stale-revision failures, no-op versus real edits, atomic rollback, bounded startup reconciliation, crash boundaries, retries, and evidence preservation.
- `tests/agent-schema-contract.spec.ts`, `tests/agent-tool-contracts.spec.ts`, and `tests/agent-runtime.spec.ts` for the native/frontend `audit_post` contract, canonical-text bounds, auditor allowlisting, and dry-run persistence.
- Rust tests in `src-tauri/src/migrations/draft_ai_audits.rs` for migration ordering, revision triggers, run/finding constraints, retry release, and delete behavior.

Run:

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
