# Campaign Backlog

## Status and purpose

Roadmap 3C is implemented. Campaign Backlog is one local-first, campaign-scoped work list for recurring and one-off operator planning.

The surface answers three questions: what is due, which campaign owns it, and whether the Operator or Linkgo is responsible. `linkgo` is a planning responsibility label only. It does not run an agent, workflow, draft, approval, schedule, publish action, comment, metric refresh, or connector.

Roadmap 3D is next and will create Linkgo-owned work from approved source connectors for campaigns with autopilot intent. External publishing and commenting remain human approval-gated.

## Persistence

Migration `24` creates `campaign_backlog_items`. Migration `25` adds `recurrence_timezone`; existing recurring rows are deterministically backfilled to `UTC` because their originating IANA zone was not previously stored.

Each row stores:

- a required campaign and optional completed-occurrence parent;
- `research`, `scoring`, `drafting`, `approval`, `scheduling`, `metrics`, `retry`, or `other` work type;
- bounded operator-authored title and details;
- `operator` or `linkgo` ownership;
- `pending`, `in_progress`, `blocked`, `completed`, or `cancelled` status;
- a required UTC ISO-8601 due timestamp;
- `none`, `daily`, or `weekly` recurrence;
- an explicit IANA `recurrence_timezone` for daily/weekly items, or an empty neutral value for one-off items;
- terminal, created, and updated timestamps.

Campaign deletion cascades backlog rows. Deleting a recurrence parent clears `recurrence_parent_id` on its successor so later history remains readable.

## Data contracts

`src/features/campaign-backlog/data.ts` exports:

- `getCampaignBacklogDashboard(filters)` for filtered summaries plus open work or the latest 100 history rows;
- `createCampaignBacklogItem(input)`;
- `updateCampaignBacklogItem(input)`;
- `setCampaignBacklogItemStatus(input)`;
- `getNextCampaignBacklogDueAt(dueAt, recurrence, recurrenceTimeZone, now?)` as the browser-side parity helper for deterministic tests; production completion performs the same calendar policy in Rust.

All mutation inputs pass Zod validation, then call the capability-specific Rust commands `linkgo_campaign_backlog_create`, `linkgo_campaign_backlog_update`, or `linkgo_campaign_backlog_set_status`. Each command owns one SQLite transaction, re-reads the current campaign and item through that transaction, rejects archived campaigns, and rolls back on failure. Update cannot move an item to another campaign.

## Lifecycle

Allowed transitions are:

- `pending -> in_progress | blocked | completed | cancelled`
- `in_progress -> pending | blocked | completed | cancelled`
- `blocked -> pending | in_progress | completed | cancelled`

Completed and cancelled rows are immutable history. They cannot be edited or reopened.

Cancellation is explicit and final. Cancelling recurring work creates no successor.

## Recurrence policy

Daily and weekly recurrence retain the same local wall-clock time in the persisted IANA `recurrence_timezone` on the next calendar day or week, then convert the result to UTC for storage. Creation captures `Intl.DateTimeFormat().resolvedOptions().timeZone`; editing preserves the stored zone unless the operator changes the visible schedule-zone field. Switching to one-off recurrence clears the zone.

Rust uses `chrono-tz` IANA calendar arithmetic, independent of the device or process time zone. An ambiguous fall-back local time chooses the earlier instant. A nonexistent spring-forward local time shifts forward by the daylight-saving gap, matching compatible browser date-time behavior.

Completing recurring work and inserting its successor occur in one Rust-owned SQLite transaction on one connection. If successor insertion fails, completion rolls back. A compare-and-set status update prevents concurrent completion requests from creating two successors. If the completed item is overdue by several intervals, the calculation advances repeatedly and creates exactly one successor in the future. Missed periods therefore coalesce instead of flooding the backlog.

## Dashboard behavior

The Backlog tab sits between Campaigns and Queue.

The first scan shows due-now, in-progress, blocked, and Linkgo-owned counts. Filters scope campaign, owner, and open/history view. Open work is grouped under Overdue, Due next, and Later. History is ordered by terminal time and limited to 100 rows. Global and campaign-scoped history use terminal-only expression indexes matching that ordering, so SQLite can stop at the limit without a temporary sort.

Cards expose campaign, due time, owner, recurrence, work type, status, details, and legal actions. Recurring due times are formatted in and labeled with their persisted schedule zone, so the device zone is not implied to control recurrence. Archived campaigns automatically open history when selected and display read-only guidance. Linkgo-owned cards state that automatic execution arrives with the autopilot planner.

The form keeps persistent labels and entered values across validation or storage errors. Cancellation explains recurrence consequences. Radix dialogs provide Escape behavior, focus containment, and focus return. Native selects reserve trailing indicator space and reflow to one column in a narrow window.

## Explicit exclusions

Roadmap 3C does not:

- fetch, scrape, or search LinkedIn;
- add a source connector;
- infer tasks from `auto_pilot`;
- execute an agent, workflow, draft, approval, schedule, publish action, comment, or metric refresh;
- poll in the background, run after quit, or send notifications;
- add accounts, arbitrary owner identities, or domain-artifact links.

## Verification

```bash
bunx playwright test tests/campaign-backlog.spec.ts
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```

Rust tests against real SQLite transactions prove successor-failure rollback, concurrent completion compare-and-set behavior, and archived mutation rejection. Playwright covers command-boundary UI reflection, creation, owner filtering, legal and illegal transitions, daily and weekly recurrence, cross-device-zone completion, spring-forward/fall-back policy, missed-interval coalescing, cancellation, preserved validation values, duplicate-submit prevention, archived mutation errors, out-of-order filter responses, keyboard focus return, 320-pixel reflow, 200% text, reduced motion, forced colors, and desktop/narrow captures.
