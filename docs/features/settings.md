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
