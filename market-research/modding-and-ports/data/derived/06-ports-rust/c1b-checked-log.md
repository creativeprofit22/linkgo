# C1b checked-port log (Phase 6, port inventory part B)

Generated 2026-10-03 from `data/raw/06-ports-rust/pipeline/ds-github_repository_file-<recordId>.json` (README text only; no network calls, no spend).

**Caveat:** `latest_update` appears to be the date of the last commit touching the README file, not the repo's last commit (e.g. OpenTTD `last_feature` = a doc commit). "stalled" here means README untouched before 2025-10-03 with nothing in the README indicating activity; repo activity may be later.

## Per record

| recordId         | project              | README lines      | latest_update | stars | own-files finding                          | last_feature (commit touching README)                                            |
| ---------------- | -------------------- | ----------------- | ------------- | ----- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| 02901ce343ae177a | Ship of Harkinian    | 99                | 2026-09-28    | 5518  | yes                                        | publish appimage unzipped, store to ~/.local/share/soh when SHIP_HOME unset (#72 |
| 25297bc0d5d8aeee | 2 Ship 2 Harkinian   | 86                | 2026-09-25    | 2280  | yes                                        | Update build doc and readme                                                      |
| bafbc2cad6c9e3b1 | SpaghettiKart        | 104               | 2026-09-16    | 2386  | yes                                        | Revise Discord section to include website link (#759)                            |
| 103f73856f20b64a | sm64ex               | 30                | 2021-11-25    | 1841  | unclear                                    | Merge pull request #440 from ChaosEx/master                                      |
| 483f7cab143c77f1 | Render96ex           | 26                | 2021-08-01    | 370   | unclear                                    | Update README.md                                                                 |
| 710fbefc8d26f91f | N64: Recompiled      | 59                | 2024-12-24    | 8186  | unclear                                    | Implement nrm filename toml input, renaming list, trace mode, and context dumpin |
| 8f9731e110ea47a3 | Zelda 64: Recompiled | 153               | 2026-09-25    | 7339  | yes                                        | Formatting changes in README (#731)                                              |
| af07bf58f631352c | OpenGOAL             | 219               | 2026-03-22    | 3542  | yes                                        | docs: README pass, add alternative editor documentation (Zed) (#4137)            |
| c3502d824c3fecbd | OpenMW               | 112               | 2026-04-13    | 6594  | yes                                        | Bump us up to 0.52                                                               |
| e388c02c0721795e | OpenRCT2             | 175               | 2026-09-20    | 16273 | yes                                        | Adjust sponsor section (#27167)                                                  |
| 6c946e26b0cbdabf | OpenTTD              | 208               | 2025-05-04    | 8326  | no                                         | Doc: Tweak documentation for consistency. (#14211)                               |
| ce5ad5114a40f991 | DevilutionX          | 88                | 2026-07-16    | 9783  | yes                                        | Fix mods link in README.md                                                       |
| f5250fb1cabaa8e5 | pokeemerald          | 11                | 2023-08-30    | 3523  | unclear                                    | Replaced decomp list with pret.github.io link                                    |
| 5f1c5dfdf3c36d0b | pokered              | 31                | 2024-10-09    | 4967  | unclear                                    | Renamed pokemon-asm-tools to gb-asm-tools                                        |
| 0e9bbda10ba3d5f1 | RSDKv5 Decompilation | 110               | 2025-12-18    | 561   | unclear                                    | Update README.md [skip ci] (#313)                                                |
| 8394d7491067aaa3 | OpenRCT2 (README.md) | 0 (404 dead page) | —             | —     | superseded by e388c02c0721795e (readme.md) | —                                                                                |

## Totals

- CSV rows: 23 (19 checked rows + 4 listed-term rows)
- Checked projects (distinct README records): 15
- Active (latest_update 2025-10-03..2026-10-03): 9 / 15 checked projects (Ship of Harkinian, 2 Ship 2 Harkinian, SpaghettiKart, Zelda 64: Recompiled, OpenGOAL, OpenMW, OpenRCT2, DevilutionX, RSDKv5 Decompilation)
- Method counts (all rows): {"source-port":9,"tooling":1,"static-recompilation":2,"decomp":4,"remake":3,"decomp-no-pc-build":2,"unclear":1,"boundary":1}
- Method counts (checked rows): {"source-port":7,"tooling":1,"static-recompilation":2,"decomp":4,"remake":3,"decomp-no-pc-build":2}
- own_files counts (checked rows): {"yes":12,"unclear":6,"no":1}
- own_files counts (checked projects): {"yes":8,"unclear":6,"no":1}
- README missing: none (OpenRCT2 README.md 404 recovered via readme.md retry e388c02c0721795e). Rust record bfccac84a1d7883f ignored (other collector).
- Listed-term rows (not fetched, per phase6-sources.json): harbour masters, re3, revc, sonic mania plus.

## Judgement notes

- original_platform is from the README where stated (N64, PS2 copy, .gb/.gba ROMs), otherwise general knowledge.
- OpenTTD, OpenRCT2, OpenMW, DevilutionX and RSDKv5 target games already released on PC; kept as remake/source-port/decomp per item 3 and flagged in notes.
- OpenGOAL classed decomp (README calls it a decompilation project; native PC build exists). SoH, 2Ship, SpaghettiKart, sm64ex, Render96ex classed source-port per the item 3 example.
- Jak II recorded in-progress (README: beta, essentially complete); Zelda 64: Recompiled Ocarina of Time recorded in-progress (README: planned, "soon").
- own_files "unclear" where the README is silent (sm64ex only implies ROM-originated assets).
