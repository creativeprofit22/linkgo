# Agent Runtime

## Purpose

The Agent Runtime slice runs typed model/tool loops through either the deterministic `dry_run` provider or connected GG AI providers.

It makes the automation layer visible and testable: typed tool contracts, provider-independent loop types, GG AI stream mapping, durable run history, tool-call history, approval interrupts, retries, and runtime events.

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
- GG AI adapter for Anthropic, Xiaomi, OpenAI, Gemini, Z.AI/GLM, Moonshot, DeepSeek, OpenRouter, Sakana, MiniMax, plus Linkgo-only custom OpenAI-compatible endpoints.
- Runtime loop that validates tool inputs and outputs with Zod, supports cancellation checks, retry classification, and iteration caps.
- Provider-backed execution using explicitly connected credentials fetched for the operator-triggered run.
- Approval interrupt for `schedule_post`.
- Agent run, tool call, and runtime event tables.
- Selected playbook persistence on `agent_runs.playbook_key`.
- Agent Runtime tab with campaign filtering, summary cards, tool contracts, compatible playbook selection, run cards, tool payloads, and event history.
- Archived-campaign mutation blocking in UI and data API.

## Intentionally not implemented

- Autonomous LinkedIn publishing/commenting.
- LinkedIn scraping.
- Background workers, cron, or scheduler execution.
- Automated metrics collection.
- Generic arbitrary workflow builder.

## Runtime lifecycle

1. Create a dry-run or connected provider-backed agent run for a non-archived campaign.
2. Select an enabled playbook compatible with the agent role, or run with base role instructions.
3. Start the run; the global kill switch is checked first.
4. For provider-backed runs, Linkgo fetches the stored API key/base URL only for that explicit start.
5. The run is claimed in a short SQLite transaction, then the model stream executes outside that transaction.
6. Prompt assembly layers compatible playbook instructions and custom override text before locked safety lines.
7. The loop validates each role-appropriate tool request.
8. Non-approval tools execute locally and persist completed tool calls.
9. `schedule_post` stops at `waiting_approval` and persists an approval-required tool call.
10. Final status, output, errors, iteration count, tool calls, and events are persisted in a final transaction.

## Safety and approval notes

Secrets stay out of SQLite and rendered UI.

Provider secrets enter the Tauri webview process only during an explicit operator-triggered agent run.

`dry_run` remains executable with no credentials.

`schedule_post` is approval-gated and does not create schedule jobs, publish content, or call LinkedIn.

Playbooks shape prompts only. Disabling a playbook hides it from new runtime creation while historical runs remain readable.

Archived campaigns keep runtime history visible while create/start/cancel mutations are blocked.

## Test coverage

Playwright covers:

- Agent Runtime tab rendering in the app shell.
- Six tool contracts and approval metadata rendering.
- Dry-run persistence for runs, tool calls, and events.
- Provider-backed execution through a mocked GG AI stream.
- Playbook selection, default display, provider message injection, and disabled-playbook filtering.
- `schedule_post` waiting-approval behavior without publishing or scheduling.
- Archived-campaign mutation blocking in UI and data API.

Rust migration tests assert agent runtime tables, constraints, foreign keys, indexes, and provider parity expansion.
