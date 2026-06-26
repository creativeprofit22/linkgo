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

### `approvals`

Stores one human review record for one selected draft variant.

| Column             | Type    | Notes                                                                                                  |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| `id`               | INTEGER | Primary key                                                                                            |
| `campaign_id`      | INTEGER | References `campaigns(id)` cascade delete                                                              |
| `draft_id`         | INTEGER | References `drafts(id)` cascade delete; unique so one draft has one approval record                    |
| `draft_variant_id` | INTEGER | References `draft_variants(id)` cascade delete; unique so one selected variant has one approval record |
| `status`           | TEXT    | `needs_review`, `changes_requested`, `approved`, `rejected`, `scheduled`, `published`, or `cancelled`  |
| `reviewer_notes`   | TEXT    | Optional operator notes, default empty string                                                          |
| `approved_at`      | TEXT    | Nullable approval timestamp                                                                            |
| `rejected_at`      | TEXT    | Nullable rejection timestamp                                                                           |
| `created_at`       | TEXT    | SQLite datetime                                                                                        |
| `updated_at`       | TEXT    | SQLite datetime                                                                                        |

Constraints: unique `draft_id`, unique `draft_variant_id`, and checked status values.

Indexes: `idx_approvals_campaign_id`, `idx_approvals_status`, `idx_approvals_draft_id`, `idx_approvals_variant_id`.

### `schedule_jobs`

Stores one local schedule record for an approved post. This table does not run a scheduler or publish to LinkedIn.

| Column            | Type    | Notes                                                          |
| ----------------- | ------- | -------------------------------------------------------------- |
| `id`              | INTEGER | Primary key                                                    |
| `approval_id`     | INTEGER | References `approvals(id)` cascade delete; unique per approval |
| `platform`        | TEXT    | Defaults to `linkedin`, constrained to `linkedin`              |
| `scheduled_for`   | TEXT    | Required local datetime string from the operator               |
| `timezone`        | TEXT    | Optional label, default `local`                                |
| `status`          | TEXT    | `scheduled`, `cancelled`, `completed`, or `failed`             |
| `idempotency_key` | TEXT    | Required deterministic key, unique                             |
| `created_at`      | TEXT    | SQLite datetime                                                |
| `updated_at`      | TEXT    | SQLite datetime                                                |

Constraints: unique `approval_id`, unique `idempotency_key`, checked platform, and checked status values.

Indexes: `idx_schedule_jobs_approval_id`, `idx_schedule_jobs_status`, `idx_schedule_jobs_scheduled_for`.

### `publish_attempts`

Stores manual publish outcomes. Successful rows can include a LinkedIn URL or platform post ID; failed rows include an error message.

| Column              | Type    | Notes                                                              |
| ------------------- | ------- | ------------------------------------------------------------------ |
| `id`                | INTEGER | Primary key                                                        |
| `approval_id`       | INTEGER | References `approvals(id)` cascade delete                          |
| `schedule_job_id`   | INTEGER | Nullable, references `schedule_jobs(id)` with `ON DELETE SET NULL` |
| `platform`          | TEXT    | Defaults to `linkedin`, constrained to `linkedin`                  |
| `status`            | TEXT    | `succeeded` or `failed`                                            |
| `external_post_url` | TEXT    | Optional published LinkedIn URL                                    |
| `platform_post_id`  | TEXT    | Optional LinkedIn/platform post ID                                 |
| `error_message`     | TEXT    | Optional failure reason                                            |
| `created_at`        | TEXT    | SQLite datetime                                                    |

Constraints: checked platform and checked status values.

Indexes: `idx_publish_attempts_approval_id`, `idx_publish_attempts_schedule_job_id`, `idx_publish_attempts_status`.

### `post_metrics`

Stores manual LinkedIn metric snapshots for published approvals.

| Column               | Type    | Notes                                                                 |
| -------------------- | ------- | --------------------------------------------------------------------- |
| `id`                 | INTEGER | Primary key                                                           |
| `campaign_id`        | INTEGER | References `campaigns(id)` cascade delete                             |
| `approval_id`        | INTEGER | References `approvals(id)` cascade delete                             |
| `publish_attempt_id` | INTEGER | Nullable, references `publish_attempts(id)` with `ON DELETE SET NULL` |
| `platform`           | TEXT    | Defaults to `linkedin`, constrained to `linkedin`                     |
| `measured_at`        | TEXT    | Operator-entered snapshot time                                        |
| `impressions`        | INTEGER | Non-negative count, default `0`                                       |
| `reactions`          | INTEGER | Non-negative count, default `0`                                       |
| `comments`           | INTEGER | Non-negative count, default `0`                                       |
| `reposts`            | INTEGER | Non-negative count, default `0`                                       |
| `profile_visits`     | INTEGER | Non-negative count, default `0`                                       |
| `link_clicks`        | INTEGER | Non-negative count, default `0`                                       |
| `ctr`                | REAL    | Nullable percentage constrained to `0` through `100`                  |
| `notes`              | TEXT    | Optional operator notes, default empty string                         |
| `created_at`         | TEXT    | SQLite datetime                                                       |
| `updated_at`         | TEXT    | SQLite datetime                                                       |

Indexes: `idx_post_metrics_campaign_id`, `idx_post_metrics_approval_id`, `idx_post_metrics_publish_attempt_id`, `idx_post_metrics_measured_at`.

### `campaign_memory`

Stores human-approved campaign learning notes for future context injection.

| Column           | Type    | Notes                                                             |
| ---------------- | ------- | ----------------------------------------------------------------- |
| `id`             | INTEGER | Primary key                                                       |
| `campaign_id`    | INTEGER | References `campaigns(id)` cascade delete                         |
| `post_metric_id` | INTEGER | Nullable, references `post_metrics(id)` with `ON DELETE SET NULL` |
| `signal`         | TEXT    | `winner`, `underperformer`, `insight`, or `avoid`                 |
| `summary`        | TEXT    | Required human-approved learning note                             |
| `evidence`       | TEXT    | Optional supporting detail, default empty string                  |
| `confidence`     | INTEGER | Integer `0` through `100`, default `50`                           |
| `status`         | TEXT    | `active` or `archived`, default `active`                          |
| `created_at`     | TEXT    | SQLite datetime                                                   |
| `updated_at`     | TEXT    | SQLite datetime                                                   |

Indexes: `idx_campaign_memory_campaign_id`, `idx_campaign_memory_post_metric_id`, `idx_campaign_memory_signal`, `idx_campaign_memory_status`.

### `learning_events`

Stores append-only lifecycle events for metric and memory activity.

| Column               | Type    | Notes                                                                        |
| -------------------- | ------- | ---------------------------------------------------------------------------- |
| `id`                 | INTEGER | Primary key                                                                  |
| `campaign_id`        | INTEGER | References `campaigns(id)` cascade delete                                    |
| `post_metric_id`     | INTEGER | Nullable, references `post_metrics(id)` with `ON DELETE SET NULL`            |
| `campaign_memory_id` | INTEGER | Nullable, references `campaign_memory(id)` with `ON DELETE SET NULL`         |
| `event_type`         | TEXT    | `metric_recorded`, `memory_created`, `memory_archived`, or `memory_restored` |
| `summary`            | TEXT    | Required event summary                                                       |
| `created_at`         | TEXT    | SQLite datetime                                                              |

Indexes: `idx_learning_events_campaign_id`, `idx_learning_events_metric_id`, `idx_learning_events_memory_id`, `idx_learning_events_event_type`, `idx_learning_events_created_at`.

### `workflow_runs`

Stores one resumable content pipeline workflow instance for one campaign.

| Column             | Type    | Notes                                                                                  |
| ------------------ | ------- | -------------------------------------------------------------------------------------- |
| `id`               | INTEGER | Primary key                                                                            |
| `campaign_id`      | INTEGER | References `campaigns(id)` cascade delete                                              |
| `workflow_type`    | TEXT    | Defaults to `content_pipeline`, constrained to `content_pipeline`                      |
| `title`            | TEXT    | Required operator-facing run title                                                     |
| `status`           | TEXT    | `queued`, `running`, `waiting_approval`, `blocked`, `completed`, `failed`, `cancelled` |
| `current_step_key` | TEXT    | `research`, `score`, `draft`, `audit`, `approve`, `schedule`, or `measure`             |
| `context_summary`  | TEXT    | Optional compact run context, default empty string                                     |
| `started_at`       | TEXT    | Nullable start timestamp                                                               |
| `completed_at`     | TEXT    | Nullable completion/cancellation timestamp                                             |
| `created_at`       | TEXT    | SQLite datetime                                                                        |
| `updated_at`       | TEXT    | SQLite datetime                                                                        |

Indexes: `idx_workflow_runs_campaign_id`, `idx_workflow_runs_status`, `idx_workflow_runs_current_step_key`, `idx_workflow_runs_updated_at`.

### `workflow_steps`

Stores ordered state for each canonical pipeline step in a workflow run.

| Column            | Type    | Notes                                                                                 |
| ----------------- | ------- | ------------------------------------------------------------------------------------- |
| `id`              | INTEGER | Primary key                                                                           |
| `workflow_run_id` | INTEGER | References `workflow_runs(id)` cascade delete                                         |
| `step_key`        | TEXT    | `research`, `score`, `draft`, `audit`, `approve`, `schedule`, or `measure`            |
| `title`           | TEXT    | Required step label                                                                   |
| `description`     | TEXT    | Required step description, default empty string                                       |
| `sort_order`      | INTEGER | Integer `1` through `7`                                                               |
| `status`          | TEXT    | `pending`, `running`, `waiting_approval`, `blocked`, `completed`, `failed`, `skipped` |
| `output_summary`  | TEXT    | Optional compact result context, default empty string                                 |
| `error_message`   | TEXT    | Optional error detail, default empty string                                           |
| `started_at`      | TEXT    | Nullable step start timestamp                                                         |
| `completed_at`    | TEXT    | Nullable step completion timestamp                                                    |
| `created_at`      | TEXT    | SQLite datetime                                                                       |
| `updated_at`      | TEXT    | SQLite datetime                                                                       |

Constraints: unique `(workflow_run_id, step_key)`, unique `(workflow_run_id, sort_order)`, checked step key, checked sort order, and checked status values.

Indexes: `idx_workflow_steps_run_id`, `idx_workflow_steps_status`, `idx_workflow_steps_step_key`.

### `workflow_events`

Stores append-only workflow lifecycle events.

| Column             | Type    | Notes                                                                                                        |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------ |
| `id`               | INTEGER | Primary key                                                                                                  |
| `workflow_run_id`  | INTEGER | References `workflow_runs(id)` cascade delete                                                                |
| `workflow_step_id` | INTEGER | Nullable, references `workflow_steps(id)` with `ON DELETE SET NULL`                                          |
| `event_type`       | TEXT    | `run_created`, `run_started`, step lifecycle event values, `run_completed`, `run_cancelled`, or `note_added` |
| `summary`          | TEXT    | Required event summary                                                                                       |
| `created_at`       | TEXT    | SQLite datetime                                                                                              |

Indexes: `idx_workflow_events_run_id`, `idx_workflow_events_step_id`, `idx_workflow_events_event_type`, `idx_workflow_events_created_at`.

## Reserved future tables

Future slices will add their own migrations for:

- Safety and observability: `safety_limits`, `rate_limit_events`, `audit_events`, `error_queue`.
