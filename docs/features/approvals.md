# Approvals + Scheduler

## Purpose

The Approvals tab turns selected clean draft variants into local human review records, local schedule records, manual publish-attempt history, and explicit OAuth-backed LinkedIn post publishing.

This feature is approval-gated and local-first for review state. It calls LinkedIn when an operator confirms `Publish via LinkedIn` on an approved or scheduled post. Background due-job execution is documented separately in `docs/features/scheduler.md` and uses the same approved scheduled records.

## Schema

Migration version `4` creates:

- `approvals`: one review record per draft and selected draft variant.
- `schedule_jobs`: one local LinkedIn schedule record per approval.
- `publish_attempts`: manual or OAuth-backed success/failure history for approved or scheduled posts, plus failed follow-up attempts after publication.

Migration `35` adds nullable `approvals.reviewed_content_revision` and `draft_audits.content_revision`, the shared `approval_ready_variants` view, and SQLite enforcement triggers. The trigger checks run for renderer SQL and native connections, not only UI actions.

Historical revisions are not inferred. Existing pending, approved, and scheduled reviews move to `changes_requested`; their queued schedule jobs are cancelled. Notes, content, audit evidence, approval timestamps, publish history, and linked records remain. Published records remain historical; when their reviewed revision is unknown or different, the card does not show current draft text as the published snapshot. Run a new AI audit from Drafts (which also refreshes deterministic findings), obtain a current quality pass, and explicitly review/approve again. No migration is applied to live data by the fixture tests.

Approval statuses:

- `needs_review`
- `changes_requested`
- `approved`
- `rejected`
- `scheduled`
- `published`
- `cancelled`

Schedule statuses:

- `scheduled`
- `cancelled`
- `completed`
- `failed`

Publish attempt statuses:

- `succeeded`
- `failed`

## Frontend contract

Feature folder: `src/features/approvals`.

Public exports:

- `ApprovalsView`
- Approval, schedule, publish attempt, detail, eligible draft, and action input types

Data API:

- `listApprovals(campaignId?)`
- `listApprovalEligibleDrafts(campaignId?)`
- `createApproval(input)`
- `setApprovalStatus(input)`
- `scheduleApproval(input)`
- `cancelSchedule(input)`
- `recordPublishAttempt(input)`

Reads are native too (`src-tauri/src/approval_reads.rs`); the renderer has no direct SQL access to approval tables.

- `linkgo_approval_list` returns up to 500 approvals with their schedule jobs, publish attempts, linked agent-run counts and draft audits.
- `linkgo_approval_eligible_drafts` returns up to 200 drafts ready for review that have no approval yet.
- `linkgo_approval_publish_preflight` is a read-only check the renderer runs before any LinkedIn call. It runs the same checks, with the same messages, as the renderer did before. It is advisory: the posting command `linkgo_linkedin_publish_post` re-checks everything natively in `load_publish_preflight_from_pool` (`src-tauri/src/auth/publish.rs`) before any LinkedIn call, so skipping or racing the preflight cannot post.

Each read happens in one transaction, and response shapes are checked by strict schemas in `src/features/approvals/record-schemas.ts`. Tests: `src-tauri/src/approval_reads_tests.rs`.

Validation uses Zod schemas in `src/features/approvals/schemas.ts`.

`createApproval` and `setApprovalStatus` are thin adapters: they parse input with the Zod schema, then invoke the native commands `linkgo_approval_create` (returns the new positive approval id, validated in the renderer) and `linkgo_approval_set_status` (returns nothing). Both commands revalidate input natively (`deny_unknown_fields`, positive ids, notes trimmed to at most 1000 characters, `contentRevision` required to approve) and settle every read and write on one pinned connection inside `BEGIN IMMEDIATE` (`src-tauri/src/approval_review.rs`). No raw SQL crosses IPC, and the renderer holds no approval transaction.

`setApprovalStatus` accepts only the review statuses `needs_review`, `changes_requested`, `approved`, `rejected`, and `cancelled` (`reviewApprovalStatusSchema` / `ReviewApprovalStatus`). `scheduled` is set only by `scheduleApproval` and `published` only by `recordPublishAttempt`; the native transition guard rejects both. `contentRevision` is read only when approving and ignored for other statuses.

## Lifecycle transitions

A draft can become eligible only when:

- The draft status is `ready_for_review`.
- Exactly one variant is selected.
- The selected variant has all four canonical deterministic checks bound to its current revision, with no current blocking finding.
- Its latest current-revision AI audit is completed with exactly the six canonical findings and no block.
- A quality run passed at 70 or higher for that same content revision.
- The campaign is not archived.
- No approval already exists for that draft.

Approving requires `contentRevision`: the revision displayed to the reviewer. The native command checks readiness again inside the transaction and SQLite refuses a mismatched revision or missing prerequisite even if the UI is bypassed.

Native eligibility:

- Create always inserts `needs_review`; only `linkgo_approval_set_status` can set `approved`.
- Scheduling (`linkgo_approval_schedule`) requires `approved` plus an `approval_ready_variants` row where the approval's reviewed revision equals the variant's current revision. Stale edits, current-revision block findings, and missing/failed/sub-70 quality or AI audit evidence all reject with "Approval is stale or not ready. Reload and run current AI audit and quality checks." before any schedule, rate-limit, or audit write. Approval scope cannot be reassigned to another draft or variant.
- `linkgo_approval_schedule` and `linkgo_approval_cancel_schedule` validate input natively before opening the transaction (`validate_schedule`, mirroring `scheduleApprovalSchema`): unknown fields are rejected, ids must be positive, `scheduledFor` is trimmed, at most 80 characters and must be `YYYY-MM-DD[T ]HH:MM[:SS[.fff]]` with an optional `Z` or `±HH:MM` that SQLite `date()` parses (otherwise "Scheduled time must be a valid date"), and `timezone` is trimmed, at most 80 characters and defaults to `local`. This keeps the per-campaign daily post limit from being bypassed by a date SQLite cannot count; the limit window is SQLite's `date(scheduledFor)`.
- Publishing re-checks the same readiness. `assert_publish_ready` (`src-tauri/src/approval_review.rs`) loads `reviewed_content_revision` and requires the `approval_ready_variants` row at that revision, which must also be the variant's current revision. Both `linkgo_approval_publish_preflight` and the posting command `linkgo_linkedin_publish_post` (`load_publish_preflight_from_pool` in `src-tauri/src/auth/publish.rs`) call it after the kill-switch, archive, status and duplicate-success checks. The posting command runs it in the same read transaction that loads the commentary it sends, then requires any `scheduleJobId` to be the approval's latest job with status `scheduled` ("Schedule job is not the current scheduled job"), all before any LinkedIn call. Editing an approved variant bumps its revision and the revision trigger moves the approval to `changes_requested`, so the status check refuses it. Readiness can be lost without a status change: a newer pending, running, failed or blocking AI audit run on the same revision keeps the approval `approved` but not ready. Such approvals reject with the same stale-approval error.
- `linkgo_approval_record_publish_attempt` validates its input natively before opening the transaction (`validate_record_publish_attempt`, mirroring `recordPublishAttemptSchema`, which the data API also parses): unknown fields are rejected, `approvalId`/`scheduleJobId` must be positive, every string is trimmed, and limits are URL 1000, platform post ID 200 and failure reason 1000 characters. The URL must be empty or start with `https://www.linkedin.com/` or `https://linkedin.com/`, a `failed` attempt needs a non-empty reason, and a `succeeded` attempt needs a URL or platform post ID. Invalid input writes nothing. Publish via LinkedIn truncates long provider errors to 1000 characters so the failure is still recorded.
- `linkgo_approval_record_publish_attempt` repeats the readiness check before writing. A `succeeded` attempt on an unready approval is rejected with the stale-approval error and writes nothing. A `failed` attempt is always recorded (history, audit and error queue). If the approval is no longer ready it moves to `changes_requested` instead of back to `approved`, because the transition trigger refuses `approved` for unready variants.
- The approval list shows an approved or scheduled approval that is no longer ready as "Changes requested" with the not-ready note, so the card hides Schedule, Mark published and Publish via LinkedIn and points to Drafts. Record failure follows the stored status (`storedStatus`), so it stays available for a stored `approved` or `scheduled` approval and a real failed outcome is never lost; recording it moves the approval to `changes_requested`. Schedule and Publish via LinkedIn also check readiness directly.

A real hook/body/CTA/hashtag edit increments the revision and moves pending, approved, or scheduled reviews to `changes_requested`, cancelling an active schedule. The old reviewed revision is retained as history; it is not rebound automatically. Normalized no-op edits preserve both revision and approval. A fresh audit and score restore eligibility, not approval: the reviewer must explicitly approve the new revision. The card disables Approve while checks are missing and explains the stale/not-ready state.

Operator actions:

- `needs_review` can be approved, sent to changes, rejected, or cancelled.
- `changes_requested` can return to review, be approved, rejected, or cancelled.
- `approved` can be sent back to review, sent to changes, cancelled, scheduled, manually marked published/failed, or explicitly published through LinkedIn OAuth.
- `scheduled` can be cancelled, manually marked published/failed, or explicitly published through LinkedIn OAuth.
- `published`, `rejected`, and `cancelled` are terminal for normal UI actions, except cancelled records can be returned to review by the data API.

Side effects:

- Requesting changes moves the linked draft to `needs_revision`.
- Returning to review moves the linked draft to `ready_for_review`.
- Scheduling creates a deterministic idempotency key and moves the approval to `scheduled`.
- Successful publish attempts move the approval to `published` and complete the linked schedule when present.
- Manual failed publish attempts keep approved/scheduled approvals actionable and mark the linked schedule failed when present; if readiness was lost they move the approval to `changes_requested` instead.
- Failed follow-up attempts on already published approvals add history only; they do not reopen the approval or mutate completed schedule state.
- Approving a record may unlock a linked Agent Runtime checkpoint, but approval itself never invokes a provider, creates a schedule, or publishes.
- Rejecting a record (the Reject dialog shows the linked-run consequence and takes an optional reason, max 1000 characters, stored as reviewer notes) atomically rejects and cancels linked waiting agent runs ("Approval rejected: {notes}", or "Approval rejected: Approval rejected by operator review" when no reason is given), blocks their workflow step with a `step_blocked` event, records cancellation history, removes their resumable checkpoints, writes an `approval_rejected` safety audit, and opens or updates the approval's error-queue item with its own audit, all without invoking a provider. Any failed write rolls back every one of these changes.

## LinkedIn LittleText escaping

`composeLinkedInCommentary` joins non-empty hook, body, CTA, and hashtags with blank lines.

`escapeLinkedInLittleText` backslash-escapes LinkedIn LittleText reserved characters:

```text
| { } @ [ ] ( ) < > # \ * _ ~
```

The escaped preview is the exact text sent by the OAuth-backed `Publish via LinkedIn` action.

## UI behavior

The Approvals tab includes:

- Campaign filter.
- Summary cards for needs review, approved, scheduled, and published records.
- Create review dialog for eligible drafts.
- Review cards with source context, selected variant, escaped preview, notes, schedule details, and publish history.
- Buttons for approve, request changes, reject, schedule, cancel schedule, mark published, publish via LinkedIn, and record failure. Mark published, Schedule and Publish via LinkedIn require current readiness; Record failure does not.

Confirmation prompts guard rejection, schedule cancellation, manual published recording, and OAuth-backed LinkedIn publishing. `Publish via LinkedIn` is hidden for archived campaigns, non-approved/non-scheduled approvals, kill-switch-enabled state, and approvals with an existing successful publish attempt.

An approved Agent Runtime checkpoint is resumed explicitly from Agent Runtime. The Approvals tab never starts model continuation, scheduling, or publishing as a side effect of approve/reject state changes.

## Explicit exclusions

This feature intentionally excludes:

- Auto-generated content publishing.
- Scheduler execution details, which live in `docs/features/scheduler.md`.
- LinkedIn scraping.
- AI generation, AI audit, and AI rewrite loops.
- Metrics/learning tables.
- Comment/reply automation.
- LinkedIn API commenting.

## Verification commands

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```

Focused regression checks (isolated SQLite fixtures plus mocked browser UI):

```bash
cargo test --manifest-path src-tauri/Cargo.toml approval_readiness::tests --lib
cargo test --manifest-path src-tauri/Cargo.toml approval_review --lib
cargo test --manifest-path src-tauri/Cargo.toml approval_scheduling --lib
cargo test --manifest-path src-tauri/Cargo.toml agent_continuations --lib
cargo test --manifest-path src-tauri/Cargo.toml draft_ai_audits::tests --lib
cargo test --manifest-path src-tauri/Cargo.toml draft_quality --lib
node node_modules/@playwright/test/cli.js test tests/approvals.spec.ts tests/draft-ai-audits.spec.ts tests/agent-runtime.spec.ts tests/workflows.spec.ts
```

These checks cover bypassed UI transitions, stale evidence and reviewer revisions, each content field, no-op edits, migration preservation, reload, and re-audit/re-score recovery. They do not exercise live LinkedIn publishing or redesign IPC permissions.
