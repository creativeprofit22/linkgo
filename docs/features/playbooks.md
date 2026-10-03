# Playbooks

## Purpose

Playbooks (shown as writing guides in the **Brand voice** section) are reusable LinkedIn prompt modules for Linkgo's local-first agent runtime (shown as **AI assistant**) and operator workflows.

They keep writer, humanizer, calendar, commenter, and analyst guidance modular instead of expanding one giant system prompt.

## Built-ins

- `linkedin_writer`: drafter-compatible prompt guidance for `draft_post`.
- `linkedin_humanizer`: auditor-compatible prompt guidance for `audit_post`.
- `content_calendar`: scheduler-compatible prompt guidance for `schedule_post`.
- `linkedin_commenter`: operator guidance only; it is not connected to autonomous commenting tools.
- `campaign_analyst`: analyst-compatible prompt guidance for `collect_metrics`.

## Runtime behavior

Runtime-enabled playbooks can be selected when creating an agent run if they are compatible with the chosen role and enabled in the Brand voice tab.

The selected key is stored on `agent_runs.playbook_key`.

Playbook overrides live in `agent_playbook_overrides` and store only local operator state:

- `enabled`
- `custom_instructions`
- `updated_at`

Built-in prompt content remains versioned in `src/agent/playbooks.ts`.

Override storage is owned natively in `src-tauri/src/playbooks.rs`: `linkgo_playbook_override_list` (bounded to one row per known playbook) and `linkgo_playbook_override_upsert` (rejects unknown fields and keys, trims instructions and caps them at 2000 UTF-16 units, writes in one transaction). The renderer has no direct SQL access to this table.

## Safety boundaries

Playbooks shape prompts and operator guidance only.

They do not add scraping, autonomous publishing, autonomous commenting, browser automation, external telemetry, or future automation tables.

Prompt assembly keeps locked safety lines after custom instructions:

- Use only registered Linkgo tools.
- Keep LinkedIn publishing, commenting, and scheduling approval-gated.
- Never request shell, browser automation, file editing, repository scanning, or coding tools.

## UI

The Brand voice tab shows all five built-ins as cards with role, tool, **On**/**Off**, and guidance-only (**Tips only**) badges.

Runtime playbooks can be enabled or disabled and can store bounded custom runtime instructions.

`#/playbooks?focus=<playbook key>` scrolls to that guide and puts the cursor in "Your own instructions" when the guide has that field. Guidance-only guides (such as `linkedin_commenter`) have no such field, so the link scrolls to the guide and focuses its heading, which screen readers announce. The first-run checklist ([setup](setup.md)) uses `focus=linkedin_writer` for "Describe how you write", and counts the step done once the Writer guide has non-empty instructions.

The LinkedIn Commenter card is visible as guidance-only and intentionally exposes no autonomous posting or commenting action.

## Test coverage

Playwright covers:

- Rendering the Brand voice tab and five built-ins.
- Editing custom instructions and persisting an override row.
- Disabling a runtime playbook and marking it disabled.
- Keeping the commenter playbook guidance-only with no autonomous posting action.
- Runtime playbook selection, provider prompt injection, and disabled-playbook filtering from the AI assistant **New assistant task** dialog.

Rust `playbooks::tests` cover input validation, upsert/update ordering, rollback on injected storage failure, and concurrent upserts leaving one consistent row.

Rust migration tests cover `agent_runs.playbook_key`, `agent_playbook_overrides`, the playbook index, and the boolean-like `enabled` constraint.
