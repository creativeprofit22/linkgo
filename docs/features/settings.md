# Settings

## Purpose

The Settings page exposes app-level preferences that are not campaign-specific.

This slice adds one Startup control: `Launch Linkgo at login`.

## Tauri boundary

Feature folder: `src/features/settings`.

OS integration: official Tauri v2 `@tauri-apps/plugin-autostart` / `tauri-plugin-autostart`.

Allowed plugin commands:

- `plugin:autostart|is_enabled`
- `plugin:autostart|enable`
- `plugin:autostart|disable`

The OS autostart setting is the source of truth when the plugin is available.

## Schema

Migration version `17` creates singleton table `app_settings`:

- `id = 1`
- `launch_on_login_enabled`: local mirror of OS autostart state.
- `launch_on_login_last_synced_at`: last successful sync timestamp.
- `launch_on_login_last_error`: safe last error string for failed enable/disable attempts.
- `created_at` / `updated_at`.

## UI behavior

The Settings page shows a Startup card with one switch.

Loading or saving disables the switch.

A successful change shows either `Launch on login enabled` or `Launch on login disabled`.

A failed change keeps the prior state and shows `Launch-on-login setting was not changed`.

## Persistence

The OS autostart state is read and changed through the autostart plugin first, never inside a database transaction. Native commands in `src-tauri/src/settings.rs` then mirror it into the singleton `app_settings` row: `linkgo_settings_launch_on_login_sync` (recreates a missing row, stores the OS state and sync time, and keeps or replaces the last error) and `linkgo_settings_launch_on_login_error_record` (error text bounded to 500 UTF-16 units). Each runs in one transaction. The renderer has no direct SQL access to this table.

## Window and permissions

The Settings window is created natively by `linkgo_window_open_settings` (`src-tauri/src/window_commands.rs`) with a fixed label (`settings`), route (`/settings`), size and parent; it focuses an existing Settings window instead of opening a second one. The renderer cannot create webviews or choose their URLs.

The `settings` window has its own capability (`src-tauri/capabilities/settings.json`): the two launch-on-login commands above, `autostart:allow-enable/disable/is-enabled`, event listening and its own window controls. It cannot call publishing, credential, draft, agent or other main-window commands. Startup draft reconciliation runs only in the main window. See `docs/security/capability-matrix.md`.

## Exclusions

- No hidden startup args in this slice.
- No scheduler start on login.
- No background daemon.
- No scheduler or metric refresh execution after Linkgo quits.
- No additional settings in this slice.

## Verification commands

```bash
bun run format:check
bun run lint
bun run build
bun run test -- tests/settings.spec.ts
bun run test:rust
bun run check
```
