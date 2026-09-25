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

Data functions live in `src/features/campaigns/data.ts`. Persistence is owned natively by `src-tauri/src/campaigns.rs`; the renderer has no `@/lib/db` access and calls feature-scoped commands through `invokeCommand`:

| Data function                   | Native command               | Notes                                                                                                                      |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `createCampaign(input)`         | `linkgo_campaign_create`     | One transaction: campaign row + manual keywords. Returns the new id.                                                       |
| `listCampaigns()`               | `linkgo_campaign_list`       | One read transaction; non-archived first, then `updated_at DESC, id DESC`; natively capped at 500; keywords `keyword ASC`. |
| `updateCampaign(input)`         | `linkgo_campaign_update`     | One transaction: partial field update and, when `keywords` is provided, keyword replacement.                               |
| `setCampaignStatus(id, status)` | `linkgo_campaign_status_set` | Single-statement write through `db_transaction::settle`.                                                                   |

Native inputs use `#[serde(deny_unknown_fields)]` and re-validate lengths, ranges, statuses and keyword counts (max 30, 80 chars, case-insensitive dedupe, first spelling wins). Rows are validated in the renderer with `.strict()` Zod schemas (`campaignWithKeywordsSchema`, `campaignListSchema`).

**Atomicity change:** create and update are single native transactions. Previously the renderer issued separate statements, so a keyword failure during update could leave a half-updated campaign (fields changed, keywords removed). A failure now rolls back the whole write.

The former exported `attachKeywords(campaigns)` helper was removed; keyword batching (one `IN (...)` query per list) now happens natively and nothing in `src/` used it directly.

The unreachable `getCampaign`, `addCampaignKeyword` and `deleteCampaign` functions and their native commands (`linkgo_campaign_get`, `linkgo_campaign_keyword_add`, `linkgo_campaign_delete`) were removed: no UI or workflow called them, and a destructive cascading delete should not ship without a confirmed product surface. Campaigns are retired by archiving. Re-add each command with its caller and a Playwright spec when a feature needs it (for example keyword learning or a confirmed delete action).

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
