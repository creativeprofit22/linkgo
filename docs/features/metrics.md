# Metrics + Learning

## Purpose

The Metrics tab records manual LinkedIn post performance snapshots for published approvals.

It also stores human-approved campaign memory and an append-only learning event stream.

This feature is local-first and manual-only. It does not call LinkedIn, scrape metrics, run AI analysis, or start background jobs.

## Schema

Migration version `5` creates:

- `post_metrics`: one manual metric snapshot for one published approval.
- `campaign_memory`: human-approved campaign learning notes.
- `learning_events`: append-only lifecycle events for metric and memory activity.

### `post_metrics`

Important columns:

- `campaign_id`: campaign owning the published approval.
- `approval_id`: published approval being measured.
- `publish_attempt_id`: latest successful publish attempt evidence when available.
- `platform`: constrained to `linkedin`.
- `measured_at`: operator-entered snapshot time.
- `impressions`, `reactions`, `comments`, `reposts`, `profile_visits`, `link_clicks`: non-negative counts.
- `ctr`: optional stored CTR percentage, constrained to `0..100`.
- `notes`: operator notes.

Derived values are calculated in TypeScript:

- `engagementCount = reactions + comments + reposts`.
- `engagementRate = impressions > 0 ? engagementCount / impressions * 100 : null`.
- `displayCtr = ctr ?? link_clicks / impressions * 100` when impressions exist.

### `campaign_memory`

Important columns:

- `campaign_id`: owning campaign.
- `post_metric_id`: optional metric evidence, set null if the metric is deleted.
- `signal`: `winner`, `underperformer`, `insight`, or `avoid`.
- `summary`: required human-approved learning note.
- `evidence`: optional supporting detail.
- `confidence`: integer `0..100`, default `50`.
- `status`: `active` or `archived`.

### `learning_events`

Event types:

- `metric_recorded`
- `memory_created`
- `memory_archived`
- `memory_restored`

Events are append-only. They preserve the local learning timeline even when memory status changes.

## Data API

Feature folder: `src/features/metrics`.

Public data functions:

- `listMetricEligibleApprovals(campaignId?)`
- `listPostMetrics(campaignId?)`
- `listCampaignMemory(campaignId?)`
- `listLearningEvents(campaignId?)`
- `recordPostMetric(input)`
- `createCampaignMemory(input)`
- `setCampaignMemoryStatus(input)`

Validation uses Zod schemas in `src/features/metrics/schemas.ts`.

## Lifecycle rules

A post can receive metrics only when:

- The approval exists.
- The approval belongs to the selected campaign.
- The campaign is not archived.
- The approval status is `published`.
- At least one successful publish attempt exists.

Creating memory requires:

- A non-archived campaign.
- A valid optional metric from the same campaign.
- A required summary.

Changing memory status requires:

- Existing memory.
- A non-archived campaign.

Each mutation writes a learning event in the same transaction.

## UI behavior

The Metrics tab includes:

- Campaign filter.
- Summary cards for measured posts, total impressions, average engagement, and active memories.
- Record metrics dialog for published posts.
- Metric cards with source context, selected variant, publish evidence, counters, engagement rate, CTR, and notes.
- Save memory dialog from metric cards.
- Campaign memory cards with archive/restore controls.
- Learning event list.

Archived campaigns keep history visible but hide mutation controls.

## Manual-only/local-only constraints

Operators enter metrics manually from LinkedIn or another trusted source.

Linkgo stores raw counts and optional CTR locally in SQLite.

No LinkedIn OAuth, API calls, scraping, metric polling, or scheduler is included.

## Explicit exclusions

This feature intentionally excludes:

- LinkedIn OAuth/API metrics collection.
- Automatic metrics refresh.
- Background jobs.
- AI winner/loser analysis.
- Automatic campaign-memory generation.
- Comment/reply automation.

## Verification commands

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
