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
- `listPostsMissingResults({ signal? })` — read-only: published posts with no
  recorded results, newest first, with a plain post title, as
  `{ items, totalCount }`. `items` holds at most 50 posts; `totalCount` is the
  uncapped total. Backed by `linkgo_metrics_posts_missing_results`, so a post
  with any metric row is never reported missing, however many refreshes other
  posts have. Used by [Today](today.md).
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
- `linkgo_metrics_posts_missing_results` returns `{ items, totalCount }`: eligible published approvals (latest successful attempt, campaign not archived) with no `post_metrics` row at all (`NOT EXISTS`), newest publish first, up to 50 items, plus the uncapped count, both read in one transaction.
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
  opens it with that post picked ([navigation](navigation.md#metrics-links)).
- Metric cards with source badge: `Added by you` or `From LinkedIn`.
- Clear API limitation copy for API snapshots.
- Updates from LinkedIn section with refresh jobs (`Posts being tracked`) and recent refresh events (`Recent activity`).
- Save lesson dialog from metric cards.
- Campaign memory cards (shown under `What we've learned`) with archive/restore controls.
- Learning event list (shown as `History`).

Archived campaigns keep history visible but hide mutation controls.

## Explicit exclusions

This feature intentionally excludes:

- Scraping LinkedIn pages.
- LinkedIn member-post impressions/click analytics.
- Organization-page analytics collection.
- AI winner/loser analysis.
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
