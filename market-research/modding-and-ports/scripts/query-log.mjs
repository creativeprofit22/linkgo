#!/usr/bin/env node
// Writes data/derived/<phase>/query-log.csv: one row per search attempt in the
// run log plus one "unrun" row per planned query never attempted (so Wave B
// cut-offs are listed, not hidden). No URLs or query strings with handles:
// the query text is the frozen-list text, which names no person.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { expandMatrix } from "./build-queries.mjs";
import { CONFIG_DIR, derivedDir, rawDir, toCsv } from "./lib/paths.mjs";
import {
  loadWaves,
  readRunLog,
  searchAttempts,
  unrunQueries,
} from "./lib/search-runs.mjs";

export const COLUMNS = [
  "id",
  "attempt",
  "kind",
  "platform",
  "theme",
  "intent",
  "hypothesis",
  "wave",
  "status",
  "errorClass",
  "durationMs",
  "startedAt",
  "rawResults",
  "onsiteResults",
  "offsiteDropped",
  "emptySite",
];

export function buildQueryLog(attempts, unrun) {
  const rows = attempts.map((r) => ({ ...r, emptySite: r.emptySite ? 1 : 0 }));
  for (const q of unrun) {
    rows.push({
      id: q.id,
      attempt: 0,
      kind: q.kind ?? "",
      platform: q.platform ?? "",
      theme: q.theme ?? "",
      intent: q.intent ?? "",
      hypothesis: q.hypothesis ?? "",
      wave: q.wave,
      status: "unrun",
      errorClass: "",
      durationMs: "",
      startedAt: "",
      rawResults: "",
      onsiteResults: "",
      offsiteDropped: "",
      emptySite: "",
    });
  }
  return rows;
}

/**
 * Queries and waves from a later phase's frozen list (e.g.
 * config/phase3-queries.json: {queries: [{id, group, platform?, query}]}),
 * so its log is not padded with the Phase 2 matrix as "unrun".
 */
export function frozenListContext(file) {
  const list = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(list.queries)) throw new Error(`${file}: queries missing`);
  const queries = list.queries.map((q) => ({
    id: q.id,
    query: q.query,
    kind: "frozen",
    platform: q.platform ?? "",
    theme: q.group ?? "",
  }));
  const waves = new Map(queries.map((q) => [q.id, "frozen"]));
  return { queries, waves };
}

export function loadContext(
  phase,
  { configDir = CONFIG_DIR, dataDir, queriesFile } = {},
) {
  const matrix = JSON.parse(
    fs.readFileSync(path.join(configDir, "query-matrix.json"), "utf8"),
  );
  const { queries, waves } = queriesFile
    ? frozenListContext(queriesFile)
    : { queries: expandMatrix(matrix), waves: loadWaves(configDir) };
  const rawRoot = rawDir(phase, ...(dataDir ? [dataDir] : []));
  const entries = readRunLog(path.join(rawRoot, "run-log.jsonl"));
  const attempts = searchAttempts({
    entries,
    rawRoot,
    queries,
    waves,
    platforms: matrix.platforms,
  });
  return { matrix, queries, waves, attempts, entries, rawRoot };
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      phase: { type: "string", default: "02-public-web" },
      queries: { type: "string" },
    },
  });
  const { queries, waves, attempts } = loadContext(values.phase, {
    queriesFile: values.queries,
  });
  const unrun = unrunQueries(attempts, waves, queries);
  const rows = buildQueryLog(attempts, unrun);
  const outDir = derivedDir(values.phase);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "query-log.csv");
  fs.writeFileSync(outPath, toCsv(COLUMNS, rows), "utf8");
  const ok = attempts.filter((r) => r.status === "ok").length;
  const byWave = {};
  for (const q of unrun) byWave[q.wave] = (byWave[q.wave] ?? 0) + 1;
  process.stdout.write(
    `attempts: ${attempts.length} (ok ${ok})\nunrun: ${unrun.length} ${JSON.stringify(byWave)}\nfile: ${outPath}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
