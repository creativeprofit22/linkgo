# Roadmap Mapping

This document maps `roadmap.md` to implementation slices.

## Implemented slices

### Campaigns slice

Roadmap coverage:

- Section 3: Campaign + autopilot queue.
- Section 4 foundation: manual keywords, with generated and learned sources reserved.
- Section 16 foundation: conservative post/comment limits stored per campaign.

Implemented now:

- Campaign tables and keyword table.
- Campaign CRUD/listing data access.
- Campaign hook and UI.
- Autopilot intent flag only.

Automation is not implemented in this slice.

### Candidate queue slice

Roadmap coverage:

- Section 3: manual candidate post intake for existing campaigns.
- Section 4: source keyword capture for future discovery loops.
- Section 5: relevance score and rationale storage for triage.

Implemented now:

- Target post, candidate post, and dedupe key tables.
- Manual LinkedIn post add flow.
- Per-campaign duplicate prevention by normalized URL and content hash.
- Queue cards grouped by triage status.
- Status updates for `new`, `shortlisted`, `rejected`, and `drafted`.

Scraping, AI scoring, commenting, and publishing are not implemented in this slice.

### Drafting + audit slice

Roadmap coverage:

- Section 6: draft generation foundation via manual variants.
- Section 7: deterministic audit checks for draft safety.
- Section 8: rewrite-loop foundation via edit-and-re-audit, without AI loops.

Implemented now:

- Draft, draft variant, and draft audit tables.
- Manual one-to-five variant creation for non-rejected candidates.
- Deterministic audit findings for required text, length, links, hashtags, hook strength, and specificity.
- Variant edit-and-re-audit flow.
- Variant status actions for selected, rejected, and draft reset.
- Drafts tab with campaign filtering, summary cards, draft cards, and archive action.

AI draft generation and AI audit/rewrite loops are not implemented in this slice.

### Approvals + scheduler slice

Roadmap coverage:

- Section 10: human approval records for selected clean draft variants.
- Section 12: local schedule job records behind approval status.
- Section 14 foundation: manual publish-attempt history.

Implemented now:

- Approval records for selected clean draft variants.
- Local schedule job records behind approval status.
- Manual publish-attempt history.
- LinkedIn LittleText escaped preview for API-safe commentary review.

LinkedIn API publishing, OAuth/provider integration, and background scheduler execution are not implemented in this slice.

### Metrics + learning slice

Roadmap coverage:

- Section 15: manual post metrics and campaign memory foundation.

Implemented now:

- Manual metric snapshots for published approvals.
- Campaign memory notes approved by a human operator.
- Append-only learning events for metric and memory actions.
- Metrics tab with campaign filtering, summaries, metric cards, memory cards, and event stream.

LinkedIn API collection, automatic refresh, AI learning loops, and background metric jobs are not implemented in this slice.

### Durable workflow engine slice

Roadmap coverage:

- Section 11: durable workflow engine with typed resumable pipeline steps.
- Section 19: persistent task backlog foundation through resumable runs and progress events.

Implemented now:

- Workflow run, step, event, and step-execution tables.
- Manual content pipeline state machine: `research -> score -> draft -> audit -> approve -> schedule -> measure`.
- Foreground executor controls that launch linked role-specific agent runs and stop at approvals.
- Workflows tab with campaign filtering, summary cards, step controls, and event history.
- Archived-campaign mutation blocking.

Background jobs, automatic scheduler execution, LinkedIn publishing, and generic workflow building are not implemented in this slice.

### Agent runtime + tool schemas slice

Roadmap coverage:

- Section 1: local model/tool loop contracts.
- Section 2: streaming/provider layer foundation.
- Section 17: role-based multi-agent worker foundation.
- Section 18: typed skill/playbook slots through tool metadata.

Implemented now:

- Agent run, tool call, and runtime event tables.
- Six Zod tool contracts: `research_posts`, `score_relevance`, `draft_post`, `audit_post`, `schedule_post`, and `collect_metrics`.
- Provider-independent runtime interfaces, GG AI adapter, and deterministic `dry_run` provider.
- Provider-aware Agent Runtime tab with contract visibility and local run history.
- Approval-gated `schedule_post` dry-run behavior.
- Archived-campaign mutation blocking.

LinkedIn scraping, publishing, comments, and background workers are not implemented in this slice.

### Safety + observability slice

Roadmap coverage:

- Section 16: conservative daily scheduling caps and emergency stop controls.
- Section 20: local observability through audit history, rate-limit events, and an operator error queue.

Implemented now:

- Global app-level kill switch for local schedule starts and agent dry-run starts.
- Daily post scheduling cap enforcement using each campaign's `daily_post_limit`.
- Append-only safety audit events and rate-limit decisions.
- Error queue items for failed publish attempts, rejected approvals, and failed agent runs.
- Safety tab with summaries, campaign filtering, kill switch controls, event history, and status transitions.

Real publishing, background execution, and external telemetry are not implemented in this slice.

### Comment/reply agent slice

Roadmap coverage:

- Section 13: comment/reply agent.
- Section 16 foundation: conservative daily comment-limit enforcement using `campaigns.daily_comment_limit` and `rate_limit_events.action = 'comment'`.

Implemented now:

- Local comment threads for eligible shortlisted or drafted candidate posts.
- One-to-three manual reply variants with deterministic audit findings.
- Human review statuses before a comment can be manually marked posted.
- Manual posted/failed attempt history.
- Failed manual attempts create error queue items with `source_type = 'manual'`.
- Global kill switch and daily comment caps block successful posting records.
- Comments tab with campaign filtering, summaries, variant preview, audit display, review actions, and attempt dialogs.

LinkedIn API commenting, scraping, background workers, and automated comment posting are not implemented in this slice.

### Integrations + provider auth foundation

Roadmap coverage:

- Section 1: provider connection foundation.
- Section 2: streaming provider layer connection status.
- Section 10: OAuth foundation for approval-gated external actions.
- Section 16: credential-health visibility before external actions.
- Sections 17 and 18: provider-ready role agents and typed tools.

Implemented now:

- OpenAI, Anthropic, Gemini, custom API, and LinkedIn provider catalog.
- Native Tauri credential storage boundary for API keys and OAuth credentials.
- LinkedIn OAuth start, manual code submission, state validation, token exchange path, refresh path, logout, and status checks.
- Integrations tab with provider cards and no secret rendering.

Autonomous LinkedIn posting/commenting, scraping, arbitrary browser automation, and external telemetry are not implemented.

## Future slices

Future slices will add external integrations and automation only behind explicit approval gates.
