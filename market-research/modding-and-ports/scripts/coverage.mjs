#!/usr/bin/env node
// Writes data/derived/<phase>/coverage.csv from the final attempt of each
// search query: by platform, theme, intent, wave and hypothesis, plus "all".
//   planned        queries in the wave plans for that slice
//   run            queries attempted at least once
//   ok             final attempt status ok
//   withOnsite     ok queries with >= 1 on-site result
//   onsiteResults  on-site result rows (protocol section 5.3 applied)
//   offsiteDropped off-site result rows dropped
//   uniqueRecords  distinct record ids among the on-site results
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadContext } from "./query-log.mjs";
import { derivedDir, toCsv } from "./lib/paths.mjs";
import { finalAttempts } from "./lib/search-runs.mjs";

export const COLUMNS = [
  "dimension",
  "value",
  "planned",
  "run",
  "ok",
  "withOnsite",
  "onsiteResults",
  "offsiteDropped",
  "uniqueRecords",
];

const ORDER = [
  "all",
  "wave",
  "kind",
  "platform",
  "theme",
  "intent",
  "hypothesis",
];

function slices(q) {
  const out = [
    ["all", "all"],
    ["wave", q.wave],
    ["kind", q.kind],
  ];
  if (q.kind === "matrix") {
    out.push(
      ["platform", q.platform],
      ["theme", q.theme],
      ["intent", q.intent],
    );
  }
  if (q.kind === "disconfirmation") out.push(["hypothesis", q.hypothesis]);
  return out;
}

/** `planned` = [{id, kind, platform, theme, intent, hypothesis, wave}]. */
export function buildCoverage(attempts, planned) {
  const table = new Map();
  const cell = (dimension, value) => {
    const key = `${dimension}\u0000${value}`;
    let c = table.get(key);
    if (!c) {
      c = {
        dimension,
        value,
        planned: 0,
        run: 0,
        ok: 0,
        withOnsite: 0,
        onsiteResults: 0,
        offsiteDropped: 0,
        records: new Set(),
      };
      table.set(key, c);
    }
    return c;
  };
  for (const q of planned) for (const [d, v] of slices(q)) cell(d, v).planned++;
  for (const a of finalAttempts(attempts)) {
    for (const [d, v] of slices(a)) {
      const c = cell(d, v);
      c.run++;
      if (a.status !== "ok") continue;
      c.ok++;
      if (a.onsiteResults > 0) c.withOnsite++;
      c.onsiteResults += a.onsiteResults;
      c.offsiteDropped += a.offsiteDropped;
      for (const id of a.recordIds) c.records.add(id);
    }
  }
  return [...table.values()]
    .sort(
      (a, b) =>
        ORDER.indexOf(a.dimension) - ORDER.indexOf(b.dimension) ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    )
    .map(({ records, ...c }) => ({ ...c, uniqueRecords: records.size }));
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { phase: { type: "string", default: "02-public-web" } },
  });
  const { queries, waves, attempts } = loadContext(values.phase);
  const byId = new Map(queries.map((q) => [q.id, q]));
  const planned = [...waves.entries()].map(([id, wave]) => ({
    ...byId.get(id),
    wave,
  }));
  const rows = buildCoverage(attempts, planned);
  const outDir = derivedDir(values.phase);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "coverage.csv");
  fs.writeFileSync(outPath, toCsv(COLUMNS, rows), "utf8");
  const all = rows.find((r) => r.dimension === "all");
  process.stdout.write(`${JSON.stringify(all ?? {})}\nfile: ${outPath}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
