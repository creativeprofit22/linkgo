#!/usr/bin/env node
// Bottom-up sizing model (01-research-protocol.md section 10, Phase 9
// addendum items 4-5). Written before any Phase 9 request.
//
//   node size-model.mjs [--phase 09-sizing]
//
// Reads data/derived/<phase>/input-register.csv. Observation rows hold the
// sourced figures; model parameter rows have quantity `param:<name>` and
// carry low / base / high plus `basis` (the observation inputIds they come
// from, `;`-separated). Parameters per segment:
//   people       addressable people (unique, de-duplicated where possible)
//   payingShare  share of those people who pay (0-1)
//   annualSpend  USD per paying person per year
//   reachShare   share reachable by the product (0-1)
//   obtainShare  share obtainable in 3 years (0-1)
//   overlapShare share of this segment already counted in another (0-1)
//
//   TAM = people x payingShare x annualSpend
//   SAM = TAM x reachShare
//   SOM = SAM x obtainShare
//   de-duplicated total = sum over segments of value x (1 - overlapShare)
//
// A parameter's grade must be A, B, C or X (X = stated assumption). Grade D
// (modelled estimates) may bound low/high but never set the base, so a D
// parameter row is rejected.
//
// Writes model-output.csv and sensitivity.csv (one-at-a-time swing of each
// parameter low -> high, others at base, on the de-duplicated totals).
// Output is deterministic and sorted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseCsv } from "./lib/csv.mjs";
import { derivedDir, toCsv } from "./lib/paths.mjs";

export const PARAMS = Object.freeze([
  "people",
  "payingShare",
  "annualSpend",
  "reachShare",
  "obtainShare",
  "overlapShare",
]);
const SHARE_PARAMS = new Set(PARAMS.filter((p) => p.endsWith("Share")));
export const CASES = Object.freeze(["low", "base", "high"]);
const PARAM_GRADES = new Set(["A", "B", "C", "X"]);
/** Parameters that may rest on a stated assumption (grade X). */
const ASSUMPTION_PARAMS = new Set(["reachShare", "obtainShare", "overlapShare"]);

function fail(error) {
  return { ok: false, error };
}

/**
 * Collects parameter rows into { [segment]: { [param]: {low, base, high,
 * quality, basis, inputId} } }. Returns a Result.
 */
export function collectParams(rows) {
  const out = {};
  const errors = [];
  const seen = new Set();
  for (const row of rows) {
    const m = /^param:(\w+)$/.exec(row.quantity ?? "");
    if (!m) continue;
    const name = m[1];
    const where = `${row.inputId || "?"} (${row.segment} ${name})`;
    if (!PARAMS.includes(name)) {
      errors.push(`${where}: unknown parameter`);
      continue;
    }
    if (!/^S\d+$/.test(row.segment ?? "")) {
      errors.push(`${where}: segment must look like S1`);
      continue;
    }
    seen.add(row.segment);
    if (!PARAM_GRADES.has(row.quality)) {
      errors.push(
        `${where}: grade ${row.quality || "(none)"} cannot set a base (A, B, C or X only)`,
      );
      continue;
    }
    if (row.quality === "X" && !ASSUMPTION_PARAMS.has(name)) {
      errors.push(`${where}: grade X (assumption) is allowed only for reach, obtain and overlap shares`);
      continue;
    }
    const [low, base, high] = CASES.map((c) => Number(row[c]));
    if (![low, base, high].every((v) => Number.isFinite(v) && v >= 0)) {
      errors.push(`${where}: low/base/high must be non-negative numbers`);
      continue;
    }
    if (!(low <= base && base <= high)) {
      errors.push(`${where}: needs low <= base <= high`);
      continue;
    }
    if (SHARE_PARAMS.has(name) && high > 1) {
      errors.push(`${where}: shares must be between 0 and 1`);
      continue;
    }
    out[row.segment] ??= {};
    if (out[row.segment][name]) {
      errors.push(`${where}: duplicate parameter`);
      continue;
    }
    out[row.segment][name] = {
      low,
      base,
      high,
      quality: row.quality,
      basis: row.basis ?? "",
      inputId: row.inputId ?? "",
    };
  }
  for (const seg of [...seen].sort()) {
    for (const name of PARAMS) {
      if (!out[seg]?.[name]) errors.push(`${seg}: missing parameter ${name}`);
    }
  }
  if (errors.length) return fail(errors);
  if (!Object.keys(out).length) return fail(["no parameter rows found"]);
  return { ok: true, value: out };
}

/** TAM / SAM / SOM for one segment given plain parameter values. */
export function computeSegment(v) {
  const tam = v.people * v.payingShare * v.annualSpend;
  const sam = tam * v.reachShare;
  const som = sam * v.obtainShare;
  return { tam, sam, som };
}

/** Plain values for one segment in one case, with optional overrides. */
export function valuesFor(segParams, caseName, overrides = {}) {
  const v = {};
  for (const name of PARAMS) v[name] = overrides[name] ?? segParams[name][caseName];
  return v;
}

/** De-duplicated totals given a case per segment and optional overrides. */
export function dedupTotals(params, caseName, override = null) {
  const total = { tam: 0, sam: 0, som: 0 };
  for (const seg of Object.keys(params).sort()) {
    const o =
      override && override.segment === seg
        ? { [override.param]: override.value }
        : {};
    const v = valuesFor(params[seg], caseName, o);
    const r = computeSegment(v);
    const keep = 1 - v.overlapShare;
    total.tam += r.tam * keep;
    total.sam += r.sam * keep;
    total.som += r.som * keep;
  }
  return total;
}

/** Rows for model-output.csv: per segment per case, then totals. */
export function modelRows(params) {
  const rows = [];
  const segs = Object.keys(params).sort();
  for (const seg of segs) {
    for (const c of CASES) {
      const v = valuesFor(params[seg], c);
      rows.push({ segment: seg, case: c, ...v, ...computeSegment(v) });
    }
  }
  for (const c of CASES) {
    const raw = { tam: 0, sam: 0, som: 0 };
    for (const seg of segs) {
      const r = computeSegment(valuesFor(params[seg], c));
      raw.tam += r.tam;
      raw.sam += r.sam;
      raw.som += r.som;
    }
    rows.push({ segment: "TOTAL-raw", case: c, ...raw });
    rows.push({ segment: "TOTAL-dedup", case: c, ...dedupTotals(params, c) });
  }
  return rows;
}

/**
 * One-at-a-time sensitivity on the de-duplicated totals: each parameter at
 * its low and high with everything else at base. Sorted by SOM swing, then
 * TAM swing (both descending), then segment and parameter.
 */
export function sensitivityRows(params) {
  const base = dedupTotals(params, "base");
  const rows = [];
  for (const seg of Object.keys(params).sort()) {
    for (const name of PARAMS) {
      const p = params[seg][name];
      const lo = dedupTotals(params, "base", {
        segment: seg,
        param: name,
        value: p.low,
      });
      const hi = dedupTotals(params, "base", {
        segment: seg,
        param: name,
        value: p.high,
      });
      rows.push({
        segment: seg,
        param: name,
        inputId: p.inputId,
        quality: p.quality,
        low: p.low,
        base: p.base,
        high: p.high,
        somAtLow: lo.som,
        somAtHigh: hi.som,
        somSwing: Math.abs(hi.som - lo.som),
        tamAtLow: lo.tam,
        tamAtHigh: hi.tam,
        tamSwing: Math.abs(hi.tam - lo.tam),
        baseSom: base.som,
        baseTam: base.tam,
      });
    }
  }
  rows.sort(
    (a, b) =>
      b.somSwing - a.somSwing ||
      b.tamSwing - a.tamSwing ||
      a.segment.localeCompare(b.segment) ||
      a.param.localeCompare(b.param),
  );
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/** Rounds numbers for stable CSV output (6 significant digits for shares). */
export function fmt(value) {
  if (typeof value !== "number") return value;
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return String(Number(value.toPrecision(6)));
}

function fmtRows(rows) {
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fmt(v)])),
  );
}

export const MODEL_COLUMNS = ["segment", "case", ...PARAMS, "tam", "sam", "som"];
export const SENSITIVITY_COLUMNS = [
  "rank",
  "segment",
  "param",
  "inputId",
  "quality",
  "low",
  "base",
  "high",
  "somAtLow",
  "somAtHigh",
  "somSwing",
  "tamAtLow",
  "tamAtHigh",
  "tamSwing",
  "baseSom",
  "baseTam",
];

/** Pure entry: register CSV text -> Result of { model, sensitivity } CSV text. */
export function runModel(registerText) {
  const params = collectParams(parseCsv(registerText));
  if (!params.ok) return params;
  return {
    ok: true,
    value: {
      model: toCsv(MODEL_COLUMNS, fmtRows(modelRows(params.value))),
      sensitivity: toCsv(
        SENSITIVITY_COLUMNS,
        fmtRows(sensitivityRows(params.value)),
      ),
    },
  };
}

function main() {
  const { values } = parseArgs({
    options: { phase: { type: "string", default: "09-sizing" } },
  });
  const dir = derivedDir(values.phase);
  const started = Date.now();
  const result = runModel(
    fs.readFileSync(path.join(dir, "input-register.csv"), "utf8"),
  );
  if (!result.ok) {
    console.error(`size-model: invalid register\n- ${result.error.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(path.join(dir, "model-output.csv"), result.value.model);
  fs.writeFileSync(path.join(dir, "sensitivity.csv"), result.value.sensitivity);
  console.log(
    `size-model: wrote model-output.csv and sensitivity.csv to ${dir} in ${Date.now() - started} ms`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
