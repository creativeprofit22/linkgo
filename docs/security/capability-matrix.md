# Webview capability matrix

Tauri checks every IPC call against the calling window's capability. Because
`src-tauri/build.rs` declares an app ACL manifest, this applies to Linkgo's own
`linkgo_*` commands as well as plugin and core commands. Before this phase there
was no app manifest, so any local window could call every app command.

Sources: `src-tauri/capabilities/main.json` and `src-tauri/permissions/main-commands.toml`.

Since 2026-10-15 Linkgo has **one window** (`main`). Settings is a screen inside
it (`#/settings`), so the separate `settings` window, its capability
(`settings.json`), its command set (`settings-commands.toml`) and the
`linkgo_window_open_settings` command were removed. The `settings` column below
is kept only as history: nothing is granted to that label any more.

| Permission                                                                                                             | `main` | `settings` | Why                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------- |
| App commands (`main-commands` set, 155 `linkgo_*` commands)                                                            | ✅     | ❌         | Features, drafts, approvals, publishing (approval-gated), credentials, agent runs |
| `linkgo_auth_oauth_cancel` (added 2026-09-27, in `main-commands`)                                                      | ✅     | ❌         | Stops a waiting OpenAI/Anthropic account sign-in; changes no saved credential     |
| `linkgo_settings_launch_on_login_sync` / `_error_record`                                                               | ✅     | ❌         | In-app Settings mirrors OS autostart state (moved from `settings`, 2026-10-15)    |
| `update_tray_menu`                                                                                                     | ❌     | ❌         | Registered for native use only; no renderer caller                                |
| `autostart:allow-enable/disable/is-enabled`                                                                            | ✅     | ❌         | In-app launch-on-login switch (moved from `settings`, 2026-10-15)                 |
| `linkgo_window_open_settings`                                                                                          | —      | —          | Removed 2026-10-15; must not be registered                                        |
| `global-shortcut:allow-register/unregister`                                                                            | ✅     | ❌         | `Ctrl/Cmd+Shift+L` show-window shortcut                                           |
| `core:event:allow-listen/unlisten`                                                                                     | ✅     | ✅         | OAuth progress events, window resize listener                                     |
| `core:window:allow-close/minimize/toggle-maximize/internal-toggle-maximize/start-dragging/show/set-focus/is-maximized` | ✅     | ✅         | Custom title bar and startup show                                                 |
| `core:default`, `core:event:allow-emit`                                                                                | ❌     | ❌         | Renderer never emits; defaults are broader than needed                            |
| `core:webview:allow-create-webview-window`                                                                             | ❌     | ❌         | The renderer never creates windows                                                |
| `global-shortcut:*-all`, `global-shortcut:default`                                                                     | ❌     | ❌         | Unused                                                                            |
| `sql:*`                                                                                                                | ❌     | ❌         | Renderer has no SQL access (since `c209131`)                                      |
| `linkgo_auth_provider_secret`                                                                                          | —      | —          | Removed; must never be registered                                                 |

## Enforcement and tests

- `src-tauri/src/command_registry_tests.rs` (RUNTIME via `cargo test`):
  - every registered command except `update_tray_menu` is granted to exactly the
    expected window, and every granted command is registered;
  - `main_window_grants_startup_controls`: `main` holds exactly the 3 autostart
    permissions and the 2 launch-on-login commands, and
    `linkgo_window_open_settings` is neither granted nor registered;
  - the capability does not contain `sql:*`, `core:default`, `core:event:allow-emit`,
    `core:webview:allow-create-webview-window` or `global-shortcut:*-all`;
  - only `main.json` exists;
  - `linkgo_auth_provider_secret` is neither registered nor invoked.
- `scripts/check-csp.test.mjs` (in `bun run check:architecture`): `connect-src`
  is limited to `'self' ipc: http://ipc.localhost` (plus Vite HMR origins in
  `devCsp` only), with `object-src 'none'`, `frame-ancestors 'none'`,
  `form-action 'none'`, `base-uri 'self'`, `script-src 'self'`.

## Adding a command

1. Register it in `tauri::generate_handler!` (`src-tauri/src/lib.rs`).
2. Add `allow-<command-with-dashes>` to the right set in `src-tauri/permissions/`.
3. `cargo test command_registry` fails until both are in sync.

## Verification limits

- Playwright uses IPC mocks and does **not** enforce ACL or CSP. The Rust tests
  prove the configuration, not the runtime rejection.
- Runtime proof needs a desktop run (`bun run tauri dev`): the main window loads
  data and in-app Settings toggles launch-on-login. Results below. The
  2026-09-26 probe predates the single-window change (2026-10-15); the main
  window's new autostart access was re-probed on 2026-10-15 (see below).
- Known exception: `style-src 'unsafe-inline'` stays for Tailwind/Radix inline styles.

### Single-window re-probe (2026-10-15, Windows, installed `Linkgo RC Test`)

`LINKGO_DESKTOP_SCENARIO=fresh bun run test:desktop` against a freshly built,
installed RC test app on an empty profile, attached over CDP on port 9222:

- `lifecycle.desktop.ts` passed. The main window navigated to `#/settings`,
  the "Open Linkgo when I sign in" switch turned on, and the plugin wrote
  exactly one `linkgo-rctest.exe` Run entry. Switching it off removed that
  entry. Production Run entries were unchanged, and no Linkgo Run entry
  remained afterwards.
- `startup.desktop.ts` ACL test passed: raw SQL and unknown commands are still
  rejected from the main window, and `plugin:autostart|is_enabled` is now
  allowed there.
- The same run had failures unrelated to autostart: the sidebar-driven specs
  (startup screens, workflow, accessibility) still target the old
  "Linkgo sections" navigation, and the keyring spec found an older RC
  `anthropic` credential.

### Desktop probe result (2026-09-26, Windows, `bun run tauri dev`)

This was a scripted probe, run with the main window minimised, that drove the real WebView2 windows over CDP (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`). **18/18 passed:**

- Main: `linkgo_auth_status` and `linkgo_campaign_list` allowed. `linkgo_auth_provider_secret` not found. `create_webview_window` and `event.emit` denied. `fetch('https://example.com')` blocked by CSP. `autostart.is_enabled` denied. No ACL/CSP console errors during load.
- `linkgo_window_open_settings` opened `/settings`. The page reloaded with no console errors and its switch rendered.
- Settings: autostart enable/disable worked and was restored to its original state (off). `linkgo_settings_launch_on_login_sync` passed ACL (reached argument validation). `linkgo_linkedin_publish_post`, `linkgo_auth_status`, `linkgo_auth_api_key`, `linkgo_agent_provider_stream`, `linkgo_window_open_settings` and `global-shortcut.register` were all rejected with "not allowed on window settings".

Not covered: packaged/production build (`tauri build`), macOS/Linux, and clicking through every feature view by hand.
