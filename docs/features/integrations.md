# Integrations

## Scope

Linkgo now has a native credential boundary for OpenAI, Anthropic, Gemini, custom OpenAI-compatible providers, and LinkedIn OAuth.

## Credential boundary

- The React UI only receives provider status, labels, scopes, expiry metadata, and redacted errors.
- API keys, access tokens, refresh tokens, and LinkedIn client secrets stay behind Tauri commands.
- SQLite integration tables intentionally store no secret columns.
- Auth progress is emitted as native events so the UI can stay responsive during OAuth.

## Supported flows

- AI providers use API-key auth.
- Custom providers can include a base URL for OpenAI-compatible endpoints.
- LinkedIn uses 3-legged OAuth with state validation and a manual authorization-code fallback.
- LinkedIn token refresh runs through the native boundary when refresh credentials are available.

## Explicit exclusions

- No autonomous LinkedIn posting or commenting.
- No scraping or browser automation.
- No coding tools, shell access, repo scanning, file editing, or MCP code tools.
- No external telemetry.

## Safety notes

Disconnected AI providers cannot start non-dry agent runs.

Dry-run agent runs remain available without credentials.
