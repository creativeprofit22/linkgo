# Campaigns Feature

Campaigns define the local context Linkgo uses for guarded source intake, local planning, drafting, approvals, and metrics.

## Purpose

A campaign stores:

- Product or offer context.
- Audience definition.
- Voice and tone guidance.
- Manual keywords.
- Opt-in local Autopilot Planner eligibility.
- Conservative daily post/comment limits.

`auto_pilot = 1` only makes an `active` campaign eligible for the opt-in local planner. It does not start the worker, call a model, execute a workflow, comment, schedule, or publish. Draft, paused, archived, and non-autopilot campaigns are rejected by planner revalidation.

## Schema

Migration: `src-tauri/src/migrations/campaigns.rs`.

Tables:

- `campaigns`
- `campaign_keywords`

See `docs/DATA_MODEL.md` for column-level details.

## Frontend contract

Types live in `src/features/campaigns/types/index.ts`.

Schemas live in `src/features/campaigns/schemas.ts` and use Zod 4.

Data functions live in `src/features/campaigns/data.ts`:

- `createCampaign(input)`
- `listCampaigns()`
- `getCampaign(id)`
- `updateCampaign(input)`
- `deleteCampaign(id)`
- `setCampaignStatus(id, status)`
- `attachKeywords(campaigns)`

`attachKeywords` batches keyword lookup for listed campaigns to avoid N+1 SQL queries.

## UI

`CampaignsView` renders:

- Header and explanation.
- `New campaign` action.
- Empty state.
- Campaign cards with status, explicit local-planner eligibility, product, audience, keywords, and limits.
- Status actions for active, paused, draft restore, and archive.

## Verification

Run:

```bash
bun run lint
bun run build
bun run test
bun run test:rust
```
