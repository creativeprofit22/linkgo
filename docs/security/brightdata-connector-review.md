# Bright Data source connector review

**Status: signed off by the owner on 2026-10-01.** The connector still ships
disabled (`app_settings.brightdata_connector_enabled = 0`); the owner turns it
on with the toggle.

This review is required by `docs/ARCHITECTURE.md` (Source connector boundary)
and `docs/features/autopilot-planner.md` (Connector contract) before any
production source connector is enabled.

## What the connector does

Read-only ingestion of public LinkedIn posts into the existing Source Imports
boundary (`src-tauri/src/source_imports.rs`), always started by a person
clicking a button for one campaign.

| Mode        | Transport                                    | Bright Data surface                                                                                     |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `post_url`  | `brightdata` CLI 0.3.7 (pinned)              | `pipelines linkedin_posts <url> --json` (dataset `gd_lyy3tktm25m4avu764`)                               |
| `watchlist` | Direct HTTPS to `https://api.brightdata.com` | Datasets v3 `trigger` (`discover_new`, `profile_url` / `company_url`), `progress`, `snapshot`, `cancel` |

It never posts, comments, reacts, signs in to LinkedIn, drives a browser
(the CLI `browser` subcommands are not on the allowlist), or runs on a
schedule/unattended. LinkedIn publishing and commenting approval gates are
unchanged.

## API access

- Access is through the owner's own Bright Data account and API key.
- The key is stored in the OS keyring (`CredentialStore`, provider `brightdata`).
  It is passed to the CLI only through the `BRIGHTDATA_API_KEY` environment
  variable of a child process with a cleared environment, and to the direct
  client only as a `Bearer` header. It is never written to argv, logs, the
  database, CLI `credentials.json` (`brightdata login` and `--api-key` are
  never used), or IPC responses.
- The direct client talks to one fixed host (`api.brightdata.com`, HTTPS, no
  redirects); the host is a constant, not user-configurable.
- **Owner to confirm:** the Bright Data account is in good standing and its
  plan permits the Datasets API (LinkedIn posts dataset).

## LinkedIn terms risk

- LinkedIn's User Agreement prohibits scraping and automated collection of
  member data without LinkedIn's permission. Using a third-party data provider
  does not remove that risk for the owner; it moves the collection act to
  Bright Data, whose own terms and compliance position govern it.
- The connector never uses the owner's LinkedIn session or credentials, so it
  cannot put the owner's LinkedIn account at risk through automation from this
  device. Published content still goes only through the approval-gated
  official LinkedIn API path.
- **Owner to confirm:** they accept Bright Data's terms (including its
  acceptable-use / KYC requirements for LinkedIn datasets) and have decided the
  residual LinkedIn terms risk is acceptable for their use.

## Permissions

- Native capability: new `linkgo_brightdata_*` commands are granted only to the
  `main` window capability, not `settings`.
- Every run-starting or resuming command checks, in order and failing closed:
  connector enabled flag, global kill switch off, campaign exists, API key
  present, per-run and per-day caps, no other active run for the campaign.
- Spawned processes: only the resolved `brightdata` binary (absolute path or
  PATH lookup), argument arrays (no shell), subcommand allowlist
  (`--version`, `pipelines linkedin_posts`), version must equal
  `0.3.7`, hard wall-clock timeout with kill, stdout/stderr size caps.

## Permitted use

- Purpose: find public posts relevant to the owner's campaigns so the owner can
  decide, with human approval, whether to write their own post or comment.
- Not permitted: bulk profile harvesting, contact enrichment, lead lists,
  messaging, resale, or training models on collected data.
- Only post fields needed by the existing candidate pipeline are kept (see
  below); full Bright Data records are discarded after mapping.

## Personal data handling and retention

- Fields kept per post: post URL, post text (truncated to source-import
  limits), author display name, author profile URL, posted date, platform
  URN/id, source keyword or watchlist label, and a `brightdata:<mode>` note.
- Watchlist entries store profile/company URLs and a short label the owner
  typed; these identify people/companies and are personal data.
- Everything is local SQLite on the owner's device. Nothing is sent anywhere
  except the post URLs, watchlist profile/company URLs and date window sent to
  Bright Data to perform the request.
- Retention follows the existing Source Imports data (deleted with the
  campaign via `ON DELETE CASCADE`). `brightdata_runs` keeps only the input
  (post URLs, or watchlist kind, profile/company URLs, label and date window),
  counts, status and a bounded error message — never raw records or the API
  key.
- **Owner to confirm:** their own legal basis (e.g. legitimate interest) for
  processing public posts and author names, and whether a shorter retention
  period is required.

## Caps and cost

Conservative constants, enforced natively and covered by tests:

| Cap                                  | Value       |
| ------------------------------------ | ----------- |
| Posts per run                        | 20          |
| Watchlist entries per run            | 10          |
| Runs per campaign per UTC day        | 5           |
| Discovery window (default / maximum) | 7 / 30 days |
| Active runs per campaign             | 1           |

- Bright Data bills per record / request; exact LinkedIn dataset pricing is
  account-specific and **not verified here**. Worst case per day per campaign:
  5 runs × 20 records = 100 records.
- **Owner to confirm:** the price per record on their plan and that the worst
  case above is acceptable. Bright Data account-level spend limits are
  recommended as a second control.

## Residual risks

- CLI JSON output is not a stable contract: pinned version, strict parsing that
  fails closed, fixtures re-captured after the first live run.
- Discovery quality is unverified until a live run.
- Node.js ≥ 20 and the CLI must be installed by the owner; Linkgo does not
  bundle them.

## Sign-off

| Item                                 | Decision | Name / date       |
| ------------------------------------ | -------- | ----------------- |
| API access and account plan          | accepted | Owner, 2026-10-01 |
| LinkedIn / Bright Data terms risk    | accepted | Owner, 2026-10-01 |
| Permissions model                    | accepted | Owner, 2026-10-01 |
| Permitted use                        | accepted | Owner, 2026-10-01 |
| Personal data handling and retention | accepted | Owner, 2026-10-01 |
| Caps and cost                        | accepted | Owner, 2026-10-01 |

Amended 2026-10-01 after keyword mode was removed; no change to permissions or
data kept beyond the corrections above.
