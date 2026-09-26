# Integrations

## Scope

Linkgo has a native credential boundary for its provider catalog, Linkgo-only custom OpenAI-compatible endpoints, and LinkedIn OAuth.

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
- Provider API keys and Base URLs never cross IPC: there is no renderer command that returns them (the former `linkgo_auth_provider_secret` was removed and a Rust test keeps it unregistered). Provider requests run natively.
- The OS keyring is the default store. The plaintext file fallback exists only when `LINKGO_CREDENTIAL_FILE_FALLBACK` is set for development.
- SQLite integration tables intentionally store no secret columns.
- Auth progress is emitted as native events so the UI can stay responsive during OAuth.

## Supported flows

- GG AI providers use API-key/token auth.
- Gemini is labeled as a Gemini Code Assist access token to avoid confusing it with a normal AI Studio key.
- Every API-key provider can save an optional base URL override; GG AI defaults are used when the field is blank.
- Custom providers use OpenAI-compatible endpoints and must include a base URL.

## Provider destinations and local-provider consent

The native destination policy (`src-tauri/src/net/destination.rs`) checks every Base URL when it is saved and again right before each provider request:

- `https://` to a public host is allowed.
- Usernames/passwords in the URL, query strings, fragments, whitespace/control characters, URLs over 2048 characters and non-http(s) schemes are always rejected.
- Loopback (`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`), private, link-local (including `169.254.169.254`), CGNAT, ULA and other non-public IP literals — including IPv4-mapped IPv6 — need explicit consent: the **Allow this local/private endpoint** checkbox in the connect dialog. It appears for such URLs and for any `http://` URL.
- Plain `http://` is allowed only for consented local endpoints; `http://` to a public host is rejected even with consent.
- Consent is stored inside the keyring entry (`allow_local_destination`), not in SQLite, so no migration is needed.

Transport (`src-tauri/src/net/transport.rs`): environment proxies are ignored, redirects are never followed (a redirect response fails the request, so `x-api-key`/`Authorization` headers and bodies cannot be forwarded), connect timeout 10 s, total 120 s, HTTPS-only for non-consented destinations, DNS answers pointing at private networks are dropped for non-consented hosts, responses are capped at 8 MiB (LinkedIn 1 MiB) and provider error text at 500 characters.

**Re-save requirement:** a Base URL saved by an older build that points at a local/private address, or uses `http://`, now fails with an actionable error. The native status re-checks the saved Base URL against the same policy, so such a provider shows **Reauth required** with that error on its Integrations card and is not treated as ready for agent runs. Reconnect the provider and tick the consent checkbox (or switch to `https://`).

Consented local endpoints are trusted by design. See `docs/security/threat-model.md`.

- LinkedIn uses 3-legged OAuth with state validation and manual authorization-code entry after native config is present.
- The OAuth dialog exposes the generated authorization URL and a copy button for manual browser handoff.
- LinkedIn token refresh runs through the native boundary when refresh credentials are available.
- LinkedIn OIDC userinfo backfills connected member id and display label without exposing tokens to React.
- Approved or scheduled posts can be explicitly published through a native LinkedIn API command after an operator confirmation.
- Approved comments can be explicitly posted through LinkedIn's Community Management API after an operator types `Post comment`.

## Explicit exclusions

- No autonomous content generation or ungated LinkedIn posting/commenting.
- No background LinkedIn comment workers, scraping, comment reads, mentions, images, or nested comments.
- No scraping or browser automation.
- No coding tools, shell access, repo scanning, file editing, or MCP code tools.
- No external telemetry.

## Safety notes

Connected AI provider credentials can execute agent runs only after the operator presses start.

LinkedIn publishing is approval-gated. Operators can publish from approval cards, and the native scheduler can publish only already-approved scheduled posts while Linkgo is running or hidden to tray.

LinkedIn comment posting is approval-gated and requires Community Management API product access plus `w_member_social_feed`; existing OAuth connections may need reconnecting after the scope is approved.

Dry-run agent runs remain available without credentials.
