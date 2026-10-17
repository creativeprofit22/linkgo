# Metrics + Learning

## Purpose

The Analytics tab records LinkedIn post performance snapshots for published approvals.

Operators can still enter full manual snapshots.

Linkgo can also opt in to LinkedIn API refresh for social metadata only: reactions and comments on published LinkedIn posts.

All metric history, refresh jobs, refresh events, campaign memory, and learning events stay local in SQLite.

## Scope and LinkedIn limits

LinkedIn member social metadata refresh uses the native OAuth boundary and requires approved read access with `r_member_social_feed` when scopes are known.

The API refresh collects:

- Reactions/likes.
- First-level comments.

The API refresh does not collect member-post impressions, profile visits, link clicks, repost counts, or CTR.

API snapshots store those unavailable metrics as safe defaults: `0`, `0`, `0`, `0`, and `null`, with a source badge and note so they are not mistaken for true zero reach.

Manual snapshots remain the source for reach and click metrics.

## Schema

Migration version `5` creates:

- `post_metrics`: metric snapshots for one published approval.
- `campaign_memory`: human-approved campaign learning notes.
- `learning_events`: append-only lifecycle events for metric and memory activity.

Migration version `14` adds:

- `post_metrics.collection_source`: `manual` or `linkedin_social_metadata`.
- `post_metrics.raw_payload_json`: raw LinkedIn social metadata payload for API snapshots.
- `metric_refresh_settings`: one-row opt-in worker settings.
- `metric_refresh_jobs`: durable per-approval LinkedIn refresh jobs.
- `metric_refresh_events`: local worker/job event history.

## Data API

Feature folder: `src/features/metrics`.

Public data functions include:

- `listMetricEligibleApprovals(campaignId?)`
- `listPostMetrics(campaignId?)`
- `listCampaignMemory(campaignId?)`
- `listLearningEvents(campaignId?)`
- `listMetricRefreshDashboard(campaignId?)`
- `recordPostMetric(input)`
- `createCampaignMemory(input)`
- `setCampaignMemoryStatus(input)`
- `getMetricRefreshStatus()`
- `startMetricRefresh()`
- `stopMetricRefresh()`
- `listPostsMissingResults({ signal?, now? })` — read-only: published posts
  with no recorded results, newest first, with a plain post title, as
  `{ items, totalCount }`. `items` holds at most 50 posts; `totalCount` is the
  uncapped total. Backed by `linkgo_metrics_posts_missing_results`, so a post
  with any metric row (added by you or from LinkedIn) is never reported
  missing, however many refreshes other posts have. Posts are listed only once
  they went out at least `RESULTS_PROMPT_DELAY_HOURS` (48) before `now`
  (default: the current time); the renderer sends that instant as
  `publishedBefore`. Used by [Today](today.md).
- `computeResultPatterns(metrics, { timeZone })` in `patterns.ts` — pure
  pattern analysis (see [Result patterns](#result-patterns)).
- `runMetricRefreshTick()`

Native commands:

- `linkgo_metric_refresh_status`
- `linkgo_metric_refresh_start`
- `linkgo_metric_refresh_stop`
- `linkgo_metric_refresh_tick`
- `linkgo_metrics_record_post_metric` — backs `recordPostMetric`; returns `{ id }`.
- `linkgo_metrics_create_campaign_memory` — backs `createCampaignMemory`; returns `{ id }`.
- `linkgo_metrics_set_campaign_memory_status` — backs `setCampaignMemoryStatus`; returns `{ id }`.

Validation uses Zod schemas in `src/features/metrics/schemas.ts`; the native commands (`src-tauri/src/metrics.rs`) re-validate bounds and reject unknown fields. Each mutation re-reads ownership (approval or post metric belongs to the stated campaign, campaign not archived, approval published with a successful publish attempt) and writes its row plus the `learning_events` entry on one pinned `BEGIN IMMEDIATE` connection, so any failure rolls back both. Real-SQLite tests: `src-tauri/src/metrics_tests.rs`.

Reads are native too (`src-tauri/src/metrics_reads.rs`); the renderer has no direct SQL access to metrics tables. Each read takes an optional positive `campaignId` and rejects unknown fields.

- `linkgo_metrics_eligible_approvals`, `linkgo_metrics_post_metrics_list`, `linkgo_metrics_campaign_memory_list` and `linkgo_metrics_learning_events_list` return up to 500 rows each.
- `linkgo_metrics_posts_missing_results` takes `{ campaignId?, publishedBefore? }` and returns `{ items, totalCount }`: eligible published approvals (latest successful attempt, campaign not archived) with no `post_metrics` row at all (`NOT EXISTS`) whose latest successful attempt is at or before `publishedBefore` (when given), newest publish first, up to 50 items, plus the uncapped count, both read in one transaction. A `publishedBefore` SQLite cannot read as a date and time (or longer than 64 characters) is rejected.
- `linkgo_metrics_refresh_dashboard` returns the refresh settings, up to 500 jobs, the 20 newest events and the summary counts, all read in one transaction.

Response shapes are checked by strict schemas in `src/features/metrics/record-schemas.ts`. Tests: `src-tauri/src/metrics_reads_tests.rs`.

## Lifecycle rules

A post can receive metrics only when:

- The approval exists.
- The approval belongs to the selected campaign.
- The campaign is not archived.
- The approval status is `published`.
- At least one successful publish attempt exists.

API refresh jobs are seeded from published approvals with a latest successful LinkedIn publish attempt.

Target URNs resolve from `publish_attempts.platform_post_id` first, then `external_post_url`.

Jobs with no resolvable LinkedIn URN become `unavailable`.

Due active jobs refresh only while Linkgo is open or hidden to tray, and the global kill switch (on screen: "Emergency pause") blocks network calls.

Each successful API refresh inserts a `post_metrics` row, a normal `learning_events.metric_recorded` row, and a `metric_refresh_events.refresh_completed` row.

## UI behavior

The Analytics tab includes:

- Campaign filter.
- Summary cards for manual metrics, API refresh state, due jobs, unavailable jobs, and API snapshots.
- Start/stop controls (`Turn on auto-update` / `Turn off auto-update`) for opt-in metric refresh.
- Manual `Update from LinkedIn now` tick control.
- Add results dialog for published posts. `#/metrics?campaignId=C&approvalId=A`
  opens it with that post picked ([navigation](navigation.md#metrics-links)),
  titled "How did it do?" and showing the post read-only (hook and day it went
  out) with **Pick a different post** to switch back to the post list. When
  the selected post already has a LinkedIn snapshot, reactions and comments
  are filled in from the newest one with a note, whether the dialog was opened
  from the **Add results** button or a link, and again whenever the person
  picks a different post. Prefill never overwrites reactions or comments the
  person has typed, and the note only shows while the prefilled post stays
  selected; the person checks them and adds the rest. Nothing saves until
  **Save results**.
- `What's working` section ([Result patterns](#result-patterns)) with
  **Save as lesson** on each clear pattern.
- Metric cards with source badge: `Added by you` or `From LinkedIn`.
- Clear API limitation copy for API snapshots.
- Updates from LinkedIn section with refresh jobs (`Posts being tracked`) and recent refresh events (`Recent activity`).
- Save lesson dialog from metric cards.
- Campaign memory cards (shown under `What we've learned`) with archive/restore controls.
- Learning event list (shown as `History`).

Archived campaigns keep history visible but hide mutation controls.

## Result patterns

`src/features/metrics/patterns.ts` is pure (no I/O, UI or agent imports) and
compares the selected campaign's measured posts. Rules:

- Metric: average reactions + comments + reposts per post, using each post's
  latest result. Not reach-normalised (LinkedIn snapshots carry no
  impressions); the UI says so.
- Dimensions, fixed vocabulary:
  - Opening line (hook, else first body line), checked in order: question
    (`?`) → number (a digit) → how-to (starts with "how") → personal (starts
    with "I", "my" or "we") → plain statement.
  - Format (body): list (3+ bullet or numbered lines) → short (≤ 120 words) →
    longer.
  - Day posted and time posted (morning 5–11, midday 11–14, afternoon 14–17,
    evening 17–22, night), from the latest successful publish attempt (stored
    UTC) shown in the computer's time zone. Posts without one are left out of
    these two only.
- Thin data: fewer than 5 measured posts → "Not enough results yet: n of 5
  posts needed." A group counts only with 2+ posts; fewer than two such groups
  → "too alike to compare". A pattern is claimed only when the best group's
  average is at least 1.2× the runner-up's; otherwise "No clear winner".
  Sample size is always shown. Ties sort by group key, so output is
  deterministic.
- **Save as lesson** is a human click that creates a `winner` campaign memory
  with a fixed summary (e.g. "Open with a question", "Post on Tuesdays") and
  evidence quoting the averages and counts. It is disabled once a lesson with
  that summary exists and for archived campaigns. Lessons are used by new
  drafts ([drafts](drafts.md#lessons-in-drafts)) and switched on or off in
  [Brand voice](playbooks.md#lessons-from-your-results).

## Explicit exclusions

This feature intentionally excludes:

- Scraping LinkedIn pages.
- LinkedIn member-post impressions/click analytics.
- Organization-page analytics collection.
- AI winner/loser analysis (result patterns are fixed, deterministic rules).
- Automatic campaign-memory generation.
- Comment/reply automation.
- Running refresh jobs after Linkgo quits.

## Verification commands

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
