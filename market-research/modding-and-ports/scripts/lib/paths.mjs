import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPTS_DIR = fileURLToPath(new URL("..", import.meta.url));
export const RESEARCH_ROOT = path.resolve(SCRIPTS_DIR, "..");
export const DATA_DIR = path.join(RESEARCH_ROOT, "data");
export const CONFIG_DIR = path.join(SCRIPTS_DIR, "config");
export const DEFAULT_PHASE = "01-protocol";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeName(value, label = "name") {
  if (
    typeof value !== "string" ||
    !SAFE_NAME.test(value) ||
    value.includes("..")
  ) {
    throw new Error(`invalid ${label}: must match ${SAFE_NAME}`);
  }
  return value;
}

export function rawDir(phase, dataDir = DATA_DIR) {
  return path.join(dataDir, "raw", assertSafeName(phase, "phase"));
}

export function derivedDir(phase, dataDir = DATA_DIR) {
  return path.join(dataDir, "derived", assertSafeName(phase, "phase"));
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows)
    lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return lines.join("\n") + "\n";
}
