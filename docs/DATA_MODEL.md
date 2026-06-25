# Linkgo Data Model

## Current schema

### `campaigns`

Stores local campaign context and automation intent.

| Column                | Type    | Notes                                                     |
| --------------------- | ------- | --------------------------------------------------------- |
| `id`                  | INTEGER | Primary key                                               |
| `name`                | TEXT    | Required and unique                                       |
| `product`             | TEXT    | Product/service context                                   |
| `audience`            | TEXT    | Target audience                                           |
| `voice`               | TEXT    | Voice guidance                                            |
| `tone`                | TEXT    | Tone guidance                                             |
| `auto_pilot`          | INTEGER | Boolean-like flag, default `0`, constrained to `0` or `1` |
| `status`              | TEXT    | `draft`, `active`, `paused`, or `archived`                |
| `daily_post_limit`    | INTEGER | Conservative local cap, constrained to `0` through `10`   |
| `daily_comment_limit` | INTEGER | Conservative local cap, constrained to `0` through `50`   |
| `created_at`          | TEXT    | SQLite datetime                                           |
| `updated_at`          | TEXT    | SQLite datetime                                           |

Indexes: `idx_campaigns_status`, `idx_campaigns_auto_pilot`.

### `campaign_keywords`

Stores manual/generated/learned keywords for campaign discovery.

| Column        | Type    | Notes                                          |
| ------------- | ------- | ---------------------------------------------- |
| `id`          | INTEGER | Primary key                                    |
| `campaign_id` | INTEGER | References `campaigns(id)` with cascade delete |
| `keyword`     | TEXT    | Unique per campaign                            |
| `source`      | TEXT    | `manual`, `generated`, or `learned`            |
| `created_at`  | TEXT    | SQLite datetime                                |

Indexes: `idx_campaign_keywords_campaign_id`, `idx_campaign_keywords_keyword`.

### `target_posts`

Stores the observed external LinkedIn post source for manual queue intake.

| Column               | Type    | Notes                                       |
| -------------------- | ------- | ------------------------------------------- |
| `id`                 | INTEGER | Primary key                                 |
| `platform`           | TEXT    | Defaults to `linkedin`, constrained for now |
| `url`                | TEXT    | Original URL or source locator              |
| `normalized_url`     | TEXT    | Lowercased/trimmed dedupe URL               |
| `author_name`        | TEXT    | Optional, default empty string              |
| `author_profile_url` | TEXT    | Optional, default empty string              |
| `posted_at`          | TEXT    | Optional external post timestamp            |
| `content`            | TEXT    | Required post text or excerpt               |
| `content_hash`       | TEXT    | Deterministic hash for duplicate checks     |
| `created_at`         | TEXT    | SQLite datetime                             |
| `updated_at`         | TEXT    | SQLite datetime                             |

Indexes: `idx_target_posts_platform`, `idx_target_posts_normalized_url`, `idx_target_posts_content_hash`.

### `candidate_posts`

Connects a campaign to a target post and stores manual triage state.

| Column            | Type    | Notes                                             |
| ----------------- | ------- | ------------------------------------------------- |
| `id`              | INTEGER | Primary key                                       |
| `campaign_id`     | INTEGER | References `campaigns(id)` with cascade delete    |
| `target_post_id`  | INTEGER | References `target_posts(id)` with cascade delete |
| `source_keyword`  | TEXT    | Optional keyword/source that found it             |
| `status`          | TEXT    | `new`, `shortlisted`, `rejected`, or `drafted`    |
| `relevance_score` | INTEGER | Optional `0` through `100` score                  |
| `score_reason`    | TEXT    | Optional rationale, default empty string          |
| `notes`           | TEXT    | Optional operator notes, default empty string     |
| `created_at`      | TEXT    | SQLite datetime                                   |
| `updated_at`      | TEXT    | SQLite datetime                                   |

Constraints: unique `(campaign_id, target_post_id)`, checked status values, and checked score range.

Indexes: `idx_candidate_posts_campaign_id`, `idx_candidate_posts_status`, `idx_candidate_posts_relevance_score`.

### `dedupe_keys`

Stores per-campaign duplicate keys for normalized URL and content hash collisions.

| Column              | Type    | Notes                                           |
| ------------------- | ------- | ----------------------------------------------- |
| `id`                | INTEGER | Primary key                                     |
| `campaign_id`       | INTEGER | References `campaigns(id)` with cascade delete  |
| `key_type`          | TEXT    | `normalized_url` or `content_hash`              |
| `key_value`         | TEXT    | Required duplicate key                          |
| `candidate_post_id` | INTEGER | References `candidate_posts(id)` cascade delete |
| `created_at`        | TEXT    | SQLite datetime                                 |

Constraints: unique `(campaign_id, key_type, key_value)` and checked key type values.

Indexes: `idx_dedupe_keys_campaign_id`, `idx_dedupe_keys_key`.

### `drafts`

Stores one local drafting workspace for a candidate post.

| Column              | Type    | Notes                                                                  |
| ------------------- | ------- | ---------------------------------------------------------------------- |
| `id`                | INTEGER | Primary key                                                            |
| `campaign_id`       | INTEGER | References `campaigns(id)` with cascade delete                         |
| `candidate_post_id` | INTEGER | References `candidate_posts(id)` with cascade delete; unique per draft |
| `angle`             | TEXT    | Optional operator angle, default empty string                          |
| `notes`             | TEXT    | Optional operator notes, default empty string                          |
| `status`            | TEXT    | `drafting`, `needs_revision`, `ready_for_review`, or `archived`        |
| `created_at`        | TEXT    | SQLite datetime                                                        |
| `updated_at`        | TEXT    | SQLite datetime                                                        |

Constraints: unique `candidate_post_id` and checked status values.

Indexes: `idx_drafts_campaign_id`, `idx_drafts_candidate_post_id`, `idx_drafts_status`.

### `draft_variants`

Stores one to five operator-written LinkedIn post options per draft.

| Column           | Type    | Notes                                       |
| ---------------- | ------- | ------------------------------------------- |
| `id`             | INTEGER | Primary key                                 |
| `draft_id`       | INTEGER | References `drafts(id)` with cascade delete |
| `variant_number` | INTEGER | `1` through `5`, unique per draft           |
| `hook`           | TEXT    | Optional hook text, default empty string    |
| `body`           | TEXT    | Optional body text, default empty string    |
| `cta`            | TEXT    | Optional CTA text, default empty string     |
| `hashtags`       | TEXT    | Optional hashtag text, default empty string |
| `status`         | TEXT    | `draft`, `selected`, or `rejected`          |
| `created_at`     | TEXT    | SQLite datetime                             |
| `updated_at`     | TEXT    | SQLite datetime                             |

Constraints: unique `(draft_id, variant_number)`, checked variant number range, and checked status values.

Indexes: `idx_draft_variants_draft_id`, `idx_draft_variants_status`.

### `draft_audits`

Stores deterministic audit findings for each draft variant.

| Column             | Type    | Notes                                          |
| ------------------ | ------- | ---------------------------------------------- |
| `id`               | INTEGER | Primary key                                    |
| `draft_variant_id` | INTEGER | References `draft_variants(id)` cascade delete |
| `rule_key`         | TEXT    | Deterministic audit rule identifier            |
| `severity`         | TEXT    | `pass`, `warning`, or `block`                  |
| `message`          | TEXT    | Operator-facing finding message                |
| `created_at`       | TEXT    | SQLite datetime                                |

Constraints: checked severity values.

Indexes: `idx_draft_audits_variant_id`, `idx_draft_audits_severity`.

## Reserved future tables

Future slices will add their own migrations for:

- Approvals and scheduling: `approvals`, `schedule_jobs`, `publish_attempts`.
- Metrics and learning: `post_metrics`, `campaign_memory`, `learning_events`.
- Workflows: `workflow_runs`, `workflow_steps`, `workflow_events`.
- Safety and observability: `safety_limits`, `rate_limit_events`, `audit_events`, `error_queue`.
