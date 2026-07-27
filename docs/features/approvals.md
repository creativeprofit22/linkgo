# Approvals + Scheduler

## Purpose

The Approvals tab turns selected clean draft variants into local human review records, local schedule records, manual publish-attempt history, and explicit OAuth-backed LinkedIn post publishing.

This feature is approval-gated and local-first for review state. It calls LinkedIn when an operator confirms `Publish via LinkedIn` on an approved or scheduled post. Background due-job execution is documented separately in `docs/features/scheduler.md` and uses the same approved scheduled records.

## Schema

Migration version `4` creates:

- `approvals`: one review record per draft and selected draft variant.
- `schedule_jobs`: one local LinkedIn schedule record per approval.
- `publish_attempts`: manual or OAuth-backed success/failure history for approved or scheduled posts, plus failed follow-up attempts after publication.

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

Validation uses Zod schemas in `src/features/approvals/schemas.ts`.

## Lifecycle transitions

A draft can become eligible only when:

- The draft status is `ready_for_review`.
- Exactly one variant is selected.
- The selected variant has no `block` audit findings.
- The campaign is not archived.
- No approval already exists for that draft.

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
- Manual failed publish attempts keep approved/scheduled approvals actionable and mark the linked schedule failed when present.
- Failed follow-up attempts on already published approvals add history only; they do not reopen the approval or mutate completed schedule state.
- Approving a record may unlock a linked Agent Runtime checkpoint, but approval itself never invokes a provider, creates a schedule, or publishes.
- Rejecting a record atomically rejects and cancels linked waiting agent runs, records cancellation history, and removes their resumable checkpoints without invoking a provider.

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
- Buttons for approve, request changes, reject, schedule, cancel schedule, mark published, publish via LinkedIn, and record failure.

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
