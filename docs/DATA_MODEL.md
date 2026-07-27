# Linkgo Data Model

## Current schema

### `app_settings`

Stores singleton local app preferences mirrored from OS-level integration state.

| Column                           | Type    | Notes                                                     |
| -------------------------------- | ------- | --------------------------------------------------------- |
| `id`                             | INTEGER | Primary key constrained to singleton value `1`            |
| `launch_on_login_enabled`        | INTEGER | Boolean-like mirror of the OS autostart state, `0` or `1` |
| `launch_on_login_last_synced_at` | TEXT    | Nullable timestamp for the last successful OS sync        |
| `launch_on_login_last_error`     | TEXT    | Last safe error message from enable/disable attempts      |
| `created_at`                     | TEXT    | SQLite datetime                                           |
| `updated_at`                     | TEXT    | SQLite datetime                                           |

Source of truth: Tauri autostart plugin `isEnabled()` when available. The table is a local mirror/audit row only.

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

| Column                  | Type    | Notes                                                       |
| ----------------------- | ------- | ----------------------------------------------------------- |
| `id`                    | INTEGER | Primary key                                                 |
| `platform`              | TEXT    | Defaults to `linkedin`, constrained for now                 |
| `url`                   | TEXT    | Original URL or source locator                              |
| `normalized_url`        | TEXT    | Lowercased/trimmed dedupe URL                               |
| `platform_resource_urn` | TEXT    | Optional LinkedIn share/UGC/activity URN for API commenting |
| `author_name`           | TEXT    | Optional, default empty string                              |
| `author_profile_url`    | TEXT    | Optional, default empty string                              |
| `posted_at`             | TEXT    | Optional external post timestamp                            |
| `content`               | TEXT    | Required post text or excerpt                               |
| `content_hash`          | TEXT    | Deterministic hash for duplicate checks                     |
| `created_at`            | TEXT    | SQLite datetime                                             |
| `updated_at`            | TEXT    | SQLite datetime                                             |

Indexes: `idx_target_posts_platform`, `idx_target_posts_normalized_url`, `idx_target_posts_content_hash`, `idx_target_posts_platform_resource_urn`.

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

### `candidate_discovery_items`

Stores operator-triggered local AI keyword, trend, and source-prompt suggestions for a campaign. Suggestions are not scraped LinkedIn posts.

| Column             | Type    | Notes                                                              |
| ------------------ | ------- | ------------------------------------------------------------------ |
| `id`               | INTEGER | Primary key                                                        |
| `campaign_id`      | INTEGER | References `campaigns(id)` with cascade delete                     |
| `agent_run_id`     | INTEGER | Nullable, references `agent_runs(id)` with `ON DELETE SET NULL`    |
| `workflow_run_id`  | INTEGER | Nullable, references `workflow_runs(id)` with `ON DELETE SET NULL` |
| `kind`             | TEXT    | `keyword`, `trend`, or `source_prompt`                             |
| `title`            | TEXT    | Optional display title, default empty string                       |
| `keyword`          | TEXT    | Optional generated keyword, default empty string                   |
| `rationale`        | TEXT    | Optional model/operator rationale, default empty string            |
| `source_keyword`   | TEXT    | Optional seed keyword that inspired the suggestion                 |
| `confidence_score` | INTEGER | Nullable `0` through `100` confidence                              |
| `status`           | TEXT    | `suggested`, `promoted`, or `dismissed`                            |
| `created_at`       | TEXT    | SQLite datetime                                                    |
| `updated_at`       | TEXT    | SQLite datetime                                                    |

Constraints: checked kind/status values, checked confidence range, and unique active `(campaign_id, kind, keyword, title)` where status is not `dismissed`.

Indexes: campaign, agent run, workflow run, kind, status, confidence score, and active de-dupe indexes.

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

### `source_import_batches`

Stores one bounded local source-post import attempt for one campaign.

| Column            | Type    | Notes                                                           |
| ----------------- | ------- | --------------------------------------------------------------- |
| `id`              | INTEGER | Primary key                                                     |
| `campaign_id`     | INTEGER | References `campaigns(id)` with cascade delete                  |
| `source_type`     | TEXT    | Constrained to `local_json` for Roadmap 3A                      |
| `status`          | TEXT    | `processing`, `completed`, `completed_with_errors`, or `failed` |
| `total_count`     | INTEGER | Non-negative supplied row count                                 |
| `accepted_count`  | INTEGER | Non-negative rows that created candidates                       |
| `duplicate_count` | INTEGER | Non-negative URL/content collisions                             |
| `rejected_count`  | INTEGER | Non-negative validation or safely recorded processing failures  |
| `error_message`   | TEXT    | Bounded operator-safe batch failure text                        |
| `created_at`      | TEXT    | SQLite datetime                                                 |
| `updated_at`      | TEXT    | SQLite datetime                                                 |

Indexes: `idx_source_import_batches_campaign_id`, `idx_source_import_batches_status`, `idx_source_import_batches_created_at`.

Campaign deletion cascades to its import batches and items. Normal history is retained locally with the campaign; Roadmap 3A does not add automatic retention cleanup.

### `source_import_items`

Stores the bounded audit input and outcome for each row in a source import batch.

| Column                   | Type    | Notes                                                                                               |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------- |
| `id`                     | INTEGER | Primary key                                                                                         |
| `source_import_batch_id` | INTEGER | References `source_import_batches(id)` with cascade delete                                          |
| `row_number`             | INTEGER | Positive and unique within the batch                                                                |
| `status`                 | TEXT    | `pending`, `accepted`, `duplicate`, or `rejected`                                                   |
| `input_json`             | TEXT    | Valid bounded audit JSON, constrained to 20,000 characters; oversized values use a preview envelope |
| `candidate_post_id`      | INTEGER | Nullable candidate reference with `ON DELETE SET NULL`                                              |
| `reason`                 | TEXT    | Bounded validation, duplicate, acceptance, or safe processing explanation                           |
| `created_at`             | TEXT    | SQLite datetime                                                                                     |
| `updated_at`             | TEXT    | SQLite datetime                                                                                     |

Indexes: `idx_source_import_items_batch_id`, `idx_source_import_items_status`, `idx_source_import_items_candidate_id`.

Deleting a candidate preserves its import history and clears only `candidate_post_id`. Deleting a batch or campaign cascades its item rows. The source payload contains only locally supplied post metadata; it never stores OAuth credentials or provider secrets.

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

### `content_calendar_slots`

Stores one local planning slot for one approved approval.

| Column             | Type    | Notes                                                                |
| ------------------ | ------- | -------------------------------------------------------------------- |
| `id`               | INTEGER | Primary key                                                          |
| `campaign_id`      | INTEGER | References `campaigns(id)` cascade delete                            |
| `approval_id`      | INTEGER | References `approvals(id)` cascade delete; unique per approval       |
| `purpose`          | TEXT    | `reach`, `trust`, `proof`, `conversion`, or `community`              |
| `slot_for`         | TEXT    | Required local datetime string                                       |
| `timezone`         | TEXT    | Freeform label, default `local`                                      |
| `format`           | TEXT    | `text`, `image`, `carousel`, `document`, `video`, `poll`, or `event` |
| `angle`            | TEXT    | Required operator planning angle                                     |
| `visual_direction` | TEXT    | Required creative or asset direction                                 |
| `cta`              | TEXT    | Required call-to-action intent                                       |
| `notes`            | TEXT    | Optional planning notes, default empty string                        |
| `status`           | TEXT    | Local planning state: `planned` or `archived`                        |
| `created_at`       | TEXT    | SQLite datetime                                                      |
| `updated_at`       | TEXT    | SQLite datetime                                                      |

Constraints: unique `approval_id`, checked purpose, checked format, checked status, and non-empty trimmed `angle`, `visual_direction`, and `cta`.

Indexes: `idx_content_calendar_slots_campaign_id`, `idx_content_calendar_slots_approval_id`, `idx_content_calendar_slots_slot_for`, `idx_content_calendar_slots_purpose`, `idx_content_calendar_slots_status`.

Scheduled and published state is derived from `approvals`, `schedule_jobs`, and `publish_attempts` instead of duplicated here.

### `comment_threads`

Stores one local, approval-gated comment workflow for one candidate target post.

| Column              | Type    | Notes                                                                                             |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `id`                | INTEGER | Primary key                                                                                       |
| `campaign_id`       | INTEGER | References `campaigns(id)` cascade delete                                                         |
| `candidate_post_id` | INTEGER | References `candidate_posts(id)` cascade delete; unique so one candidate has one thread now       |
| `status`            | TEXT    | `drafting`, `needs_review`, `changes_requested`, `approved`, `rejected`, `posted`, or `cancelled` |
| `operator_notes`    | TEXT    | Optional operator context, default empty string                                                   |
| `reviewer_notes`    | TEXT    | Optional reviewer notes, default empty string                                                     |
| `approved_at`       | TEXT    | Nullable approval timestamp                                                                       |
| `rejected_at`       | TEXT    | Nullable rejection timestamp                                                                      |
| `posted_at`         | TEXT    | Nullable manual posted timestamp                                                                  |
| `created_at`        | TEXT    | SQLite datetime                                                                                   |
| `updated_at`        | TEXT    | SQLite datetime                                                                                   |

Constraints: unique `candidate_post_id` and checked status values.

Indexes: `idx_comment_threads_campaign_id`, `idx_comment_threads_candidate_post_id`, `idx_comment_threads_status`, `idx_comment_threads_updated_at`.

### `comment_variants`

Stores one to three operator-written reply options for a comment thread.

| Column              | Type    | Notes                                           |
| ------------------- | ------- | ----------------------------------------------- |
| `id`                | INTEGER | Primary key                                     |
| `comment_thread_id` | INTEGER | References `comment_threads(id)` cascade delete |
| `variant_number`    | INTEGER | `1` through `3`, unique per comment thread      |
| `body`              | TEXT    | Required local comment draft                    |
| `status`            | TEXT    | `draft`, `selected`, or `rejected`              |
| `created_at`        | TEXT    | SQLite datetime                                 |
| `updated_at`        | TEXT    | SQLite datetime                                 |

Constraints: unique `(comment_thread_id, variant_number)`, checked variant number range, and checked status values.

Indexes: `idx_comment_variants_thread_id`, `idx_comment_variants_status`.

### `comment_audits`

Stores deterministic local audit findings for comment variants.

| Column               | Type    | Notes                                            |
| -------------------- | ------- | ------------------------------------------------ |
| `id`                 | INTEGER | Primary key                                      |
| `comment_variant_id` | INTEGER | References `comment_variants(id)` cascade delete |
| `rule_key`           | TEXT    | Deterministic audit rule identifier              |
| `severity`           | TEXT    | `pass`, `warning`, or `block`                    |
| `message`            | TEXT    | Operator-facing finding message                  |
| `created_at`         | TEXT    | SQLite datetime                                  |

Constraints: checked severity values.

Indexes: `idx_comment_audits_variant_id`, `idx_comment_audits_severity`.

### `comment_attempts`

Stores manual LinkedIn comment posting outcomes. Successful rows include a comment URL or platform comment ID; failed rows include an error message.

| Column                 | Type    | Notes                                             |
| ---------------------- | ------- | ------------------------------------------------- |
| `id`                   | INTEGER | Primary key                                       |
| `comment_thread_id`    | INTEGER | References `comment_threads(id)` cascade delete   |
| `platform`             | TEXT    | Defaults to `linkedin`, constrained to `linkedin` |
| `status`               | TEXT    | `succeeded` or `failed`                           |
| `external_comment_url` | TEXT    | Optional posted LinkedIn comment URL              |
| `platform_comment_id`  | TEXT    | Optional LinkedIn/platform comment ID             |
| `idempotency_key`      | TEXT    | Deterministic key for API comment posting         |
| `error_message`        | TEXT    | Optional failure reason                           |
| `created_at`           | TEXT    | SQLite datetime                                   |

Constraints: checked platform and checked status values.

Indexes: `idx_comment_attempts_thread_id`, `idx_comment_attempts_status`, `idx_comment_attempts_created_at`, `idx_comment_attempts_idempotency_key`, and partial unique `idx_comment_attempts_unique_idempotency_key` for non-empty keys.

### `post_metrics`

Stores manual LinkedIn metric snapshots and opt-in LinkedIn social metadata snapshots for published approvals.

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
| `collection_source`  | TEXT    | `manual` or `linkedin_social_metadata`, default `manual`              |
| `raw_payload_json`   | TEXT    | Raw LinkedIn social metadata payload for API snapshots                |
| `created_at`         | TEXT    | SQLite datetime                                                       |
| `updated_at`         | TEXT    | SQLite datetime                                                       |

Indexes: `idx_post_metrics_campaign_id`, `idx_post_metrics_approval_id`, `idx_post_metrics_publish_attempt_id`, `idx_post_metrics_measured_at`, `idx_post_metrics_collection_source`.

### `metric_refresh_settings`

Stores one local settings row for opt-in LinkedIn metric refresh.

| Column                   | Type    | Notes                                     |
| ------------------------ | ------- | ----------------------------------------- |
| `id`                     | INTEGER | Primary key constrained to `1`            |
| `enabled`                | INTEGER | Boolean-like flag, default `0`            |
| `poll_interval_minutes`  | INTEGER | Worker poll interval, `15` through `1440` |
| `max_jobs_per_tick`      | INTEGER | Bounded work per tick, `1` through `20`   |
| `refresh_interval_hours` | INTEGER | Successful refresh cadence, `1` to `168`  |
| `retry_backoff_minutes`  | INTEGER | Retry backoff, `5` through `1440`         |
| `updated_at`             | TEXT    | SQLite datetime                           |

### `metric_refresh_jobs`

Stores durable per-approval LinkedIn social metadata refresh jobs.

| Column               | Type    | Notes                                                |
| -------------------- | ------- | ---------------------------------------------------- |
| `id`                 | INTEGER | Primary key                                          |
| `campaign_id`        | INTEGER | References `campaigns(id)` cascade delete            |
| `approval_id`        | INTEGER | References `approvals(id)` cascade delete; unique    |
| `publish_attempt_id` | INTEGER | Nullable, references `publish_attempts(id)` set null |
| `platform`           | TEXT    | Defaults to `linkedin`, constrained to `linkedin`    |
| `target_urn`         | TEXT    | LinkedIn share/UGC/activity URN for social metadata  |
| `status`             | TEXT    | `active`, `paused`, `unavailable`, or `failed`       |
| `next_refresh_at`    | TEXT    | Next due timestamp                                   |
| `last_refreshed_at`  | TEXT    | Nullable successful refresh timestamp                |
| `last_attempted_at`  | TEXT    | Nullable latest attempt timestamp                    |
| `attempt_count`      | INTEGER | Total attempts                                       |
| `max_attempts`       | INTEGER | Terminal failure threshold                           |
| `failure_count`      | INTEGER | Failure counter                                      |
| `last_error`         | TEXT    | Last safe operator-facing error                      |
| `locked_at`          | TEXT    | Nullable worker lock timestamp                       |
| `locked_by`          | TEXT    | Nullable worker runner id                            |
| `created_at`         | TEXT    | SQLite datetime                                      |
| `updated_at`         | TEXT    | SQLite datetime                                      |

Indexes: `idx_metric_refresh_jobs_campaign_id`, `idx_metric_refresh_jobs_status_next_refresh`, `idx_metric_refresh_jobs_lock`, `idx_metric_refresh_jobs_approval_id`.

### `metric_refresh_events`

Stores local metric refresh worker/job history.

| Column                  | Type    | Notes                                                                                                                                                                                                  |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                    | INTEGER | Primary key                                                                                                                                                                                            |
| `campaign_id`           | INTEGER | Nullable, references `campaigns(id)` set null                                                                                                                                                          |
| `approval_id`           | INTEGER | Nullable, references `approvals(id)` set null                                                                                                                                                          |
| `metric_refresh_job_id` | INTEGER | Nullable, references `metric_refresh_jobs(id)` set null                                                                                                                                                |
| `post_metric_id`        | INTEGER | Nullable, references `post_metrics(id)` set null                                                                                                                                                       |
| `event_type`            | TEXT    | `refresh_started`, `refresh_completed`, `refresh_retry_scheduled`, `refresh_unavailable`, `refresh_failed`, `refresh_blocked`, `worker_started`, `worker_stopped`, `tick_started`, or `tick_completed` |
| `severity`              | TEXT    | `info`, `warning`, or `error`                                                                                                                                                                          |
| `summary`               | TEXT    | Required event summary                                                                                                                                                                                 |
| `metadata_json`         | TEXT    | JSON metadata string                                                                                                                                                                                   |
| `created_at`            | TEXT    | SQLite datetime                                                                                                                                                                                        |

Indexes: `idx_metric_refresh_events_campaign_id`, `idx_metric_refresh_events_job_id`, `idx_metric_refresh_events_created_at`.

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

### `agent_runs`

Stores one local agent execution attempt for one campaign, optionally tied to a workflow run or step.

| Column             | Type    | Notes                                                                                                                                                                                                           |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | INTEGER | Primary key                                                                                                                                                                                                     |
| `campaign_id`      | INTEGER | References `campaigns(id)` cascade delete                                                                                                                                                                       |
| `workflow_run_id`  | INTEGER | Nullable, references `workflow_runs(id)` with `ON DELETE SET NULL`                                                                                                                                              |
| `workflow_step_id` | INTEGER | Nullable, references `workflow_steps(id)` with `ON DELETE SET NULL`                                                                                                                                             |
| `agent_role`       | TEXT    | `researcher`, `scorer`, `drafter`, `auditor`, `scheduler`, or `analyst`                                                                                                                                         |
| `provider_key`     | TEXT    | `dry_run`, GG AI provider keys (`anthropic`, `xiaomi`, `openai`, `gemini`, `glm`, `moonshot`, `deepseek`, `openrouter`, `sakana`, `minimax`), or Linkgo-only `custom`; legacy `google` rows migrate to `gemini` |
| `model_name`       | TEXT    | Provider model label                                                                                                                                                                                            |
| `playbook_key`     | TEXT    | Selected built-in playbook key for this run, default empty string for base role instructions                                                                                                                    |
| `status`           | TEXT    | `queued`, `running`, `waiting_approval`, `completed`, `failed`, or `cancelled`                                                                                                                                  |
| `input_summary`    | TEXT    | Compact operator/runtime input                                                                                                                                                                                  |
| `output_summary`   | TEXT    | Compact runtime result                                                                                                                                                                                          |
| `error_message`    | TEXT    | Failure reason, default empty string                                                                                                                                                                            |
| `iteration_count`  | INTEGER | Bounded `0` through `20`                                                                                                                                                                                        |
| `started_at`       | TEXT    | Nullable start timestamp                                                                                                                                                                                        |
| `completed_at`     | TEXT    | Nullable terminal timestamp                                                                                                                                                                                     |
| `created_at`       | TEXT    | SQLite datetime                                                                                                                                                                                                 |
| `updated_at`       | TEXT    | SQLite datetime                                                                                                                                                                                                 |

Indexes: `idx_agent_runs_campaign_id`, `idx_agent_runs_workflow_run_id`, `idx_agent_runs_workflow_step_id`, `idx_agent_runs_status`, `idx_agent_runs_agent_role`, `idx_agent_runs_playbook_key`, `idx_agent_runs_updated_at`.

### `agent_playbook_overrides`

Stores local operator state for built-in playbooks. Built-in prompt text stays in TypeScript code.

| Column                | Type    | Notes                                                                 |
| --------------------- | ------- | --------------------------------------------------------------------- |
| `playbook_key`        | TEXT    | Primary key matching one built-in playbook key                        |
| `enabled`             | INTEGER | Boolean-like runtime visibility flag constrained to `0` or `1`        |
| `custom_instructions` | TEXT    | Optional bounded operator instructions appended to compatible prompts |
| `updated_at`          | TEXT    | SQLite datetime                                                       |

### `agent_tool_calls`

Stores model-requested or dry-run tool calls with validated JSON inputs and outputs.

| Column                  | Type    | Notes                                                                                                  |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `id`                    | INTEGER | Primary key                                                                                            |
| `agent_run_id`          | INTEGER | References `agent_runs(id)` cascade delete                                                             |
| `provider_tool_call_id` | TEXT    | Provider or deterministic dry-run tool-call correlation identifier, default empty string               |
| `tool_name`             | TEXT    | `research_posts`, `score_relevance`, `draft_post`, `audit_post`, `schedule_post`, or `collect_metrics` |
| `status`                | TEXT    | `requested`, `running`, `waiting_approval`, `completed`, `failed`, or `rejected`                       |
| `requires_approval`     | INTEGER | Boolean-like flag constrained to `0` or `1`                                                            |
| `input_json`            | TEXT    | Validated tool input JSON                                                                              |
| `output_json`           | TEXT    | Validated tool output JSON when completed                                                              |
| `error_message`         | TEXT    | Failure reason, default empty string                                                                   |
| `started_at`            | TEXT    | Nullable start timestamp                                                                               |
| `completed_at`          | TEXT    | Nullable terminal timestamp                                                                            |
| `created_at`            | TEXT    | SQLite datetime                                                                                        |

Indexes: `idx_agent_tool_calls_run_id`, `idx_agent_tool_calls_tool_name`, `idx_agent_tool_calls_status`.

### `agent_run_events`

Stores append-only runtime progress events.

| Column         | Type    | Notes                                                                                                            |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`           | INTEGER | Primary key                                                                                                      |
| `agent_run_id` | INTEGER | References `agent_runs(id)` cascade delete                                                                       |
| `event_type`   | TEXT    | `run_created`, model events, tool events, `approval_required`, `run_completed`, `run_failed`, or `run_cancelled` |
| `summary`      | TEXT    | Required event summary                                                                                           |
| `created_at`   | TEXT    | SQLite datetime                                                                                                  |

Indexes: `idx_agent_run_events_run_id`, `idx_agent_run_events_event_type`, `idx_agent_run_events_created_at`.

### `agent_run_approval_checkpoints`

Stores the single active, provider-neutral approval continuation for an agent run. The row is created atomically with the waiting run and pending tool call, survives app restart, and is removed when the run completes, is rejected/cancelled, or reaches a terminal failure.

| Column                 | Type    | Notes                                                                                      |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `agent_run_id`         | INTEGER | Primary key; references `agent_runs(id)` with `ON DELETE CASCADE`                          |
| `pending_tool_call_id` | INTEGER | Unique; references the interrupted `agent_tool_calls(id)` with `ON DELETE CASCADE`         |
| `approval_id`          | INTEGER | References the authoritative `approvals(id)` with `ON DELETE CASCADE`                      |
| `phase`                | TEXT    | `waiting_approval` before tool completion or `continuation_ready` after durable completion |
| `messages_json`        | TEXT    | Valid provider-neutral conversation JSON, including the pending assistant tool call        |
| `iteration_count`      | INTEGER | Total provider turns already used, constrained to `0` through `20`                         |
| `created_at`           | TEXT    | SQLite datetime                                                                            |
| `updated_at`           | TEXT    | SQLite datetime                                                                            |

Indexes: `idx_agent_run_approval_checkpoints_approval_id`, `idx_agent_run_approval_checkpoints_phase`. Migration 21 fails legacy waiting runs closed because pre-checkpoint conversations cannot be reconstructed exactly.

### `safety_settings`

Stores singleton app-level safety gates.

| Column               | Type    | Notes                                                 |
| -------------------- | ------- | ----------------------------------------------------- |
| `id`                 | INTEGER | Primary key constrained to `1`                        |
| `global_kill_switch` | INTEGER | Boolean-like emergency stop constrained to `0` or `1` |
| `kill_switch_reason` | TEXT    | Operator-facing reason, default empty string          |
| `updated_at`         | TEXT    | SQLite datetime                                       |

The migration seeds `id = 1` with `INSERT OR IGNORE`.

### `safety_audit_events`

Stores append-only operator/system safety history.

| Column          | Type    | Notes                                                                                                                            |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | INTEGER | Primary key                                                                                                                      |
| `campaign_id`   | INTEGER | Nullable, references `campaigns(id)` with `ON DELETE SET NULL`                                                                   |
| `subject_type`  | TEXT    | `campaign`, `approval`, `schedule_job`, `publish_attempt`, `agent_run`, `workflow_run`, `error_queue_item`, or `safety_settings` |
| `subject_id`    | INTEGER | Nullable subject identifier                                                                                                      |
| `event_type`    | TEXT    | Kill switch, schedule, publish, approval, agent-run, or error-item lifecycle event                                               |
| `severity`      | TEXT    | `info`, `warning`, or `block`                                                                                                    |
| `summary`       | TEXT    | Required operator-facing event summary                                                                                           |
| `metadata_json` | TEXT    | JSON detail string, default `{}`                                                                                                 |
| `created_at`    | TEXT    | SQLite datetime                                                                                                                  |

Indexes: `idx_safety_audit_events_campaign_id`, `idx_safety_audit_events_subject`, `idx_safety_audit_events_event_type`, `idx_safety_audit_events_severity`, `idx_safety_audit_events_created_at`.

### `rate_limit_events`

Stores append-only allowed/blocked rate-limit decisions.

| Column          | Type    | Notes                                                      |
| --------------- | ------- | ---------------------------------------------------------- |
| `id`            | INTEGER | Primary key                                                |
| `campaign_id`   | INTEGER | References `campaigns(id)` cascade delete                  |
| `action`        | TEXT    | `schedule_post`, `publish_post`, `comment`, or `agent_run` |
| `window_key`    | TEXT    | Local window key such as `YYYY-MM-DD`                      |
| `limit_value`   | INTEGER | Non-negative configured cap                                |
| `current_count` | INTEGER | Non-negative count at decision time                        |
| `decision`      | TEXT    | `allowed` or `blocked`                                     |
| `summary`       | TEXT    | Required operator-facing decision summary                  |
| `created_at`    | TEXT    | SQLite datetime                                            |

Indexes: `idx_rate_limit_events_campaign_id`, `idx_rate_limit_events_action`, `idx_rate_limit_events_window_key`, `idx_rate_limit_events_decision`, `idx_rate_limit_events_created_at`.

### `error_queue_items`

Stores fixable operational failures for operator follow-up.

| Column             | Type    | Notes                                                                                   |
| ------------------ | ------- | --------------------------------------------------------------------------------------- |
| `id`               | INTEGER | Primary key                                                                             |
| `campaign_id`      | INTEGER | Nullable, references `campaigns(id)` with `ON DELETE SET NULL`                          |
| `source_type`      | TEXT    | `approval`, `publish_attempt`, `schedule_job`, `agent_run`, `workflow_run`, or `manual` |
| `source_id`        | INTEGER | Nullable source identifier                                                              |
| `title`            | TEXT    | Required short title                                                                    |
| `detail`           | TEXT    | Optional detail, default empty string                                                   |
| `severity`         | TEXT    | `warning`, `error`, or `critical`                                                       |
| `status`           | TEXT    | `open`, `in_progress`, `awaiting_review`, `resolved`, or `failed`                       |
| `resolution_notes` | TEXT    | Optional operator notes, default empty string                                           |
| `created_at`       | TEXT    | SQLite datetime                                                                         |
| `updated_at`       | TEXT    | SQLite datetime                                                                         |

Indexes: `idx_error_queue_items_campaign_id`, `idx_error_queue_items_source`, `idx_error_queue_items_status`, `idx_error_queue_items_severity`, `idx_error_queue_items_updated_at`, and partial unique `idx_error_queue_items_active_source` on active `(source_type, source_id)` rows.

### `connected_accounts`

Stores non-secret provider connection status for GG AI providers, Linkgo-only `custom`, and `linkedin`.

`provider_key` accepts `anthropic`, `xiaomi`, `openai`, `gemini`, `glm`, `moonshot`, `deepseek`, `openrouter`, `sakana`, `minimax`, `custom`, or `linkedin`. Legacy `google` rows migrate to `gemini`.

Secrets are not stored in this table.

### `credential_events`

Stores append-only non-secret auth event summaries for the same provider key catalog as `connected_accounts`.

## Reserved future tables

Future slices will add their own migrations for additional external automation tables.
