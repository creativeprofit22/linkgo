# Metrics + Learning

## Purpose

The Metrics tab records LinkedIn post performance snapshots for published approvals.

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
- `runMetricRefreshTick()`

Native commands:

- `linkgo_metric_refresh_status`
- `linkgo_metric_refresh_start`
- `linkgo_metric_refresh_stop`
- `linkgo_metric_refresh_tick`

Validation uses Zod schemas in `src/features/metrics/schemas.ts`.

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

Due active jobs refresh only while Linkgo is open or hidden to tray, and the global kill switch blocks network calls.

Each successful API refresh inserts a `post_metrics` row, a normal `learning_events.metric_recorded` row, and a `metric_refresh_events.refresh_completed` row.

## UI behavior

The Metrics tab includes:

- Campaign filter.
- Summary cards for manual metrics, API refresh state, due jobs, unavailable jobs, and API snapshots.
- Start/stop controls for opt-in metric refresh.
- Manual `Refresh LinkedIn metrics now` tick control.
- Record metrics dialog for published posts.
- Metric cards with source badge: `Manual` or `LinkedIn social metadata`.
- Clear API limitation copy for API snapshots.
- Refresh jobs and recent refresh events.
- Save memory dialog from metric cards.
- Campaign memory cards with archive/restore controls.
- Learning event list.

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
