// Append-only JSONL run log: one line per Bright Data CLI call.
import fs from "node:fs";
import path from "node:path";
import { containsSecret } from "./secret.mjs";

export const KINDS = [
  "search",
  "scrape",
  "pipeline",
  "budget",
  "zones",
  "zone_create",
  "version",
];
export const STATUSES = [
  "ok",
  "empty",
  "http_error",
  "timeout",
  "blocked",
  "cli_error",
];

const FIELDS = [
  "id",
  "phase",
  "kind",
  "input",
  "args",
  "startedAt",
  "endedAt",
  "durationMs",
  "status",
  "exitCode",
  "recordCount",
  "requestCount",
  "outputPath",
  "errorClass",
  "balanceBefore",
  "balanceAfter",
  "spendBefore",
];

// requestCount: CLI-level HTTP calls observed for one run. For pipelines this
// is 1 trigger + status polls ("polling again" / "Data received after N
// attempts"); polls are NOT billed units. Billing comes from `budget zones`
// (search/scrape) or the per-record estimate (pipelines).
const NULLABLE_NUMBERS = [
  "durationMs",
  "exitCode",
  "recordCount",
  "requestCount",
  "balanceBefore",
  "balanceAfter",
  "spendBefore",
];
const NULLABLE_STRINGS = ["input", "outputPath", "errorClass"];

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function normaliseEntry(entry, now = () => new Date()) {
  if (!entry || typeof entry !== "object")
    throw new Error("run-log entry must be an object");
  const endedAt = entry.endedAt ?? now().toISOString();
  const record = {};
  for (const field of FIELDS) record[field] = entry[field] ?? null;
  record.endedAt = endedAt;
  if (
    record.durationMs == null &&
    isIsoDate(record.startedAt) &&
    isIsoDate(endedAt)
  ) {
    record.durationMs = Date.parse(endedAt) - Date.parse(record.startedAt);
  }
  if (!Array.isArray(record.args)) record.args = [];

  for (const field of ["id", "phase"]) {
    if (typeof record[field] !== "string" || record[field] === "") {
      throw new Error(`run-log entry missing ${field}`);
    }
  }
  if (!KINDS.includes(record.kind))
    throw new Error(`run-log entry has invalid kind`);
  if (!STATUSES.includes(record.status))
    throw new Error(`run-log entry has invalid status`);
  if (!isIsoDate(record.startedAt))
    throw new Error("run-log entry needs ISO startedAt");
  if (!isIsoDate(record.endedAt))
    throw new Error("run-log entry needs ISO endedAt");
  if (!record.args.every((arg) => typeof arg === "string")) {
    throw new Error("run-log entry args must be strings");
  }
  for (const field of NULLABLE_NUMBERS) {
    if (record[field] !== null && !Number.isFinite(record[field])) {
      throw new Error(`run-log entry ${field} must be a number or null`);
    }
  }
  for (const field of NULLABLE_STRINGS) {
    if (record[field] !== null && typeof record[field] !== "string") {
      throw new Error(`run-log entry ${field} must be a string or null`);
    }
  }
  return record;
}

export function createRunLog({ path: logPath, key, now = () => new Date() }) {
  if (!logPath) throw new Error("run-log path required");
  return {
    path: logPath,
    append(entry) {
      const record = normaliseEntry(entry, now);
      const line = JSON.stringify(record);
      if (containsSecret(line, key)) {
        throw new Error(
          "refusing to write run-log line containing the API key",
        );
      }
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, line + "\n", "utf8");
      return record;
    },
  };
}
