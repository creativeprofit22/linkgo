# Agent Runtime

## Purpose

The Agent Runtime slice adds a provider-capable foundation for model/tool loops while keeping dry-run available without credentials.

It makes the automation layer visible and testable: typed tool contracts, provider-independent loop types, a deterministic dry-run provider, GG AI stream mapping, durable run history, tool-call history, approval interrupts, retries, and runtime events.

## Implemented

- `src/agent/index.ts` public contract boundary for runtime types, schemas, tool metadata, provider interfaces, loop logic, and dry-run provider.
- Six Zod tool contracts:
  - `research_posts`
  - `score_relevance`
  - `draft_post`
  - `audit_post`
  - `schedule_post`
  - `collect_metrics`
- Dry-run provider that emits deterministic model chunks and provider-style tool-call correlation IDs.
- GG AI adapter for OpenAI, Anthropic, Gemini, and custom OpenAI-compatible providers.
- Runtime loop that validates tool inputs and outputs with Zod, supports cancellation checks, retry classification, and iteration caps.
- Approval interrupt for `schedule_post`.
- Agent run, tool call, and runtime event tables.
- Agent Runtime tab with campaign filtering, summary cards, tool contracts, run cards, tool payloads, and event history.
- Archived-campaign mutation blocking in UI and data API.

## Intentionally not implemented

- Autonomous LinkedIn publishing/commenting.
- LinkedIn scraping.
- Frontend secret access.
- LinkedIn scraping.
- LinkedIn publishing.
- Comment automation.
- Background workers, cron, or scheduler execution.
- Automated metrics collection.
- Generic arbitrary workflow builder.

## Data model

### `agent_runs`

Stores one local runtime attempt for one campaign. Runs can optionally link to an existing workflow run or workflow step.

### `agent_tool_calls`

Stores each requested tool with a provider/dry-run tool-call correlation ID plus JSON input/output payloads. Inputs and completed outputs are validated against the tool contract before insertion and after selection.

### `agent_run_events`

Stores append-only runtime progress events such as model start, streamed text, tool request, tool completion, approval requirement, run completion, failure, and cancellation.

## Runtime lifecycle

1. Create a dry-run agent run for a non-archived campaign.
2. Start the run.
3. The dry-run provider emits a model-start/progress stream.
4. The loop validates a role-appropriate tool request.
5. Non-approval tools execute locally and persist completed tool calls.
6. `schedule_post` stops at `waiting_approval` and persists an approval-required tool call.
7. The run stores output, error, status, iteration count, and append-only runtime events.

## Safety and approval notes

The runtime is local-first and deterministic in this slice.

Disconnected non-dry providers are blocked before start.

`dry_run` remains executable with no credentials.

`schedule_post` is approval-gated and does not create schedule jobs, publish content, or call LinkedIn.

Archived campaigns keep runtime history visible while create/start/cancel mutations are blocked.

## Test coverage

Playwright covers:

- Agent Runtime tab rendering in the app shell.
- Six tool contracts and approval metadata rendering.
- Dry-run persistence for runs, tool calls, and events.
- `schedule_post` waiting-approval behavior without publishing or scheduling.
- Archived-campaign mutation blocking in UI and data API.

Rust migration tests assert agent runtime tables, constraints, foreign keys, and indexes.
