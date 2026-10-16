# Settings

## Purpose

The Settings page exposes app-level preferences that are not campaign-specific.

This slice adds one Startup control: `Open Linkgo when I sign in`.

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

A successful change shows either `Linkgo will open when you sign in` or `Linkgo won't open when you sign in`.

A failed change keeps the prior state and shows `We couldn't change your startup setting`.

## Persistence

The OS autostart state is read and changed through the autostart plugin first, never inside a database transaction. Native commands in `src-tauri/src/settings.rs` then mirror it into the singleton `app_settings` row: `linkgo_settings_launch_on_login_sync` (recreates a missing row, stores the OS state and sync time, and keeps or replaces the last error) and `linkgo_settings_launch_on_login_error_record` (error text bounded to 500 UTF-16 units). Each runs in one transaction. The renderer has no direct SQL access to this table.

## Window and permissions

Settings is a screen inside the main window (`#/settings`, area **Settings › General**; see [navigation areas](navigation-areas.md)). The title-bar gear opens it with `navigateTo(settingsRoute)`, which also works in browser preview. The old separate Settings window, its `linkgo_window_open_settings` command and `settings.json` capability were removed on 2026-10-15. An old `/settings` address is redirected to `/#/settings` by `src/main.tsx`.

The main capability (`src-tauri/capabilities/main.json`) now holds exactly `autostart:allow-enable/disable/is-enabled` and the two launch-on-login commands above, pinned by `main_window_grants_startup_controls` in `src-tauri/src/command_registry_tests.rs`. Startup draft reconciliation runs in the main window. See `docs/security/capability-matrix.md`.

## Exclusions

- No hidden startup args in this slice.
- No scheduler (shown as **Auto-posting**) start on login.
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
