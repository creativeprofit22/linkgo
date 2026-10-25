# Backup and restore (operator procedure)

Linkgo keeps all campaign, draft, approval, schedule, safety and publish
history in one local SQLite database. There is no cloud copy. Manual
procedure verified on Windows 10 x64; see
`docs/verification/2026-09-27-desktop-release-candidate.md`.

## Automatic snapshots

On startup Linkgo writes consistent copies (`VACUUM INTO`) into a `backups`
folder next to the database:

- `linkgo-pre-migration-v<N>-<UTC stamp>.db` before it upgrades an existing
  database (newest 5 kept). If this copy fails, Linkgo stops and does not
  upgrade.
- `linkgo-daily-<UTC stamp>.db` at most once every 24 hours (newest 7 kept;
  best effort, retried next launch).

These copies sit on the same disk, so they cover bad upgrades and mistakes,
not disk loss: RPO is up to 24 hours plus the time since your last launch.
Copy the `backups` folder (or make a manual backup) to another drive to
survive a disk failure. Restore a snapshot by following **Restore** below,
renaming the snapshot to `linkgo.db`. Other files in the folder are never
pruned.

## What is where (Windows)

| Item                          | Location                                                                          | In the backup?                                    |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Database                      | `%APPDATA%\com.linkgo.app\linkgo.db`                                              | Yes                                               |
| Automatic snapshots           | `%APPDATA%\com.linkgo.app\backups\`                                               | Optional — copy to another drive                  |
| Database side files           | `linkgo.db-wal`, `linkgo.db-shm`, `linkgo.db-journal` next to it, if present      | Yes — always copy together with `linkgo.db`       |
| AI and LinkedIn credentials   | Windows Credential Manager, service `linkgo`                                      | **No** — reconnect after restore                  |
| Plaintext credential fallback | `linkgo-credentials.json` (only if `LINKGO_CREDENTIAL_FILE_FALLBACK` was enabled) | Not recommended; treat as a secret if you copy it |

The release-candidate test build uses `%APPDATA%\com.linkgo.app.rctest`
instead and never touches the folder above.

## Back up

1. Right-click the Linkgo tray icon → **Quit**. Closing the window is not
   enough: it only hides Linkgo to the tray.
2. Confirm Linkgo is not running (Task Manager shows no `linkgo.exe`).
   Copying while it runs can produce an inconsistent copy.
3. Copy `linkgo.db` and every `linkgo.db-*` file that exists into a new dated
   folder, for example `Linkgo backups\2026-09-27\`. Keep them together.
4. Optional check: open the copy with any SQLite tool and run
   `PRAGMA integrity_check;` — it must return `ok`.

## Restore

1. Quit Linkgo from the tray and confirm `linkgo.exe` is gone.
2. **Move** the current `linkgo.db` and `linkgo.db-*` files to a
   `before-restore-<date>` folder. Never delete them — they are your way back.
3. Copy the backup set into `%APPDATA%\com.linkgo.app\`.
4. Start Linkgo. On startup it applies any newer migrations to an older
   backup automatically (forward-only), then runs its recovery sweep.
5. Reconnect AI providers and LinkedIn in **Integrations** if the keyring was
   also lost (new machine, new Windows user).
6. Open **Safety** and reconcile any publish shown as outcome unknown before
   restarting the scheduler. A publish interrupted less than 10 minutes ago
   may still show as in progress; wait and reopen Safety before starting it.

## Limits

- A backup made by a **newer** Linkgo version cannot be restored into an
  older one. Migrations only move forward.
- Restoring rolls back everything done after the backup, including publish
  history. A post that LinkedIn accepted after the backup will not be
  recorded; check LinkedIn manually before re-approving similar content.
- The scheduler does not restart itself after launch (see
  `docs/features/scheduler.md`); start it from the Scheduler screen after
  checking Safety.
