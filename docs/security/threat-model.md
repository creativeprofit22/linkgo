# Linkgo threat model

Scope: the Linkgo desktop app (Tauri 2 webviews + native Rust core). Re-verified
against HEAD `004f432` on 2026-09-26 for the "Harden credentials, provider
destinations and webview capabilities" phase. Evidence labels: **CODE** (read in
source), **RUNTIME** (observed by running a test/tool), **DEDUCED** (inferred).

## Assets

- AI provider API keys and optional Base URLs (OS keyring via `src-tauri/src/auth/storage.rs`;
  service `linkgo` for `com.linkgo.app`, `linkgo:<identifier>` for any other
  bundle identifier so test builds are isolated from production secrets).
- LinkedIn OAuth access/refresh tokens (same store).
- OpenAI (ChatGPT plan) and Anthropic (Claude plan) sign-in access/refresh tokens
  (same store, split across `<provider>#n` entries when large). They grant use of
  the operator's personal subscription; see `docs/features/ai-account-sign-in.md`.
- The one-shot OpenAI sign-in loopback listener on `127.0.0.1:1455`.
- The local SQLite database (campaigns, drafts, approvals, publish executions).
- The ability to publish/comment on LinkedIn (always human-approval-gated).

## Trust boundaries

| Boundary                           | Untrusted side                                                                                   | Trusted side                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Webview → native IPC               | Renderer JS in `main` / `settings` windows (compromise via a future XSS or malicious dependency) | `#[tauri::command]` handlers, ACL via `src-tauri/capabilities/*.json`                                                                  |
| Native → AI provider               | Provider HTTP responses, redirects, the user-configured Base URL                                 | Destination policy `src-tauri/src/net/destination.rs`, transport `src-tauri/src/net/transport.rs`                                      |
| Native → LinkedIn                  | LinkedIn HTTP responses                                                                          | `src-tauri/src/auth/linkedin_api.rs`, fixed HTTPS endpoints                                                                            |
| Model output → tools               | Provider tool calls                                                                              | Native tool allowlist in `agent_runtime.rs`, human approval before any external action                                                 |
| Local processes → sign-in listener | Any local process or browser tab that can reach `127.0.0.1:1455` while OpenAI sign-in waits      | `src-tauri/src/auth/loopback.rs`: loopback bind only, 8 KiB head cap, path check, `state` check before exchange, 5-min timeout, cancel |
| Native → OAuth token endpoints     | Token responses from OpenAI/Anthropic                                                            | Fixed HTTPS URLs, `PUBLIC_HTTPS` no-redirect client, 256 KiB cap, only a sanitized OAuth error code kept                               |

The attacker model is **renderer compromise** and **hostile/MITM'd or misconfigured
provider endpoints**. None of the findings below is an anonymous remote exploit.

## Re-verification of earlier roadmap observations

| Old claim                                            | Evidence (source → sink)                                                                                                                                                                                                                                                                           | Verdict                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Both webviews hold SQL load/select/execute           | CODE: `capabilities` contain no `sql:*` since commit `c209131`; ESLint and `check-renderer-transactions` ban `@tauri-apps/plugin-sql`. Native keeps `tauri_plugin_sql` for migrations/`DbInstances`.                                                                                               | **Discarded** — already resolved.                                                              |
| Renderer can read AI provider secrets                | CODE: `linkgo_auth_provider_secret` returned plaintext `api_key`/`base_url`; only renderer caller was the `IS_TEST` test API.                                                                                                                                                                      | **Confirmed, fixed** — command removed.                                                        |
| Both windows share privileges incl. webview creation | CODE: one capability for `main`+`settings` granting `core:webview:allow-create-webview-window`, `global-shortcut:*-all`, `core:event:allow-emit`. Tauri 2 skips ACL for app commands when no app manifest is declared (`has_app_acl_manifest`), so `settings` could call every `linkgo_*` command. | **Confirmed (wider than stated), fixed** — app manifest + per-window capabilities.             |
| CSP allows arbitrary HTTP/HTTPS                      | CODE: `connect-src 'self' https: http:`; renderer performs no `fetch`/XHR/WebSocket.                                                                                                                                                                                                               | **Confirmed defense-in-depth, fixed** — `connect-src` limited to IPC.                          |
| Base URL only presence-checked                       | CODE: `ensure_api_key_input` checked non-empty for `custom` only; `provider_base_url`/`gemini_code_assist_url` used the stored value verbatim (any scheme, host, userinfo, link-local metadata, LAN).                                                                                              | **Confirmed, fixed** — policy at save and at execution.                                        |
| Redirects "to assess"                                | CODE: transports used `reqwest::blocking::Client::new()` → `Policy::limited(10)`. reqwest 0.12 strips only `Authorization`/`Cookie`/`Proxy-Authorization`/`WWW-Authenticate` on cross-host redirects, so Anthropic's `x-api-key` survived; 307/308 replay the body.                                | **New finding, fixed** — redirects disabled.                                                   |
| (new) Unbounded responses                            | CODE: `response.json()`/`.text()` read whole bodies (agent runtime, LinkedIn API); provider error messages returned uncapped.                                                                                                                                                                      | **Confirmed (memory/UI DoS by a hostile endpoint), fixed** — bounded reads + truncated errors. |
| Plaintext credential fallback                        | CODE: file fallback only when `LINKGO_CREDENTIAL_FILE_FALLBACK` is set (`storage.rs`).                                                                                                                                                                                                             | **Downgraded** — opt-in developer escape hatch; keyring is the default. Kept and documented.   |
| Lockfile advisories                                  | Lockfile-only matches are not proof of reachable runtime code.                                                                                                                                                                                                                                     | **Downgraded** — resolved 2026-09-26 in `dependency-risk.md` (upgrades + dated exceptions).    |

## Controls after this phase

- Provider secrets never cross IPC; only `ConnectedAccountPayload` (built
  natively by `status_to_account` from the internal `SafeCredentialStatus`)
  reaches the renderer. It carries no API key, token or Base URL, only the
  boolean `has_base_url_override` flag, and the renderer validates it with
  `connectedAccountSchema`.
- Destination policy: HTTPS to public hosts by default; loopback/private/link-local/
  ULA/CGNAT/unspecified destinations and plain `http` require explicit
  per-credential consent (`allowLocalDestination`), recorded in the keyring entry.
  Userinfo, fragments, control characters and non-http(s) schemes are always rejected.
- Transport: no redirects, connect/total timeouts, HTTPS-only for non-consented
  destinations, a DNS resolver that drops private addresses for non-consented hosts
  (DNS-rebinding guard), bounded bodies (8 MiB provider, 1 MiB LinkedIn), error text
  truncated to 500 chars.
- IPC: app commands are ACL-checked; `main` and `settings` have separate capabilities
  (see `capability-matrix.md`). The renderer can no longer create webviews.
- CSP: `connect-src` limited to `'self'` and the IPC origins; `object-src 'none'`,
  `frame-ancestors 'none'`, `form-action 'none'`, `base-uri 'self'`.
- AI account sign-in (2026-09-27): PKCE S256 + random state; a pasted value's state
  is checked before the pending session is consumed or any request is sent; the
  start command refuses OpenAI/Anthropic without `acknowledgeTermsRisk: true`.
  Tokens never cross IPC (`OAuthStartResult` carries only URL/state/needsCode);
  `OAuthCredentials`, `ApiKeyCredentials` and `TokenResponse` have redacting `Debug`.
  Refresh is serialized per provider (`OAuthRefreshLocks`) and re-reads the store
  under the lock, so concurrent runs cannot spend a rotating refresh token twice
  (8-thread test: exactly one token call). A 4xx refresh clears the tokens and sets
  `needs_reauth`; network/5xx errors keep them. A 401 during a run triggers one
  forced refresh and one retry.

## Defensive review (2026-09-26)

An `auditor` pass on the diff found no Critical/High issues. A `skeptic` triage downgraded its three findings, and all three were fixed anyway:

- An environment proxy (`HTTP(S)_PROXY`/`ALL_PROXY`) would have resolved destinations itself, bypassing the DNS guard, and would have seen plaintext keys for consented `http://` local endpoints. The downgrade was Medium to Low because env vars are user-controlled and the Windows registry proxy is off (`default-features = false`). Fix: the provider transport sets `no_proxy()`.
- Consent was stored for any Base URL and relaxed the DNS guard for public hosts (reachable only via direct IPC). Downgraded to Informational. Fix: consent is stored and applied only when the destination itself is local.
- The IPv6 classifier missed IPv4-translated, 6to4, local-use NAT64 and Teredo ranges. Downgraded to Informational. Fix: now classified, with table tests.

The review did not include a live proxy or NAT64 reproduction. A desktop ACL/CSP probe was run afterwards (18/18 passed, see `capability-matrix.md`).

## Known exceptions and limits

- `style-src 'unsafe-inline'` is kept for Tailwind/Radix inline styles.
- AI account sign-in reuses the Codex CLI and Claude Code public client IDs. Any
  local process could also start a sign-in with those public IDs; the protection is
  PKCE plus state, not client secrecy. Anthropic prohibits this use for
  third-party apps; the operator accepts that risk explicitly.
- While OpenAI sign-in waits, another local process could win the race to bind
  port 1455 first (for example Codex CLI). Linkgo then falls back to pasting; a
  hostile listener would receive a code it cannot redeem without the PKCE verifier.
- Consented local endpoints are trusted by design (no rebinding guard for them).
- Stored Base URLs that fail the new policy stop working until re-saved (with
  consent where applicable); the error message says so.
- ACL and CSP behavior is only fully provable in a real Tauri run; Playwright mocks
  do not enforce ACL. Automated coverage is Rust-level (manifest/capability drift
  tests) plus a manual desktop probe — see the verification section of
  `capability-matrix.md`.
- Dependency advisories and a full git-history secret scan are now covered by the
  CI `supply-chain` job (2026-09-26; see `dependency-risk.md`). Not covered:
  OS-level malware with same-user access to the keyring.
