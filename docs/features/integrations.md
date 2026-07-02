# Integrations

## Scope

Linkgo has a native credential boundary for the installed `@kenkaiiii/gg-ai` provider catalog, Linkgo-only custom OpenAI-compatible endpoints, and LinkedIn OAuth.

GG AI providers exposed in Linkgo:

- Anthropic
- Xiaomi (MiMo)
- OpenAI
- Gemini
- Z.AI (GLM)
- Moonshot
- DeepSeek
- OpenRouter
- Sakana
- MiniMax

## Credential boundary

- The React UI only receives provider status, labels, scopes, expiry metadata, and redacted errors during normal browsing.
- API keys, access tokens, refresh tokens, and LinkedIn client secrets stay out of SQLite and rendered UI.
- Provider API keys are returned to the webview only for an explicit operator-triggered agent run.
- SQLite integration tables intentionally store no secret columns.
- Auth progress is emitted as native events so the UI can stay responsive during OAuth.

## Supported flows

- GG AI providers use API-key/token auth.
- Gemini is labeled as a Gemini Code Assist access token to avoid confusing it with a normal AI Studio key.
- Every API-key provider can save an optional base URL override; GG AI defaults are used when the field is blank.
- Custom providers use OpenAI-compatible endpoints and should include a base URL.
- LinkedIn uses 3-legged OAuth with state validation and manual authorization-code entry after native config is present.
- The OAuth dialog exposes the generated authorization URL and a copy button for manual browser handoff.
- LinkedIn token refresh runs through the native boundary when refresh credentials are available.
- LinkedIn OIDC userinfo backfills connected member id and display label without exposing tokens to React.
- Approved or scheduled posts can be explicitly published through a native LinkedIn API command after an operator confirmation.

## Explicit exclusions

- No autonomous content generation or ungated LinkedIn posting/commenting.
- No LinkedIn API comment posting until endpoint and product access requirements are verified.
- No scraping or browser automation.
- No coding tools, shell access, repo scanning, file editing, or MCP code tools.
- No external telemetry.

## Safety notes

Connected AI provider credentials can execute agent runs only after the operator presses start.

LinkedIn publishing is approval-gated. Operators can publish from approval cards, and the native scheduler can publish only already-approved scheduled posts while Linkgo is running or hidden to tray.

Dry-run agent runs remain available without credentials.
