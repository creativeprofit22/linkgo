# Research Roadmap — Modding, Fan Games And Ports

Status: planned. No research has been run.
Created: 2026-10-02.
Canonical tracker: the app's Project Notes Roadmap (phases drafted for owner
approval). This file mirrors it so the research folder is self-contained.

Read `00-context-and-approach.md` first. It holds the project context, the 12
working hypotheses (H1–H12), the objectivity rules, and the methodology learned
from the reference study.

---

## 1. How Every Phase Works

### 1.1 Bright Data is the collection engine for every phase

Every phase collects its evidence through **Bright Data**, which is already
available in this build. Other web tools are a logged fallback only, used when
Bright Data cannot reach a source.

What this build actually has (checked 2026-10-02):

| Capability          | Command                                 | Use in this research                                                                                                                                                                     |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google search       | `brightdata search` (SERP API)          | Structured query matrix, `site:` queries, news search (`--type news`), country/language targeting.                                                                                       |
| Page fetch          | `brightdata scrape` (Web Unlocker)      | Full-text deep samples, competitor official pages, policies, docs, project READMEs.                                                                                                      |
| Platform extractors | `brightdata pipelines <type>`           | `reddit_posts`, `youtube_videos`, `youtube_comments`, `tiktok_posts`, `tiktok_comments`, `x_posts`, `instagram_posts`, `facebook_posts`, `crunchbase_company`, `github_repository_file`. |
| Account checks      | `brightdata budget`, `brightdata zones` | Spend tracking and confirming the search/fetch zones exist.                                                                                                                              |

Facts that shape the plan:

- The CLI is installed globally at the pinned version **0.3.7**.
- The app's own Bright Data connector is **LinkedIn-only** (post URLs and
  watchlists). It is not used for this research and is not modified.
- The API key lives in **Windows Credential Manager** (service `linkgo`), not in
  the CLI's environment. Phase 1 builds a runner that passes the key to the CLI
  only as `BRIGHTDATA_API_KEY` in the child process. **Never run
  `brightdata login`** — it writes the key to a plaintext file.
- `brightdata discover` is not used. Bright Data retired its Discover API on
  2026-10-01 (HTTP 410), per `docs/features/source-imports.md`.
- **Verified 2026-10-02 (Phase 1):** zones `cli_serp` (SERP) and
  `cli_unlocker` (Web Unlocker) exist, all 10 pipelines return records, and the
  saved key has admin rights. The account balance field shows $0 with free
  credit, so spend is metered from `budget zones` plus pipeline estimates.
  Owner cap: **$5 total**, Phase 2 $1.94, phases 3–8 $2.43, phases 9–11
  $0.48, **2** parallel Collectors, enforced by `data/spend-ledger.json`.
  Web Unlocker is blocked on YouTube and Reddit; use their pipelines. See
  `01-research-protocol.md` sections 4–6.

### 1.2 Data handling rules (all phases)

- Public pages only. No logins, no joining private groups or Discord servers to
  collect content, no bypassing paywalls or age gates.
- This audience likely includes minors. Analysed outputs never store
  usernames, handles, or profile links of individuals; quotes are short and
  anonymised. Nobody is profiled individually.
- Raw Bright Data output stays local under `data/raw/` (git-ignored). Derived,
  anonymised tables live under `data/derived/` and can be committed.
- Every request is logged in the phase's run log: command, input, timestamp,
  status, record count, and request count for cost tracking.
- No phase exceeds the spend cap the owner approves in Phase 1.

### 1.3 Sub-agent roles

Each phase uses a small team. A child agent sees none of the conversation, so
every brief must name the phase file, the hypotheses, the pre-registered
criteria, the exact data paths, and the expected output.

| Role           | Agent type           | Job                                                                                                                                                 |
| -------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead           | Main session         | Pre-registers criteria, writes briefs, merges results, writes the phase `.md`, reports roadmap status. Does not grade its own work.                 |
| Collector      | `bee`                | Runs the Bright Data runner for one assigned slice (platforms, queries, or URLs). Writes raw output and the run log. Does no analysis.              |
| Analyst        | `owl`                | Reads stored data in this folder and codes findings, each cited to a stored record ID. Read-only.                                                   |
| Disconfirmer   | `owl`                | Hunts the stored data specifically for evidence **against** each hypothesis. Can request extra neutral Bright Data queries, which a Collector runs. |
| Verifier       | `owl`, fresh context | Re-checks every claim against the cited raw records without being told the hoped-for answer. Returns Confirmed / Drop / Downgrade per claim.        |
| Script builder | `bee`                | Phase 1 only: builds and tests the runner and extraction scripts.                                                                                   |

Collectors run in parallel only within the concurrency cap set in Phase 1
(Bright Data rate limits and cost).

### 1.4 What "done" means for every phase

A phase is done only when **all** of these hold:

1. Pre-registered criteria were written before collection, and are unchanged
   or have a logged reason for each change.
2. Evidence was collected through Bright Data, and raw output plus the run log
   are stored in this folder.
3. The phase `.md` is written from that evidence. Every finding cites stored
   records. No placeholder findings remain.
4. The Disconfirmer ran, and its counter-evidence is reported in the file.
5. The Verifier ran, and every dropped or downgraded claim was removed or
   rewritten.
6. Hypothesis verdicts use only: Supported, Partially supported, Unproven,
   Contradicted.
7. Spend for the phase is recorded against the cap.

---

## 2. Phases

| #   | File                                 | Area                                          | Hypotheses      | Team size |
| --- | ------------------------------------ | --------------------------------------------- | --------------- | --------- |
| 1   | `01-research-protocol.md`            | Protocol, pre-registration, Bright Data setup | All (criteria)  | 2         |
| 2   | `02-public-web-study.md`             | Large structured public-web study             | All (signals)   | 8         |
| 3   | `03-audience-and-demographics.md`    | Who the audience really is                    | H1–H6           | 6         |
| 4   | `04-mod-hub-competitors.md`          | Nexus Mods and similar hubs                   | H3, H10, H11    | 6         |
| 5   | `05-creator-tools-and-learning.md`   | Beginner creation tools and learning paths    | H2, H5, H6, H10 | 5         |
| 6   | `06-ports-and-rust-rebuilds.md`      | PC ports, decomp projects, Rust rebuilds      | H8, H9          | 6         |
| 7   | `07-legal-ip-and-safety.md`          | IP, takedowns, dormant IP, minors' safety     | H7 (+ all risk) | 4         |
| 8   | `08-community-and-channels.md`       | Discord, community, channels                  | H12             | 5         |
| 9   | `09-market-sizing.md`                | Bottom-up market sizing                       | Scale of all    | 3         |
| 10  | `10-personas-and-positioning.md`     | Personas and the "democratizing" position     | H10, H11        | 4         |
| 11  | `11-evidence-audit-and-synthesis.md` | Claim audit, verdicts, validation plan        | H1–H12 final    | 4         |

### Phase 1 — Research protocol and Bright Data readiness

- **Goal:** lock the method before any data is collected, and prove Bright Data
  works end to end for this research.
- **Bright Data:** confirm the CLI version, key bridge, SERP and Web Unlocker
  zones, the pipelines needed, and the balance via `brightdata budget`. Run a
  small pilot of about 10 searches, 5 page fetches, and 1 run of each needed
  pipeline.
- **Team (2):** 1 Script builder (`bee`) builds the runner, logging and
  dedupe scripts, then runs the pilot. 1 Verifier (`owl`) checks that the key is
  never written or logged, the logs are complete, and the scripts match the
  protocol.
- **Owner decisions needed:** spend cap and concurrency cap.

### Phase 2 — Public-web study

- **Goal:** rebuild the reference study's large query matrix for this market,
  as the shared evidence base for phases 3–10.
- **Bright Data:** `search` for the full matrix (platforms × themes ×
  intents, including disconfirmation queries); `scrape` plus platform pipelines
  for the deep sample, fixing the reference study's failure on video and
  social pages.
- **Team (8):** 4 Collectors (`bee`), one per platform group (forums and
  communities; video and short-form; mod hubs and stores; developer and code
  sites). 2 Analysts (`owl`): one for coverage and signal counts, one for deep-
  sample reading with stance coding. 1 Disconfirmer. 1 Verifier.

### Phase 3 — Audience and demographics

- **Goal:** test who the audience really is: age, skill, players vs creators,
  ideas, learning curve, and appetite to make their own game.
- **Bright Data:** `search` for published surveys and platform demographic
  statements; `reddit_posts`, `youtube_comments`, and `tiktok_comments`
  pipelines for self-described age and skill signals in public posts.
- **Team (6):** 2 Collectors (surveys and official stats; community posts).
  2 Analysts (age and skill signals; player-vs-creator split and intent).
  1 Disconfirmer. 1 Verifier.

### Phase 4 — Mod-hub competitors

- **Goal:** map Nexus Mods and similar hubs — offering, policies, creator
  economics, beginner support — and what users say about them.
- **Bright Data:** `scrape` official pages (features, premium tiers, creator
  reward programs, policies, terms) as dated snapshots; `search` and
  `reddit_posts` for user sentiment and switching reasons.
- **Team (6):** 2 Collectors (official snapshots; user sentiment). 2 Analysts
  (feature and policy matrix; sentiment and switching reasons). 1 Disconfirmer
  (evidence that incumbents already serve beginners well). 1 Verifier.

### Phase 5 — Creator tools and learning paths

- **Goal:** map what a beginner uses today to make mods or games, where they
  get stuck, and whether existing tools already lower the barrier.
- **Bright Data:** `scrape` official docs and pricing for creation tools,
  engines, and modding toolkits; `search` plus `reddit_posts` and
  `youtube_videos` for "where do I start" and learning-curve signals.
- **Team (5):** 2 Collectors (tool snapshots; learner signals). 1 Analyst
  (tool matrix plus friction map). 1 Disconfirmer. 1 Verifier.

### Phase 6 — Ports and Rust rebuilds

- **Goal:** size and describe the porting scene (legacy and other-platform
  games brought to PC, decomp/recomp projects) and test how relevant Rust
  rebuilds are.
- **Bright Data:** `search` for port projects, Rust game rebuilds, and news;
  `scrape` project pages and READMEs; `github_repository_file` for project
  files; `reddit_posts` and `youtube_videos` for player demand.
- **Team (6):** 2 Collectors (port inventory; Rust rebuild inventory).
  2 Analysts (port demand and who uses ports; Rust relevance to this audience).
  1 Disconfirmer. 1 Verifier.

### Phase 7 — Legal, IP and safety

- **Goal:** evidence the legal and safety environment: takedowns, rights-holder
  behaviour, dormant-IP revival, platform rules, and obligations around minors.
- **Bright Data:** `search --type news` for takedown and enforcement history;
  `scrape` rights-holder content guidelines, hub terms, Discord policies, and
  child-safety rules. Not legal advice; findings are input for a lawyer.
- **Team (4):** 1 Collector. 1 Analyst (risk register). 1 Disconfirmer
  (tolerated or licensed fan projects and successful revivals). 1 Verifier.

### Phase 8 — Community and channels

- **Goal:** test where this audience gathers and whether a Discord community is
  a viable channel, and rank channels on the reference study's tier method.
- **Bright Data:** `search` for public Discord directory listings and server
  landing pages (no joining servers to collect content); `youtube_videos`,
  `tiktok_posts`, `x_posts`, and `reddit_posts` for channel activity.
- **Team (5):** 2 Collectors (Discord public footprint; other channels).
  1 Analyst (channel tiers and saturation). 1 Disconfirmer. 1 Verifier.

### Phase 9 — Market sizing

- **Goal:** bottom-up sizing per segment, with low / base / high cases and
  every input dated and sourced. Third-party market-size headlines are context
  only.
- **Bright Data:** `search` and `scrape` for public figures (hub user counts,
  download stats, Steam Workshop and engine adoption numbers);
  `crunchbase_company` for competitor funding and scale.
- **Team (3):** 1 Collector. 1 Analyst (the model). 1 Verifier (checks every
  input against its source and date).

### Phase 10 — Personas and positioning

- **Goal:** build personas from evidence only, and test the "democratizing
  modding" positioning and the play-hub vs creator-tools split.
- **Bright Data:** gap-fill only — `reddit_posts`, `youtube_comments`, and
  `search` for verbatim language the earlier phases did not capture.
- **Team (4):** 1 Collector (gap-fill). 1 Analyst (personas and positioning).
  1 Disconfirmer (red-teams the positioning). 1 Verifier.

### Phase 11 — Evidence audit and synthesis

- **Goal:** final cross-check of every claim across phases 2–10, the final
  verdict for H1–H12, an executive summary, and a plan for what public data
  cannot prove (interviews, surveys, pilots).
- **Bright Data:** re-fetch a sample of key cited URLs with `scrape` to confirm
  they are still live and unchanged, and re-date the competitor snapshots.
- **Team (4):** 1 Collector (re-fetch). 2 Verifiers, fresh and independent,
  splitting H1–H6 and H7–H12. 1 Disconfirmer red-teaming the final report.

---

## 3. Total Effort

- 11 phases, 53 sub-agent runs in total.
- The most parallel phase is Phase 2 (4 Collector slices), run at most **2 at
  once** under the owner-approved concurrency cap.
- Bright Data spend: pilot measured about $0.003 per search and $0.002 per page
  fetch (2026-10-02). The owner cap is **$5 total**; Phase 2 must use a
  stratified query subset to fit its $1.94 (see `01-research-protocol.md`
  section 6).
