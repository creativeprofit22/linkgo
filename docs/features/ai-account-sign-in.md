# AI account sign-in (OpenAI and Anthropic)

Linkgo can connect OpenAI and Anthropic with **account sign-in** (OAuth 2.0 authorization code + PKCE) as well as with API keys. This page records the per-provider decision required before implementation, and how the flow works.

## Decision record (user decision, 2026-09-27)

|                                          | OpenAI (ChatGPT plan)                                                                                                                                                                     | Anthropic (Claude plan)                                                                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Permitted for a third-party desktop app? | No approved third-party sign-in exists. OpenAI documents ChatGPT sign-in for Codex clients and tells general API users to use Platform API keys. Reusing the Codex client is a grey zone. | **Prohibited.** Anthropic's Claude Code legal and compliance page states that OAuth tokens from Free/Pro/Max plans are for Claude Code and Claude.ai only. Anthropic began enforcing this against third-party clients server-side in 2026. |
| User decision                            | Build it, available to every operator, behind a risk acknowledgement.                                                                                                                     | Build it anyway, for the operator's personal use only, behind a risk acknowledgement.                                                                                                                                                      |
| Client identity                          | Reuses the Codex CLI public client ID `app_EMoamEEZ73f0CkXaXp7hrann`. Linkgo has no registered OpenAI app.                                                                                | Reuses the Claude Code public client ID. Linkgo has no registered Anthropic app.                                                                                                                                                           |
| Authorize / token                        | `https://auth.openai.com/oauth/authorize` / `https://auth.openai.com/oauth/token`                                                                                                         | `https://claude.ai/oauth/authorize` / `https://platform.claude.com/v1/oauth/token` (fallback `https://console.anthropic.com/v1/oauth/token` on network or 5xx errors only)                                                                 |
| Redirect                                 | `http://localhost:1455/auth/callback` (loopback listener on `127.0.0.1:1455`) with a paste fallback                                                                                       | `https://platform.claude.com/oauth/code/callback`; the operator pastes the `code#state` shown there                                                                                                                                        |
| Scopes                                   | `openid profile email offline_access api.connectors.read api.connectors.invoke`                                                                                                           | `org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload`                                                                                                                               |
| Token lifetime                           | Access token about 1 h (`expires_in`); rotating refresh token                                                                                                                             | Access token about 8 h (`expires_in`); refresh token                                                                                                                                                                                       |
| Inference endpoint                       | `https://chatgpt.com/backend-api/codex/responses` (Responses API, streamed)                                                                                                               | `https://api.anthropic.com/v1/messages` with Claude Code identity headers and system prefix                                                                                                                                                |
| Cost                                     | Uses the ChatGPT plan's usage limits, not API billing                                                                                                                                     | Uses the Claude plan's usage; the provider may reject third-party use at any time                                                                                                                                                          |

Sources:

- Anthropic, _Claude Code legal and compliance_ — <https://code.claude.com/docs/en/legal-and-compliance>
- OpenAI, _Codex authentication_ — <https://developers.openai.com/codex/auth>

### How the decision is enforced

- Both providers show a **Sign in with account** option in Integrations, but **Start** stays disabled until the operator ticks the acknowledgement: "I understand this may break the provider's terms and can put my account at risk; personal use only."
- The native command `linkgo_auth_oauth_start` rejects OpenAI/Anthropic unless `acknowledgeTermsRisk: true` is sent. The renderer cannot skip the check.
- The existing API-key flow is unchanged, including pasted Anthropic `sk-ant-oat` tokens.
- If the provider rejects a live call (for example Anthropic answering that the credential is only authorized for Claude Code), that result is recorded as a scoped exclusion in `docs/verification/ai-account-sign-in.md`. It is never reported as verified.

### Risks the operator accepts

- The provider may suspend or restrict the operator's ChatGPT/Claude account for third-party use.
- The private Codex endpoint, the `originator` rules or Anthropic's identity checks can change without notice and break sign-in.
- Port 1455 is shared with the Codex CLI. If it is busy, Linkgo falls back to pasting the callback URL.

## Flow

1. Operator opens the provider in Integrations, picks **Account sign-in**, ticks the acknowledgement and presses **Start sign-in**.
2. Native code creates PKCE (S256) and a random state, stores them in a 10-minute pending session, and returns only the authorization URL.
3. OpenAI: a loopback listener on `127.0.0.1:1455` waits up to 5 minutes for `GET /auth/callback`. It checks `state`, exchanges the code, saves the tokens and emits `linkgo://auth-progress` `auth_done`. If the port is busy, or the browser is elsewhere, the operator pastes the full callback URL instead.
   Anthropic: the operator pastes the `code#state` shown on Anthropic's callback page.
4. Tokens are saved in the identifier-scoped OS keyring. Large payloads are split across several keyring entries because Windows Credential Manager limits each entry to 2560 bytes.
5. Before each agent run and each status check, native code refreshes a token that expires within 5 minutes. Refresh is serialized per provider, so concurrent runs cannot race and burn a rotating refresh token. The renderer therefore treats an OpenAI/Anthropic sign-in with status `expired` as ready for agent runs, and the card shows **Renews on next run** instead of asking to reconnect. `reauth_required` stays blocked.
6. If the provider rejects the refresh (4xx), tokens are cleared and the card shows **Reconnect needed**. Network or 5xx errors keep the tokens and report the error.
7. **Sign out** deletes the credential. Signing in replaces a saved API key for the same provider (after confirmation), and saving an API key replaces a sign-in.

Tokens never reach the renderer: IPC carries only the authorization URL, state, account label, scopes, expiry and status.
