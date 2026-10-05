# 08 — Community And Channels

Status: **complete, 2026-10-04; Verifier pass applied (section 8).** Market
research only, not Linkgo app code.

| Field       | Value                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Phase       | 8 of 11                                                                                                                        |
| Hypotheses  | H12 Discord is where this audience gathers and is a viable channel                                                             |
| Bright Data | `search`; `scrape` of Disboard tag pages and forum threads; `reddit_posts`, `youtube_videos`, `tiktok_posts`, `x_posts`        |
| Team        | Lead as Collector, A1 Analysts (`owl`, 3 sessions), lead A2 (directory extraction), 1 Disconfirmer (`owl`), 1 Verifier (`owl`) |
| Depends on  | Phases 1–3, 7                                                                                                                  |
| Rules       | `01-research-protocol.md` §1.2–1.3 and §10 "Phase 8 pre-registration addendum" (before any request)                            |
| Raw data    | `data/raw/08-community/` (git-ignored; holds URLs)                                                                             |
| Derived     | `data/derived/08-community/` (no URLs, no names or handles)                                                                    |

Discord content is mostly private and unindexed. No server was joined and no
invite was followed; only public directory pages and public posts were read.

**Citations.** `[r:<id>/<method>]` is a stored record (16-hex record id).
Every on-topic coded record has a verbatim quote in `venue-coding.csv`; all 26
were checked mechanically against the stored text (26 of 26 found). `[q:<id>]`
is a query in `scripts/config/phase8-queries.json`.

---

## Bottom Line

- **Discord is the most-cited place to gather.** In the 26 on-topic sampled
  records it gets 11 of 25 venue citations (44%), almost three times the
  next venue. Stored Phase 2 records, counted mechanically, agree: Discord
  29%, Reddit 19%, forums 17%.
- **The lead depends on YouTube creators.** 5 of the 11 Discord citations
  are YouTubers sending viewers to a Discord. Without YouTube, Discord
  still leads, but with 30% against 20%.
- **Public Discord modding servers are many and small.** 10 Disboard tag
  pages list 58 active, modding-related servers. The biggest shows 1,908
  and the median 35. That number is probably people online, not total
  members.
- **The critics are on forums.** All 3 records that argue against Discord
  are forum threads. They say Discord is a poor home for mod files, and one
  ranks the official forum first.
- **X and TikTok show no Discord pull.** Neither cites Discord. X posts
  recruit modders directly on X.
- **H12 verdict: Partially supported** (confidence low). The "most cited"
  part holds. "Room to grow" rests on one directory and an unclear number.

---

## 1. Where The Audience Gathers

`venue-coding.csv` — 46 records coded (44 frozen sample, 2 Disconfirmer
extra), 42 usable, **26 on-topic** across 5 platforms.

| Platform | Sampled | On-topic | Venue citations in on-topic records                      |
| -------- | ------- | -------- | -------------------------------------------------------- |
| Reddit   | 16      | 7        | Discord 2, Reddit 1, Steam 1                             |
| YouTube  | 8       | 6        | Discord 5                                                |
| X        | 8       | 5        | X 2, other 1                                             |
| Forum    | 10      | 6        | Discord 4, other 3, forum 2, Reddit 2, Steam 1, X 1      |
| TikTok   | 4       | 2        | none                                                     |
| **All**  | **46**  | **26**   | **Discord 11, other 4, Reddit 3, X 3, Steam 2, forum 2** |

"Other" covers mod hubs such as a game's official ModHub. 16 of the 26
on-topic records name no venue at all; most ask "where should I learn
modding?" without an answer in the stored text.

**Corpus test (no new spend).** `corpus-venues-02-public-web.csv` counts 82
stored Phase 2 records with fixed patterns (a venue name plus a gathering
word in one sentence): Discord 14 records (29%), Reddit 9 (19%), forums 8
(17%), YouTube 4 (8%). Discord stays first (29%) when a record citing its
own platform is excluded.

**Sensitivity:**

| Check                                    | Discord share | Next venue     |
| ---------------------------------------- | ------------- | -------------- |
| All on-topic citations                   | 11/25 (44%)   | other 4 (16%)  |
| Without YouTube (creator self-promotion) | 6/20 (30%)    | other 4 (20%)  |
| Without self-citations (e.g. X on X)     | 11/20 (55%)   | other 4 (20%)  |
| Phase 2 corpus, mechanical count         | 14 (29%)      | Reddit 9 (19%) |

## 2. Discord Public Footprint

`directory-servers.csv` — extracted mechanically from 10 Disboard tag pages
(page 1, default order). Server names are not stored; each server is a hash
of its public id.

| Tag            | Listed | Active (bump ≤ 30 days) | Modding-related | Active + modding | Highest number shown |
| -------------- | ------ | ----------------------- | --------------- | ---------------- | -------------------- |
| modding        | 24     | 24                      | 24              | 24               | 1,908                |
| gamedev        | 24     | 24                      | 24              | 24               | 1,877                |
| minecraft-mods | 16     | 7                       | 16              | 7                | 510                  |
| skyrim         | 24     | 24                      | 2               | 2                | 727                  |
| emulation      | 24     | 11                      | 2               | 1                | 3,958                |
| roblox         | 24     | 23                      | 0               | 0                | 2,190                |
| game-modding   | 4      | 0                       | 4               | 0                | 47                   |
| fan-games      | 3      | 1                       | 0               | 0                | 19                   |
| romhacking     | 0      | —                       | —               | —                | —                    |
| decompilation  | 0      | —                       | —               | —                | —                    |

143 servers in total, all distinct. Of the 58 active modding-related
servers, the number shown has a median of 35; 4 are above 1,000 and none
reaches 10,000. 88 of the 143 were bumped within the last day, so the
default order rewards frequent bumping.

**Measurement limit (addendum item 10).** Each card shows one unlabeled
number. One card's own description says "2000+ member community" while its
number is 334, so the number is most likely members online. A small number
therefore does not prove a small server.

## 3. Community Patterns That Work

From the stored records only (not a full study):

- **Discord as the help desk for a mod or modpack.** Creators send viewers
  to their server for support: "Join The Discord Support Community"
  `[r:08b048fbc6746c30/youtube_videos]`; "join the All the Mods Discord
  server today" `[r:085030cd0c236e16/youtube_videos]`.
- **Discord for team work.** "We'll be talking on Discord mostly"
  `[r:0e3fc774a332a512/reddit_posts]`; a fan-game maker joined the game's
  verified server for help `[r:3ce7371a855f858a/reddit_posts]`.
- **Recruiting in public.** X posts look for modders in the open: "Looking
  for modders to create my vision" `[r:102126171e3faab9/x_posts]`.
- **Forums for lasting knowledge.** One forum thread ranks the official
  forum first as "the best place to discuss topics in a sorted and coherent
  manner" `[r:408e120fccbffbde/scrape]`.

## 4. Channel Tiers

Method from `00-context-and-approach.md` (visibility plus fetchability), with
fit added from the coding.

| Channel | Visibility (on-topic / sampled) | Fetchability                                 | Fit                                                | Tier                           |
| ------- | ------------------------------- | -------------------------------------------- | -------------------------------------------------- | ------------------------------ |
| Discord | Most cited destination (11)     | Directory pages only; servers not readable   | Where creators send people for help and team work  | 1 to be present; 3 to research |
| Reddit  | 7/16                            | 16/16 fetched with comments                  | Where people ask "where do I learn modding"        | 1                              |
| YouTube | 6/8                             | 8/8 with transcript                          | Creators funnel viewers into Discord               | 1                              |
| Forums  | 6/10                            | 6 of 10 usable (4 blocked, empty, challenge) | Long-form knowledge; the critics of Discord        | 2                              |
| X       | 5/8                             | 8/8                                          | Recruiting and announcements; no Discord citations | 2                              |
| TikTok  | 2/4                             | 4/4, but only 2 of 4 queries returned posts  | Showcases; no venue citations                      | 3                              |

## 5. Moderation And Safety Load

Not measured directly: no server was joined, and no record describes
moderating a modding server. What applies comes from Phase 7
(`07-legal-ip-and-safety.md`): Discord's terms require users to be at least
13, the UK Online Safety Act codes require children's risk assessments, and
the Phase 7 risk register rates hosting fan games and mods as high
likelihood. A Discord server that shares mod files inherits that takedown
risk. One record warns that modding servers lose knowledge over time:
"knowledge management is fucking awful on discord"
`[r:6752f99eebb5fe51/scrape]`.

## 6. Disconfirming Evidence

- **Three forum threads argue against Discord.** "Steam Workshop and Discord
  are not acceptable hubs for community content"
  `[r:2a470d520fa17ecf/scrape]`; "Why do Mod Authors insist on hosting their
  stuff on Discord" `[r:4d1acb1516924dd6/scrape]`; the official forum ranked
  first `[r:408e120fccbffbde/scrape]`.
- **YouTube inflates the count.** 5 of 11 Discord citations are creators
  promoting their own servers (section 1 sensitivity).
- **Disboard can only show Discord.** A Discord directory cannot show
  whether people gather elsewhere, so it bears on "room to grow" only.
- **Most on-topic records name no venue** (16 of 26), so the citation
  counts rest on 10 records.
- **Disconfirmer extra search** (`p8-x01`–`p8-x04`): 2 forum threads sampled,
  one empty and one a browser-challenge page; no new evidence either way.
- **Disconfirmer recodes:** none proposed.

## 7. Verdict

| Test (addendum item 9)                                                      | Result                                                            | Met?                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| Discord has the largest citation share                                      | 44% vs 16% next; corpus 29% vs 19%                                | Yes                                 |
| Discord leads in ≥ 2 of 4 sampled platforms                                 | Reddit (2 vs 1) and YouTube (5 vs 0); not X, not TikTok           | Yes (2 of 4)                        |
| ≥ 10 active modding-related servers listed                                  | 58                                                                | Yes                                 |
| Fewer than half of them large (≥ 10,000)                                    | 0 of 58 show ≥ 10,000, but the number is probably online count    | Yes as measured; weak               |
| Each part from ≥ 2 source types                                             | Most cited: Reddit, YouTube, scrapes; room to grow: Disboard only | Most cited yes; room to grow **no** |
| Contradicted (another venue ≥ 5 points ahead, or most active servers large) | Neither                                                           | No                                  |
| §1.2 minimum (20 on-topic, 3 platforms, 2 source types)                     | 26 on-topic, 5 platforms, 5 source types                          | Yes                                 |
| §1.2 support share                                                          | 7 support (27%), 3 contradict (12%), 16 neutral                   | Below 60%                           |

**H12: Partially supported** (confidence low). The "most cited" sub-claim
holds and survives every sensitivity check. "Room to grow" is not
established: it comes from one directory, and its size number is unclear.
Lean: Discord is the default place modding communities point to, but its
footprint can only be seen from the outside.

## 8. Verifier Report

A fresh `owl` Verifier, given only this file, the protocol, the derived data
and the stored text, checked it on 2026-10-04.

| Check                                      | Result                                     |
| ------------------------------------------ | ------------------------------------------ |
| Quoted phrases checked against stored text | 6 of 6 confirmed                           |
| Numbers recomputed with a CSV parser       | 8 of 8 confirmed                           |
| Independent re-code of 6 on-topic records  | 5 of 6 agree; 1 recode proposed (below)    |
| Verdict against addendum item 9 and §1.2   | Partially supported confirmed              |
| Spend                                      | $0.31 of $0.60, 10 settled entries, 0 open |
| URLs, names or handles in derived CSVs     | None found                                 |

**Recode rejected by the lead, with evidence.** The Verifier proposed moving
`632da8f32d7fac2b` from neutral to supports because its description lists
"Discord:" with an invite link under a "SOCIALS" heading. The codebook says
a bare link list is not a citation unless the text invites people to join,
ask or share there, and the stored description and transcript contain no
such invitation. The same rule was applied to every YouTube record (for
example, `0d83dc917a139679` counts only because its transcript tells viewers
to get help on Discord). The code stays neutral, and no other edits were
needed. Earlier lead corrections are logged in
`data/raw/08-community/work/lead-corrections.json`.

## 9. Run Log And Spend

| Command          | Attempts | OK  | Notes                                                                 |
| ---------------- | -------- | --- | --------------------------------------------------------------------- |
| `search`         | 48       | 37  | 38 queries (34 frozen + 4 Disconfirmer); `p8-g14` blocked after retry |
| `scrape`         | 20       | 19  | 10 Disboard pages (2 tags empty), 10 forum threads (1 blocked)        |
| `reddit_posts`   | 16       | 16  |                                                                       |
| `youtube_videos` | 8        | 8   |                                                                       |
| `tiktok_posts`   | 4        | 4   | Quota 8: only 2 TikTok queries returned post URLs                     |
| `x_posts`        | 8        | 8   | 4 ran in a second batch after the first hit its ceiling               |

Search attempts include retries and items stopped by a batch ceiling and
rerun. Spend: **$0.31 of $0.60** by ledger estimate, 10 entries, all
settled. The zone meter books searches late, so the last batches show $0.
The runner reported $5.21 spent study-wide against the $6.04 cap.

**Process notes.** The lead ran the collection (no `bee` Collector). One
batch was started with a shell `&` and a mis-built plan; it was stopped
before it spent, and the rerun used the spend lock. Derived files:
`venue-coding.csv`, `directory-servers.csv`,
`corpus-venues-02-public-web.csv`, `query-log.csv`, `fetch-rates.csv`, and
the sample, directory and extra manifests. Lead corrections are logged in
`data/raw/08-community/work/lead-corrections.json`.
