# Content Calendar

## Purpose

Content Calendar (the **Calendar** tab) is the one place to see and change when posts go out. Approvals and the Auto-posting panel link here instead of having their own time controls.

It turns an approved approval into one calendar slot with required planning metadata, then schedules, reschedules or cancels it.

It stays human approval-gated: it schedules only through the approvals feature's public `scheduleApproval` / `cancelSchedule` (native `approval_scheduling` rules unchanged) and never publishes, scrapes, uploads media, or generates posts autonomously.

## Schema

Migration `19` creates `content_calendar_slots`.

| Column             | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `campaign_id`      | Campaign owning the approval and slot.                                |
| `approval_id`      | Approved post approval. Unique, so one approval has one slot.         |
| `purpose`          | `reach`, `trust`, `proof`, `conversion`, or `community`.              |
| `slot_for`         | Wall-clock time `YYYY-MM-DDTHH:mm` in `timezone`, used to schedule.   |
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
- `updateContentCalendarSlot(input)` edits slot metadata for planned slots on non-archived campaigns. It never touches `schedule_jobs`, so times for scheduled posts change only via Reschedule (`rescheduleContentCalendarSlot`).
- `archiveContentCalendarSlot(input)` marks the slot archived for planning cleanup.
- `scheduleContentCalendarSlot(input)` validates the slot and calls `scheduleApproval({ approvalId, scheduledFor: slot_for, timezone })`.
- `rescheduleContentCalendarSlot(input)` saves the new time (`updateContentCalendarSlot`), cancels the waiting job when `activeScheduleJobId` is set, then schedules again through the same preflight. It returns `{ ok: true }` or `{ ok: false, stage: "update" | "cancel" | "schedule", previousScheduleCancelled, error }`. These are three native calls and not atomic: a failure after the cancel leaves the post `approved` and unscheduled (never posted unexpectedly), and the UI says "Old time cancelled; new time wasn't saved" so the operator picks a time again. A `failed` job needs no cancel; native updates the same `schedule_jobs` row (one per approval).
- `cancelContentCalendarSlotSchedule({ scheduleJobId })` calls `cancelSchedule` with the job id (there is no slot ownership check); native resets the approval to `approved`.

Persistence is native (`src-tauri/src/content_calendar.rs`); the renderer has no direct SQL access to slots.

- `linkgo_content_calendar_list` returns up to 500 slots and `linkgo_content_calendar_eligible_approvals` up to 200 approvals. Each also returns the related draft audits, and each is read in one transaction.
- `linkgo_content_calendar_create_slot`, `_update_slot` and `_archive_slot` run in one transaction each. They keep the same ownership checks and messages as before (approval exists and is approved, scheduled or published; one slot per approval; campaign not archived; archived slots cannot be edited).
- Every input rejects unknown fields and re-checks each field natively: allowed purpose and format values, required angle, visual direction and CTA (≤ 500 characters each), notes ≤ 1000, and slot time and timezone ≤ 80. Text is trimmed and an empty timezone becomes `local`.
- `linkgo_content_calendar_schedule_preflight` is a read-only check. It returns the approval id, time and timezone to schedule, and `scheduleApproval` then re-checks everything in its own transaction.

Tests: `src-tauri/src/content_calendar_tests.rs`. They cover bad input writing nothing, ownership messages, rollback on an injected failure, two creates at once for the same approval leaving one slot, and an update running alongside an archive.

## Lifecycle

UI lifecycle labels are derived this way:

1. `Archived` when the slot status is `archived`.
2. `Posted` when the approval status is `published` or a successful publish attempt exists.
3. `Scheduled` when the approval status is `scheduled` or an active schedule job exists.
4. `Planned` otherwise.

## UI behavior

The Calendar tab sits after Approvals. At `xl` widths it is two columns: the slots, and an **Auto-posting** side panel (`<aside aria-label="Auto-posting">`, see [scheduler](scheduler.md)); on narrower windows the panel stacks below. The panel follows the Calendar's campaign filter.

Operators can:

- Filter by all campaigns or one campaign.
- See Planned, Scheduled, Posted, and Archived summary counts.
- Create a slot from an eligible approval.
- Edit planning metadata. While the slot's job is `scheduled`, Edit locks the date, time and time zone (the worker posts at the job's time, which `_update_slot` doesn't change) and says to use Reschedule; it saves the slot's current time unchanged with the other fields.
- Archive a slot.
- Schedule a planned slot (`Schedule post`).
- **Reschedule** a slot whose job is `scheduled` or `failed`: the "Pick a new time" dialog opens prefilled and **Save new time** runs `rescheduleContentCalendarSlot`.
- **Cancel schedule** on a `scheduled` slot, after a confirm prompt. The post stays approved and the button goes back to `Schedule post`.
- Reschedule a post that didn't go out from the Auto-posting panel: its **Reschedule** button opens that slot's dialog, or the Add to plan flow below when the post has no slot.

Slot times are shown formatted, not as the stored string.

The create dialog prefills `angle` from the draft and `cta` from the selected variant.

A `#/calendar?campaignId=C&approvalId=A` link (from `See on calendar` on an approval or idea) selects the campaign and highlights that post's slot. If the approved post has no slot yet, a notice says it "isn't on your plan yet" with `Add to plan`, which opens Plan a post with that approval picked and its schedule time and time zone prefilled. Every stored schedule format is prefilled: `YYYY-MM-DDTHH:MM` or `YYYY-MM-DD HH:MM`, with optional seconds (dropped). A time ending in `Z` or `±HH:MM` is converted to the wall-clock time in the schedule's time zone (`local` means the device zone); if that zone isn't recognized, the time is left blank for the operator rather than shown shifted. Nothing is created until the operator submits. Posts that aren't approved, or ids that don't exist, get a plain notice. See [navigation](navigation.md) and [post flow](post-flow.md).

Schedule post is hidden when a slot is archived, the campaign is archived, the approval is not `approved`, or a schedule job is already active. Reschedule and Cancel schedule are hidden for archived slots and campaigns and for posted approvals. Native code re-checks every rule.

## Date and time picker

Plan a post, Edit and Pick a new time use `DateTimePicker` (`src/components/date-time-picker.tsx`) instead of a plain `datetime-local` input:

- The date comes from `react-day-picker` (pinned `10.0.2`, wrapped as `src/components/ui/calendar.tsx`) in a popover (`src/components/ui/popover.tsx`) behind a "Choose a date" button. The time is a labelled `<input type="time">`.
- Keyboard: opening the popover focuses the selected day (or today); arrows move by day and week, PageUp/PageDown by month, Shift+PageUp/PageDown by year, Home/End to the week edges, Enter picks.
- The value stays the wall-clock string `YYYY-MM-DDTHH:mm`, so storage and native validation are unchanged. String ↔ date conversion goes by parts (`src/lib/date-time/wall-clock.ts`), never through UTC parsing, so nothing shifts by a day.
- Time zones: an IANA zone is passed to the calendar so "today" matches the slot's zone. `local` shows the device zone name from `Intl.DateTimeFormat().resolvedOptions().timeZone`. An unrecognised zone falls back to the device calendar.

## Drag-to-reschedule (evaluated, not adopted)

Evaluated 2026-10-11: a schedule-x calendar view, and dnd-kit `useSortable` on the existing list. **Skipped.**

- The Calendar is a time-ordered list, not a time grid. Reordering a list item implies no target date or time, so sortable drag can't express a reschedule.
- schedule-x would add a second rendering model and a large dependency next to the list, and keyboard rescheduling would still need the picker.
- Keyboard rescheduling is already fully covered by Reschedule plus the picker.

Neither package is installed. Revisit only if the Calendar becomes a week or month grid.

## Explicit exclusions

This slice does not include:

- Drag-and-drop calendar grid (see the decision above).
- Recurring slots.
- AI-generated calendar plans.
- Autonomous scheduling or publishing.
- LinkedIn scraping.
- Media upload or asset management.
- Changes to native scheduling or safety rules.

## Verification

Targeted checks:

```bash
bun run format:check
bun run lint
bun run build
bun run test -- tests/content-calendar.spec.ts
bun run test -- tests/scheduling-calendar.spec.ts tests/content-calendar-prefill.spec.ts
bun run test -- tests/approvals.spec.ts tests/scheduler.spec.ts
bun run test:rust
```

Full gate:

```bash
bun run check
```
