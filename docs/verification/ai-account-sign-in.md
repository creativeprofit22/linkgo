# Verification: OpenAI and Anthropic account sign-in

Date: 2026-09-27. Windows 10 Pro 22H2 x64, Rust 1.97.1, Bun 1.4.2. Uncommitted
working tree on top of HEAD `e612d3e`. Labels: **RUNTIME** (observed by running
it), **CODE** (read in source), **NOT VERIFIED**.

Decision record: [`docs/features/ai-account-sign-in.md`](../features/ai-account-sign-in.md).

## Automated checks (RUNTIME)

| Check                        | Result                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check` (full gate)  | exit 0: renderer transactions, architecture (0 errors, no new exceptions), prettier, cargo fmt, ESLint, Clippy `-D warnings`, build, Playwright 346 passed, cargo test 649 passed / 0 failed / 2 ignored |
| `bun run check:architecture` | exit 0 (also run standalone)                                                                                                                                                                             |
| `tests/integrations.spec.ts` | 17/17, including 7 new AI sign-in cases                                                                                                                                                                  |
| `bun run tauri:build:rctest` | exit 0 (with `RC` set to the Windows SDK `rc.exe`); NSIS installer SHA-256 `36e95473f7de84b386c3d82228667e7f6291c271628f95ba2725a4798def4483`                                                            |
| RC install (`/S`)            | exit 0; `linkgo-rctest.exe` installed under the isolated identity `com.linkgo.app.rctest`                                                                                                                |

### Re-run on 2026-10-01 (RUNTIME)

The full `bun run check` exited 0 on the current working tree, with the native
browser launch, Claude Code version lookup and live-check fixes included:
architecture 259 sources with 0 errors and no new exceptions, CSP 6/6, prettier,
cargo fmt, ESLint, Clippy, build, Playwright 353 passed and cargo test 666 passed
/ 0 failed / 2 ignored. Playwright's pinned Chromium headless shell (revision 1217) had gone missing from this machine and was re-downloaded with operator
approval before the run.

### Native tests added

- PKCE: S256 challenge matches the RFC 7636 Appendix B vector.
- Authorize URLs for both providers carry the expected client, redirect, scope, challenge and state.
- `parse_authorization_input`: full URL, `code#state`, query string, missing state, garbage, oversize.
- State mismatch is rejected before any token request.
- Loopback: correct callback returns the code; wrong state is rejected; a wrong path gets 404 and the listener keeps waiting; an oversized request is rejected; a short timeout and cancel both end the wait.
- Token endpoints (local fake server): form/JSON bodies, `claude-cli` identity headers (the User-Agent version is resolved via `claude_code_version`: npm registry lookup, 24h cache, fallback `2.1.280`), 4xx → rejected, 5xx → transient, Anthropic fallback URL used only after 5xx or a network error, 256 KiB response cap.
- Refresh: success rotates tokens; 4xx clears tokens and sets `needs_reauth`; 5xx keeps tokens; **8 concurrent threads make exactly one token-endpoint call**; forced refresh after a 401 is skipped when another caller already replaced the token.
- Redaction: tokens never appear in `Debug`, `safe_status` JSON or error strings.
- Keyring chunking: round trip above 2560 bytes, shrink removes stale chunks, legacy single-entry values still read, missing chunk reports a reconnect error.
- Runtime: a `needs_reauth` credential fails with the reconnect message before any request; the Anthropic OAuth payload starts with the Claude Code identity block and sends the required headers; Codex payload/headers and SSE parsing against fixture events; API-only models rejected on the Codex backend.

### Playwright cases added

Risk checkbox gates Start for both providers; Anthropic paste flow → connected → sign out; OpenAI loopback `auth_done` event → connected; cancel; reconnect-needed state; sign-in replaces an API key (with confirmation) and an API key replaces sign-in (with confirmation), with the API-key flow unchanged.

## Live checks on the RC build

| Action                    | Result                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------- |
| OpenAI live sign-in       | **SCOPED EXCLUSION** (2026-10-01, operator decision): not performed; **NOT VERIFIED**. |
| OpenAI minimal AI call    | **SCOPED EXCLUSION** (2026-10-01, operator decision): not performed; **NOT VERIFIED**. |
| Anthropic live sign-in    | **RUNTIME**: passed on 2026-09-27; see the Anthropic live check below.                 |
| Anthropic minimal AI call | **RUNTIME**: passed on 2026-09-27; see the Anthropic live check below.                 |

The OpenAI rows reflect the first RC run: no OpenAI account was contacted, no
OpenAI token was issued and no OpenAI model was called. OpenAI correctness against
the real endpoints is **NOT VERIFIED**: URLs, client IDs, scopes, headers and
payload shapes match the gg-framework reference (CODE), but that is not proof that
OpenAI accepts them today.

## Live check — Anthropic (2026-09-27, Linkgo RC Test build)

- **RUNTIME**: Pressing "Sign in with Anthropic account" opened the claude.ai
  authorize URL in the default browser (Chrome). The URL matches gg-core
  `loginAnthropic` byte-for-byte: `URLSearchParams` encoding and a 32-char hex
  state. claude.ai showed the "Authentication code" page, with no "Invalid request
  format" error.
- **RUNTIME**: After the code was pasted, the dialog showed "Signed in with
  Anthropic account" with a renewal time.
- **RUNTIME**: One `linkgo_agent_provider_stream` call (model `claude-sonnet-4-6`,
  prompt "Reply with exactly: pong") returned `pong` in about 950 ms.
- **RUNTIME**: `claude-code-version.json` in the app data dir recorded version
  `2.1.283`, fetched from `registry.npmjs.org`.

Fixes that made it pass:

- Native browser launch (`src-tauri/src/auth/external_browser.rs`).
- Anthropic state and authorize URL matching gg-core
  (`src-tauri/src/auth/anthropic_oauth.rs`: `create_state`, `build_authorize_url`).
- Ported Claude Code version lookup (`src-tauri/src/auth/claude_code_version.rs`).

Still **NOT VERIFIED**:

- An Anthropic token refresh with the real account.
- All live OpenAI sign-in and calls.
- The maximized/fullscreen sidebar (checked only via the app's Maximize button
  plus a screen-sized window).

## Scoped release exclusion — OpenAI live sign-in (2026-10-01)

The operator chose to record OpenAI live sign-in and the minimal OpenAI call as a
scoped release exclusion instead of performing them. OpenAI account sign-in ships
covered only by native tests, Playwright tests and code review against the
gg-framework reference. It has **not** been verified against the real OpenAI
endpoints and may fail live. To lift the exclusion, perform one live OpenAI
sign-in and one minimal call on the RC test build and record the result here.

## Remaining gaps

- OpenAI live sign-in and call: scoped release exclusion (see above), NOT VERIFIED.
- An Anthropic token refresh with the real account is not yet verified.
- Not tested on macOS, Linux, Windows 11 or with the MSI installer.
- The OpenAI loopback port 1455 conflict with Codex CLI is covered by the bind-failure → paste fallback in code, not by a runtime test.
