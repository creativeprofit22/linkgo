# Content Calendar

## Purpose

Content Calendar is a local-first planning surface for approved LinkedIn post ideas.

It turns an approved approval into one calendar slot with required planning metadata before scheduler execution.

It stays human approval-gated: it only schedules through the existing approval scheduler path and never publishes, scrapes, uploads media, or generates posts autonomously.

## Schema

Migration `19` creates `content_calendar_slots`.

| Column             | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `campaign_id`      | Campaign owning the approval and slot.                                |
| `approval_id`      | Approved post approval. Unique, so one approval has one slot.         |
| `purpose`          | `reach`, `trust`, `proof`, `conversion`, or `community`.              |
| `slot_for`         | Local datetime string used when scheduling.                           |
| `timezone`         | Freeform timezone label, default `local`.                             |
| `format`           | `text`, `image`, `carousel`, `document`, `video`, `poll`, or `event`. |
| `angle`            | Required planning angle.                                              |
| `visual_direction` | Required creative direction.                                          |
| `cta`              | Required call-to-action intent.                                       |
| `notes`            | Optional planning notes.                                              |
| `status`           | Local slot state: `planned` or `archived`.                            |

Scheduled and published states are derived from `approvals`, `schedule_jobs`, and `publish_attempts` instead of being duplicated in the slot row.

## Data API

The slice lives under `src/features/content-calendar`.

- `listContentCalendarSlots(campaignId?)` lists slots with campaign, approval, draft, source post, schedule, and publish context.
- `listContentCalendarEligibleApprovals(campaignId?)` lists approved, scheduled, and published approvals without an existing slot, excluding archived campaigns.
- `createContentCalendarSlot(input)` validates approval status and campaign state, then inserts the slot using the approval campaign.
- `updateContentCalendarSlot(input)` edits slot metadata for planned slots on non-archived campaigns.
- `archiveContentCalendarSlot(input)` marks the slot archived for planning cleanup.
- `scheduleContentCalendarSlot(input)` validates the slot and calls `scheduleApproval({ approvalId, scheduledFor: slot_for, timezone })`.

Persistence is native (`src-tauri/src/content_calendar.rs`); the renderer has no direct SQL access to slots.

- `linkgo_content_calendar_list` returns up to 500 slots and `linkgo_content_calendar_eligible_approvals` up to 200 approvals. Each also returns the related draft audits, and each is read in one transaction.
- `linkgo_content_calendar_create_slot`, `_update_slot` and `_archive_slot` run in one transaction each. They keep the same ownership checks and messages as before (approval exists and is approved, scheduled or published; one slot per approval; campaign not archived; archived slots cannot be edited).
- Every input rejects unknown fields and re-checks each field natively: allowed purpose and format values, required angle, visual direction and CTA (≤ 500 characters each), notes ≤ 1000, and slot time and timezone ≤ 80. Text is trimmed and an empty timezone becomes `local`.
- `linkgo_content_calendar_schedule_preflight` is a read-only check. It returns the approval id, time and timezone to schedule, and `scheduleApproval` then re-checks everything in its own transaction.

Tests: `src-tauri/src/content_calendar_tests.rs`. They cover bad input writing nothing, ownership messages, rollback on an injected failure, two creates at once for the same approval leaving one slot, and an update running alongside an archive.

## Lifecycle

UI lifecycle labels are derived this way:

1. `Archived` when the slot status is `archived`.
2. `Published` when the approval status is `published` or a successful publish attempt exists.
3. `Scheduled` when the approval status is `scheduled` or an active schedule job exists.
4. `Planned` otherwise.

## UI behavior

The Calendar tab sits between Approvals and Scheduler.

Operators can:

- Filter by all campaigns or one campaign.
- See planned, scheduled, published, and archived summary counts.
- Create a slot from an eligible approval.
- Edit planning metadata.
- Archive a slot.
- Schedule a planned slot through the existing approval scheduler.

The create dialog prefills `angle` from the draft and `cta` from the selected variant.

Schedule actions are hidden when a slot is archived, the campaign is archived, the approval is not `approved`, or a schedule job is already active.

## Explicit exclusions

This slice does not include:

- Drag-and-drop calendar grid.
- Recurring slots.
- AI-generated calendar plans.
- Autonomous scheduling or publishing.
- LinkedIn scraping.
- Media upload or asset management.
- Scheduler changes after a schedule job exists.

## Verification

Targeted checks:

```bash
bun run format:check
bun run lint
bun run build
bun run test -- tests/content-calendar.spec.ts
bun run test -- tests/approvals.spec.ts tests/scheduler.spec.ts
bun run test:rust
```

Full gate:

```bash
bun run check
```
