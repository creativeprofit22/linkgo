# Agent Runtime

## Purpose

The Agent Runtime slice (shown as **AI assistant**) runs typed model/tool loops through either the deterministic `dry_run` provider (shown as **Practice mode (no AI used)**) or connected native provider adapters.

It makes the automation layer visible and testable: typed tool contracts, provider-independent loop types, native provider response mapping, durable run history, tool-call history, approval interrupts, retries, and runtime events.

## Implemented

- `src/agent/index.ts` public contract boundary for runtime types, schemas, tool metadata, provider interfaces, loop logic, and provider catalogs.
- Six Zod tool contracts:
  - `research_posts`
  - `score_relevance`
  - `draft_post`
  - `audit_post`
  - `schedule_post`
  - `collect_metrics`
- Dry-run provider that emits deterministic model chunks and provider-style tool-call correlation IDs.
- Native Tauri runtime adapter for Anthropic-compatible (Anthropic, MiniMax), Gemini Code Assist, OpenAI-compatible (Xiaomi, OpenAI, Z.AI/GLM, Moonshot, DeepSeek, OpenRouter, Sakana), plus Linkgo-only custom OpenAI-compatible endpoints.
- Native provider adapters own provider payload construction, Linkgo tool definitions, and provider tool-call mapping inside the Tauri boundary.
- Runtime loop that validates tool inputs and outputs with Zod, supports cancellation checks, retry classification, iteration caps, and tool execution context for local side effects.
- Provider-backed execution using explicitly connected credentials and native HTTP requests inside the Tauri boundary for the operator-triggered run.
- `research_posts` can persist local discovery suggestions, and `score_relevance` can apply validated relevance scores to existing campaign candidates.
- Durable approval interrupt for `schedule_post`, linked to the authoritative approval and an exact provider-neutral conversation checkpoint.
- Explicit **Continue approved task** and restart-safe **Pick up where it stopped** controls in AI assistant.
- Agent run, tool call, runtime event, and active approval checkpoint tables.
- Selected playbook (the dialog's **Brand voice guide** field) persistence on `agent_runs.playbook_key`.
- Bounded structured `agent_runs.input_context_json` persistence and one clearly labeled JSON context block in the user message.
- AI assistant tab with campaign filtering, summary cards, tool contracts, compatible playbook selection, run cards, tool payloads, and event history.
- Archived-campaign mutation blocking in UI and data API.

## Intentionally not implemented

- Autonomous LinkedIn publishing/commenting.
- LinkedIn scraping.
- Background workers, cron, or scheduler (shown as **Auto-posting**) execution.
- Automated metrics collection.
- Generic arbitrary workflow builder.

## Runtime lifecycle

1. Create a dry-run or connected provider-backed agent run (on screen: **New assistant task**) for a non-archived campaign.
2. Select an enabled playbook compatible with the agent role, or run with base role instructions.
3. Start the run; the global kill switch (on screen: **Emergency pause**) is checked first.
4. For provider-backed runs, native code loads the stored API key/base URL only for that explicit start; neither is sent to the renderer. The Base URL is re-validated against the destination policy (HTTPS by default, local/private endpoints only with stored consent) before the request, and the hardened transport never follows redirects and bounds the response (8 MiB, error text 500 characters). See [integrations](integrations.md#provider-destinations-and-local-provider-consent).
5. The run is claimed by the native `linkgo_agent_run_start` command (status, checkpoint and kill-switch checks plus the claim and its safety audit in one transaction), then the model stream executes outside any transaction. Planner-linked scorer runs use restricted native claim/start/result commands so each scorer mutation stays on one SQLx connection.

All agent-run writes are native (`src-tauri/src/agent_run_store.rs`), each on one pinned `BEGIN IMMEDIATE` connection: `linkgo_agent_run_create` (campaign, workflow ownership and playbook default/override/compatibility), `_start`, `_record_event` (appends a progress event to an existing run; the event type must be a known agent-run event and the summary non-empty and at most 1000 characters), `_persist_result` (tool calls, approval checkpoint, run status, workflow projection, failure audit and error-queue item together), `_fail_after_persistence_error` and `_cancel`. The renderer still checks each tool's Zod input/output contract before persisting; native checks structure, size, the conversation shape and every ownership rule, and returns the resulting checkpoint phase. Real-SQLite tests: `src-tauri/src/agent_run_store_tests.rs`. Reads are native too (`src-tauri/src/workflow_store.rs`): `linkgo_agent_run_list` returns up to 200 runs with tool calls, the newest 100 events per run and approval checkpoints from one transaction, and `linkgo_agent_run_validation` returns the single run row checked before any provider call. The renderer has no SQL access. 6. Prompt assembly layers compatible playbook instructions and custom override text before locked safety lines. 7. The loop validates each role-appropriate tool request. A provider turn containing `schedule_post` must contain exactly that one tool call; mixed approval/non-approval turns fail before any tool executes. 8. Non-approval tools execute locally and persist completed tool calls. 9. `schedule_post` stops at `waiting_approval`; the pending tool call, linked approval ID, normalized conversation, and total provider-turn count are persisted atomically. Conversation validation requires every tool result ID and tool name to match one preceding assistant tool call. 10. Approving in the Approvals tab changes approval state only. It does not call the provider, create a schedule, or publish. 11. The operator selects **Continue approved task** in AI assistant. Linkgo rechecks the exact approval, campaign, pending tool, campaign state, provider connection, and kill switch. 12. The metadata-only approved tool result is validated and committed before the provider continuation request. It explicitly reports that no schedule or publish action was created. 13. The resumed loop uses the saved conversation, seeds duplicate tool-call protection from durable history, and enforces the original eight-turn budget across both halves. 14. A provider failure after durable tool completion retains a `continuation_ready` checkpoint. **Pick up where it stopped** retries without executing the approved tool again. 15. Completion, cancellation, rejection, a later approval interrupt, or terminal turn-limit failure removes or replaces the active checkpoint as appropriate.

## Safety and approval notes

Secrets stay out of SQLite and rendered UI.

Provider secrets stay inside the native Tauri command boundary during explicit operator-triggered agent runs.

`dry_run` remains executable with no credentials for attended runtime/Ideas contract use. Planner-linked scoring explicitly excludes it and requires a connected provider.

`schedule_post` is approval-gated and metadata-only. Waiting, approval, resume, and recovery do not create `schedule_jobs` or `publish_attempts` and do not call LinkedIn.

Rejection in Approvals atomically rejects the linked pending tool, cancels the run, records cancellation history, and removes the checkpoint without a provider request.

Checkpoints survive app restart. Recovery is bounded to approval interrupts and post-approval continuations; crashes during unrelated non-approval tool execution are not replayed.

Feature lifecycle owners fail linked agents through one shared primitive, `agent_run_store::fail_active_agent`. Inside the owner's transaction, it fails a `queued`/`running`/`waiting_approval` run, removes its approval checkpoint and records one `run_failed` event; terminal runs are left untouched. Draft AI audits and the draft quality loop (on screen: **Improve with AI**) use it. Quality-linked scorer and rewrite-auditor agents can be started only while they are the active agent of a running quality run (`draft_quality::assert_agent_startable`). A stale loop therefore cannot re-claim an agent that quality recovery already settled. See Drafts → Quality-loop recovery.

The AI assistant list mirrors that guard. `linkgo_agent_run_list` returns `quality_start_blocked` (0/1) per run, computed from the same SQL predicate (`draft_quality::quality_start_blocked_sql`) that `assert_agent_startable` uses. The data API maps it to `AgentRunWithDetails.qualityStartBlocked`. A queued or failed run with the flag set shows no start button (**Start practice run** / **Start {provider}**); it shows "This task belongs to draft checks — continue it from Drafts." instead. The frontend cannot infer ownership from `input_context_json`, because a rewrite auditor carries the same `auditRequest` as a standalone audit agent.

Migration 21 fails pre-checkpoint `waiting_approval` runs closed because their exact provider conversation cannot be reconstructed. Operators must restart those failed legacy runs.

Playbooks shape prompts only. Disabling a playbook hides it from new runtime creation while historical runs remain readable.

Archived campaigns keep runtime history visible while create/start/cancel mutations are blocked.

Planner-linked scorer runs retain their exact approved campaign/candidate context for failure and retry audit. Context excludes credentials, OAuth data, planner event metadata, raw source-import audit JSON, and unrelated candidates. Provider adapters remain unchanged because they already receive the assembled message list through the native credential boundary.

## Test coverage

Playwright covers:

- AI assistant tab rendering in the app shell.
- Six tool contracts and approval metadata rendering.
- Dry-run persistence for runs, tool calls, and events.
- Provider-backed renderer execution through mocked native Tauri command results that assert only `providerKey`, `modelName`, and `request` cross the command boundary.
- Native adapter unit coverage for provider payload construction, command-boundary rejection of renderer-supplied provider options, and provider tool-call mapping.
- Playbook selection, default display, provider message injection, and disabled-playbook filtering.
- Durable `schedule_post` waiting state linked to an existing approval.
- Approval-first and approval-second mixed two-call turns failing closed before any tool side effect.
- Approval plus explicit resume with validated tool-result continuation, including rejection of orphan tool-result IDs.
- Rejection cancellation with zero provider continuation calls.
- Reload recovery, double-resume idempotency, and one-time approved tool execution.
- Invalid approval-state/campaign/missing-link rejection with zero schedule, publish-attempt, or LinkedIn writes.
- Archived-campaign mutation blocking in UI and data API.
- Planner scorer context persistence/transmission, connected-provider execution, exact score tool coverage, and failure/retry reconciliation through `tests/workflows.spec.ts`.

Rust migration tests assert agent runtime and approval-checkpoint tables, constraints, foreign keys, indexes, legacy fail-closed upgrade behavior, and provider parity expansion.
