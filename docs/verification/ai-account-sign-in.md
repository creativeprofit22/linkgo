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

### Native tests added

- PKCE: S256 challenge matches the RFC 7636 Appendix B vector.
- Authorize URLs for both providers carry the expected client, redirect, scope, challenge and state.
- `parse_authorization_input`: full URL, `code#state`, query string, missing state, garbage, oversize.
- State mismatch is rejected before any token request.
- Loopback: correct callback returns the code; wrong state is rejected; a wrong path gets 404 and the listener keeps waiting; an oversized request is rejected; a short timeout and cancel both end the wait.
- Token endpoints (local fake server): form/JSON bodies, `claude-cli` identity headers, 4xx → rejected, 5xx → transient, Anthropic fallback URL used only after 5xx or a network error, 256 KiB response cap.
- Refresh: success rotates tokens; 4xx clears tokens and sets `needs_reauth`; 5xx keeps tokens; **8 concurrent threads make exactly one token-endpoint call**; forced refresh after a 401 is skipped when another caller already replaced the token.
- Redaction: tokens never appear in `Debug`, `safe_status` JSON or error strings.
- Keyring chunking: round trip above 2560 bytes, shrink removes stale chunks, legacy single-entry values still read, missing chunk reports a reconnect error.
- Runtime: a `needs_reauth` credential fails with the reconnect message before any request; the Anthropic OAuth payload starts with the Claude Code identity block and sends the required headers; Codex payload/headers and SSE parsing against fixture events; API-only models rejected on the Codex backend.

### Playwright cases added

Risk checkbox gates Start for both providers; Anthropic paste flow → connected → sign out; OpenAI loopback `auth_done` event → connected; cancel; reconnect-needed state; sign-in replaces an API key (with confirmation) and an API key replaces sign-in (with confirmation), with the API-key flow unchanged.

## Live checks on the RC build

| Action                    | Result                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| OpenAI live sign-in       | **NOT VERIFIED**: I asked for approval and got no answer, so the action was not performed.  |
| OpenAI minimal AI call    | **NOT VERIFIED**: depends on the sign-in above; not performed.                              |
| Anthropic live sign-in    | **NOT VERIFIED**: not attempted; stopped after the first live approval went unanswered.     |
| Anthropic minimal AI call | **NOT VERIFIED**: not attempted. Even when attempted, Anthropic may refuse third-party use. |

No provider account was contacted, no token was issued and no model was called.
Implementation correctness against the real provider endpoints is therefore
**NOT VERIFIED**: URLs, client IDs, scopes, headers and payload shapes match the
gg-framework reference (CODE), but that is not proof that the providers accept them
today.

## Remaining gaps

- The live sign-in and call for each provider need an explicit per-action approval
  from the operator; until then, doneWhen criterion 5 is not met.
- Not tested on macOS, Linux, Windows 11 or with the MSI installer.
- The OpenAI loopback port 1455 conflict with Codex CLI is covered by the bind-failure → paste fallback in code, not by a runtime test.
