# Bright Data fixtures

Every file here is **provisional**: built from Bright Data's documented sample
responses and the cited `brightdata/cli` source, not from live captures. All
personal data (names, profile slugs, post ids) is synthetic. Each JSON file
carries `"_provisional": true`, a `_source` note, and the payload under
`body` (plus `status` for HTTP error fixtures).

Replace them with real, sanitized captures after the owner signs off
`docs/security/brightdata-connector-review.md` and the first live smoke run
(plan step 13). Remove the `_provisional` markers then.

| File                                                  | Shape                                                                                                       | Source                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `cli_version.json`                                    | `brightdata --version` stdout                                                                               | CLI `src/index.ts`                                                 |
| `cli_pipelines_linkedin_posts.json`                   | `pipelines linkedin_posts <url> --json` stdout (array, nulls stripped, includes a `dead_page` error record) | CLI `src/commands/dataset.ts`; docs "Scrape LinkedIn posts by URL" |
| `direct_trigger.json`                                 | `POST /datasets/v3/trigger` 200                                                                             | docs "async requests"                                              |
| `direct_progress_running.json` / `_ready` / `_failed` | `GET /datasets/v3/progress/{id}`                                                                            | docs "async requests"                                              |
| `direct_snapshot_discover.json`                       | `GET /datasets/v3/snapshot/{id}?format=json` 200                                                            | docs "Discover LinkedIn posts by profile/company URL"              |
| `direct_snapshot_not_ready_409.json`                  | snapshot 409 (not ready)                                                                                    | simstudioai/sim `download_snapshot.ts`                             |
| `direct_error_400.json`                               | terminal 400                                                                                                | brightdata-mcp `server.js`                                         |

## Live captures (2026-10-01)

`live_*.json` files are sanitized captures from the first live smoke run
(`docs/verification/2026-10-01-brightdata-live-smoke.md`): public posts by the
Bright Data company page, only the fields the mapping reads, text truncated.
They have no `_provisional` marker. The provisional files above stay for shapes
the live run did not hit (409, 400, failed progress, dead-page records).
Keyword `discover` was retired upstream (HTTP 410); keyword mode and its
fixture were removed.
