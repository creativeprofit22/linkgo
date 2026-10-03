#!/usr/bin/env node
// Writes data/derived/<phase>/fetch-rates.csv: fetch success and usable-page
// rates for the deep sample, by method (`scrape` or the pipeline type).
// Inputs: run-log.jsonl (scrape/pipeline entries) and a coding table in the
// phase's derived folder (`--coding`, default deep-sample-coding.csv; columns
// recordId, method, usable = yes|no). Deep-sample item ids follow
// `ds-<method>-<recordId>` (scripts/sample-deep.mjs).
//   items          distinct items attempted
//   attempts       run-log attempts (retries included)
//   ok             items whose last attempt succeeded
//   okWithRecords  ok items that returned >= 1 record
//   failed         items whose last attempt failed
//   failedByClass  failed items by error class, "class:n;..."
//   coded          items present in the coding table
//   usable         coded items marked usable
//   okRate, usableRate  ok / items and usable / items (0-1, 3 dp)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseCsv } from "./lib/csv.mjs";
import { derivedDir, rawDir, toCsv } from "./lib/paths.mjs";
import { readRunLog } from "./lib/search-runs.mjs";

export const COLUMNS = [
  "method",
  "items",
  "attempts",
  "ok",
  "okWithRecords",
  "failed",
  "failedByClass",
  "coded",
  "usable",
  "okRate",
  "usableRate",
];

export const ITEM_ID = /^ds-([a-z][a-z_]*)-([0-9a-f]{16})$/;

/** Method of a run-log entry: "scrape" or the pipeline type. */
export function methodOf(entry) {
  if (entry.kind === "scrape") return "scrape";
  if (entry.kind !== "pipeline") return null;
  const args = Array.isArray(entry.args) ? entry.args : [];
  const sep = args.indexOf("--");
  return sep >= 0 && typeof args[sep + 1] === "string"
    ? args[sep + 1]
    : "pipeline";
}

const rate = (n, d) => (d > 0 ? (n / d).toFixed(3) : "");

export function buildFetchRates(entries, coding) {
  const items = new Map();
  for (const entry of entries) {
    const method = methodOf(entry);
    const match = ITEM_ID.exec(entry.id ?? "");
    if (!method || !match) continue;
    const key = `${method}\u0000${match[2]}`;
    const prev = items.get(key);
    items.set(key, {
      method,
      recordId: match[2],
      attempts: (prev?.attempts ?? 0) + 1,
      last: entry,
    });
  }
  const codingByKey = new Map(
    coding.map((c) => [`${c.method}\u0000${c.recordId}`, c]),
  );
  const table = new Map();
  for (const item of items.values()) {
    let t = table.get(item.method);
    if (!t) {
      t = {
        method: item.method,
        items: 0,
        attempts: 0,
        ok: 0,
        okWithRecords: 0,
        failed: 0,
        classes: {},
        coded: 0,
        usable: 0,
      };
      table.set(item.method, t);
    }
    t.items++;
    t.attempts += item.attempts;
    if (item.last.status === "ok") {
      t.ok++;
      if ((item.last.recordCount ?? 0) > 0) t.okWithRecords++;
    } else {
      t.failed++;
      const cls = item.last.errorClass || item.last.status || "unknown";
      t.classes[cls] = (t.classes[cls] ?? 0) + 1;
    }
    const code = codingByKey.get(`${item.method}\u0000${item.recordId}`);
    if (code) {
      t.coded++;
      if (String(code.usable).toLowerCase() === "yes") t.usable++;
    }
  }
  const rows = [...table.values()].sort((a, b) =>
    a.method < b.method ? -1 : 1,
  );
  const total = {
    method: "all",
    items: 0,
    attempts: 0,
    ok: 0,
    okWithRecords: 0,
    failed: 0,
    classes: {},
    coded: 0,
    usable: 0,
  };
  for (const r of rows) {
    for (const k of [
      "items",
      "attempts",
      "ok",
      "okWithRecords",
      "failed",
      "coded",
      "usable",
    ])
      total[k] += r[k];
    for (const [c, n] of Object.entries(r.classes))
      total.classes[c] = (total.classes[c] ?? 0) + n;
  }
  return [...rows, total].map(({ classes, ...r }) => ({
    ...r,
    failedByClass: Object.entries(classes)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([c, n]) => `${c}:${n}`)
      .join(";"),
    okRate: rate(r.ok, r.items),
    usableRate: rate(r.usable, r.items),
  }));
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      phase: { type: "string", default: "02-public-web" },
      coding: { type: "string", default: "deep-sample-coding.csv" },
    },
  });
  if (path.basename(values.coding) !== values.coding)
    throw new Error("--coding must be a file name in the derived folder");
  const entries = readRunLog(path.join(rawDir(values.phase), "run-log.jsonl"));
  const outDir = derivedDir(values.phase);
  const codingPath = path.join(outDir, values.coding);
  const coding = fs.existsSync(codingPath)
    ? parseCsv(fs.readFileSync(codingPath, "utf8"))
    : [];
  const rows = buildFetchRates(entries, coding);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "fetch-rates.csv");
  fs.writeFileSync(outPath, toCsv(COLUMNS, rows), "utf8");
  for (const r of rows)
    process.stdout.write(
      `${r.method}: items ${r.items}, ok ${r.ok}, usable ${r.usable}\n`,
    );
  process.stdout.write(`file: ${outPath}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
