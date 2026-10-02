# Bright Data connector live smoke (2026-10-01)

Review: `docs/security/brightdata-connector-review.md`, signed off by the owner on 2026-10-01.

## Setup

- Windows 11, Node.js 20+, `@brightdata/cli@0.3.7` installed globally (`brightdata --version` → `0.3.7`).
- API key saved through Integrations → Bright Data (stored in Windows Credential Manager, service `linkgo`).
- Harness: `src-tauri/src/brightdata/live_smoke.rs` (ignored by default). It uses the real keyring key, real CLI and HTTPS transport, real mapping and Source Imports writer, against a throwaway migrated database. Each mode is capped at 3 records.

```text
LINKGO_BRIGHTDATA_LIVE=1 cargo test --lib brightdata::commands::live_smoke -- --ignored --nocapture
```

Optional: `LINKGO_BRIGHTDATA_POST_URL=<post url>` and `LINKGO_BRIGHTDATA_SKIP_WATCHLIST=1`.

## Results

| Mode      | Input                                                                      | Result                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keyword   | `discover "AI agents"`, 7-day window                                       | **Failed (expected to keep failing).** Bright Data answered HTTP 410: `{"error":"Discover API is no longer available"}`. No batch written; run marked `failed` with that message.                                                          |
| Watchlist | company `https://www.linkedin.com/company/bright-data`, direct datasets v3 | **Passed.** Trigger returned snapshot `sd_mup1s6a41cdj81nogn`; 4 × `running` then `ready` (about 40 s); 3 records downloaded and imported: 2 accepted, 1 rejected by the campaign's 30-day post-age policy. Batch `completed_with_errors`. |
| Post URL  | one post from the watchlist result, via `pipelines linkedin_posts --json`  | **Passed.** 1 record collected and imported; 1 accepted; batch `completed`.                                                                                                                                                                |

Records spent: about 4 (3 watchlist + 1 post URL). The first attempt's watchlist trigger returned HTTP 400 with no readable body, and the identical rerun succeeded; the cause is not known.

## Findings and changes

- **Keyword mode is unusable on the current Bright Data API** (Discover retired, HTTP 410). It fails closed with a clear message. **Follow-up (same day):** the owner chose to remove it. The mode, its UI option, and `discover` on the CLI allowlist are gone; native code rejects keyword requests.
- Live records carry `user_name` (display name) as well as `user_id` (slug). Mapping now prefers `user_name` for the author name.
- CLI errors now keep the `Error: …` line together with `Status: …` (previously only `Status: 410` reached the run history).
- Direct-API errors now include a plain-text or non-standard JSON body.
- Sanitized live captures added: `fixtures/live_cli_pipelines_linkedin_posts.json`, `fixtures/live_direct_snapshot_company.json`, `fixtures/live_direct_trigger.json` (public posts by the Bright Data company page; only fields the mapping reads; text truncated). Tests replay them through the mapping and the mock HTTP server.
- Progress, 409 and 400 fixtures remain provisional (documented shapes); the live run did not hit a 409.

## Not verified

- Profile (person) watchlist discovery: only a company page was tested.
- The app's own UI toggle and buttons against the live API: the harness drives the same native code paths, not the Tauri window.
- Cancel against a live snapshot.
