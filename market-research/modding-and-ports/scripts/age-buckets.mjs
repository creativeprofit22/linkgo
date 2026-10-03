#!/usr/bin/env node
// Turns analyst-supplied self-stated ages into bucket counts for
// data/derived/<phase>/age-signals.csv (01-research-protocol.md section 10,
// Phase 3 addendum item 2). Only counts are written: no text, no handles.
//
// Input (git-ignored, e.g. data/raw/03-audience/work/age-input.json):
//   [{ "recordId": "<16 hex>", "platform": "reddit", "method": "reddit_posts",
//      "ages": [16, 24], "unclear": 1 }]
// `ages` holds one integer per distinct commenter who stated an age;
// `unclear` counts commenters whose stated age could not be pinned to a
// bucket. Anything other than integers 5–99 is rejected.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { derivedDir, toCsv } from "./lib/paths.mjs";

export const BUCKETS = Object.freeze([
  { column: "age14orUnder", min: 5, max: 14 },
  { column: "age15to17", min: 15, max: 17 },
  { column: "age18to21", min: 18, max: 21 },
  { column: "age22to29", min: 22, max: 29 },
  { column: "age30plus", min: 30, max: 99 },
]);

export const COLUMNS = [
  "recordId",
  "platform",
  "method",
  ...BUCKETS.map((b) => b.column),
  "unclear",
  "total",
];

const RECORD_ID = /^[0-9a-f]{16}$/;
const TOKEN = /^[a-z][a-z0-9_]*$/;

export function bucketOf(age) {
  if (!Number.isInteger(age) || age < 5 || age > 99) {
    throw new Error(`age must be an integer 5-99, got ${JSON.stringify(age)}`);
  }
  return BUCKETS.find((b) => age >= b.min && age <= b.max).column;
}

/** Validates one input entry and returns its CSV row. */
export function rowFor(entry) {
  if (!entry || typeof entry !== "object") throw new Error("entry required");
  const { recordId, platform, method, ages = [], unclear = 0 } = entry;
  if (!RECORD_ID.test(String(recordId))) throw new Error("bad recordId");
  if (!TOKEN.test(String(platform)))
    throw new Error(`bad platform (${recordId})`);
  if (!TOKEN.test(String(method))) throw new Error(`bad method (${recordId})`);
  if (!Array.isArray(ages))
    throw new Error(`ages must be an array (${recordId})`);
  if (!Number.isInteger(unclear) || unclear < 0) {
    throw new Error(`unclear must be a non-negative integer (${recordId})`);
  }
  const row = { recordId, platform, method, unclear };
  for (const b of BUCKETS) row[b.column] = 0;
  for (const age of ages) row[bucketOf(age)] += 1;
  row.total = ages.length + unclear;
  return row;
}

/** Rows sorted by recordId then method; duplicate (recordId, method) rejected. */
export function buildAgeSignals(entries) {
  if (!Array.isArray(entries)) throw new Error("input must be a JSON array");
  const seen = new Set();
  const rows = entries.map((e) => {
    const row = rowFor(e);
    const key = `${row.recordId}/${row.method}`;
    if (seen.has(key)) throw new Error(`duplicate entry ${key}`);
    seen.add(key);
    return row;
  });
  return rows.sort((a, b) =>
    a.recordId === b.recordId
      ? a.method < b.method
        ? -1
        : 1
      : a.recordId < b.recordId
        ? -1
        : 1,
  );
}

/** Column totals across rows (for the report). */
export function totals(rows) {
  const out = { records: rows.length };
  for (const c of [...BUCKETS.map((b) => b.column), "unclear", "total"]) {
    out[c] = rows.reduce((s, r) => s + r[c], 0);
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      phase: { type: "string", default: "03-audience" },
      in: { type: "string" },
    },
  });
  if (!values.in) throw new Error("--in <age-input.json> required");
  const rows = buildAgeSignals(JSON.parse(fs.readFileSync(values.in, "utf8")));
  const outDir = derivedDir(values.phase);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "age-signals.csv");
  fs.writeFileSync(outPath, toCsv(COLUMNS, rows), "utf8");
  process.stdout.write(`${JSON.stringify(totals(rows))}\nfile: ${outPath}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
