// Shared reader for Phase 2 search runs: joins run-log entries, the frozen
// query list, the wave plans and the stored SERP envelopes, and applies the
// on-site rule (protocol section 5.3). Used by query-log.mjs and coverage.mjs.
// Nothing here keeps a URL; only counts and hashed record ids leave.
import fs from "node:fs";
import path from "node:path";
import { recordIdFor, resultsFromEnvelope } from "../dedupe.mjs";
import { onsiteRule, queryResolver, splitOnSite } from "./onsite.mjs";

export const WAVE_PLAN =
  /^phase2-(wave-a|wave-b|disconfirm)(?:-[a-z]+)?\.json$/;
const WAVE_OF = { "wave-a": "A", "wave-b": "B", disconfirm: "D" };

/** Map of query id -> wave ("A" | "B" | "D") from the config plan files. */
export function loadWaves(configDir) {
  const waves = new Map();
  for (const file of fs.readdirSync(configDir).sort()) {
    const match = WAVE_PLAN.exec(file);
    if (!match) continue;
    const plan = JSON.parse(
      fs.readFileSync(path.join(configDir, file), "utf8"),
    );
    for (const item of plan) waves.set(item.id, WAVE_OF[match[1]]);
  }
  return waves;
}

export function readRunLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function readEnvelope(rawRoot, outputPath) {
  if (!outputPath) return null;
  const file = path.resolve(rawRoot, outputPath);
  const root = path.resolve(rawRoot) + path.sep;
  if (!file.startsWith(root) || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * One row per search attempt in the run log (in log order). `attempt` counts
 * repeats of the same id. Fields: id, attempt, kind, platform, theme, intent,
 * hypothesis, wave, status, errorClass, durationMs, startedAt, rawResults,
 * onsiteResults, offsiteDropped, recordIds (on-site, not exported to CSV).
 */
export function searchAttempts({
  entries,
  rawRoot,
  queries,
  waves,
  platforms,
}) {
  const resolve = queryResolver(queries);
  const seen = new Map();
  const rows = [];
  for (const entry of entries) {
    if (entry.kind !== "search") continue;
    const meta = resolve(entry.id, entry.input);
    const attempt = (seen.get(entry.id) ?? 0) + 1;
    seen.set(entry.id, attempt);
    const envelope =
      entry.status === "ok" ? readEnvelope(rawRoot, entry.outputPath) : null;
    const results = envelope ? resultsFromEnvelope(envelope) : [];
    const rule = onsiteRule(meta, entry.input);
    const { kept, dropped } = splitOnSite(results, rule, platforms);
    const recordIds = [];
    for (const r of kept) {
      try {
        recordIds.push(recordIdFor(r.link));
      } catch {
        // unparseable link: not a record
      }
    }
    rows.push({
      id: entry.id,
      attempt,
      kind: meta?.kind ?? "addition",
      platform: meta?.platform ?? "",
      theme: meta?.theme ?? "",
      intent: meta?.intent ?? "",
      hypothesis: meta?.hypothesis ?? "",
      wave: waves.get(meta?.id ?? entry.id) ?? "addition",
      status: entry.status,
      errorClass: entry.errorClass ?? "",
      durationMs: entry.durationMs ?? "",
      startedAt: entry.startedAt ?? "",
      rawResults: results.length,
      onsiteResults: kept.length,
      offsiteDropped: dropped.length,
      emptySite:
        meta?.kind === "matrix" && entry.status === "ok" && kept.length === 0,
      recordIds,
    });
  }
  return rows;
}

/** Final attempt per query id (a later attempt supersedes an earlier one). */
export function finalAttempts(rows) {
  const last = new Map();
  for (const row of rows) last.set(row.id, row);
  return [...last.values()];
}

/** Planned queries (with wave) never attempted in the run log. */
export function unrunQueries(attempts, waves, queries) {
  const run = new Set(attempts.map((r) => r.id));
  const byId = new Map(queries.map((q) => [q.id, q]));
  return [...waves.entries()]
    .filter(([id]) => !run.has(id))
    .map(([id, wave]) => ({ ...byId.get(id), id, wave }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
