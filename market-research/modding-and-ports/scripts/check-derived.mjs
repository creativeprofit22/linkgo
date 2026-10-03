#!/usr/bin/env node
// Privacy gate for derived tables (protocol: no usernames or handles in
// derived data). Collects author/username/handle values from the phase's raw
// pipeline and scrape records, then fails (exit 1) if any of them, or any
// `@handle` pattern, appears in data/derived/<phase>/*.csv (and in any extra
// file passed with --also). Matched values are printed masked.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CONFIG_DIR, derivedDir, rawDir } from "./lib/paths.mjs";

/** Keys whose string value is a person's name, username or handle. */
export const AUTHOR_KEYS = new Set([
  "author",
  "author_name",
  "handle",
  "handle_name",
  "owner",
  "profile_handle",
  "profile_username",
  "user_handle",
  "user_posted",
  "user_username_raw",
  "username",
  "youtuber",
]);
/** Keys whose value is a profile URL; its last path segment is a handle. */
export const AUTHOR_URL_KEYS = new Set([
  "channel_url",
  "profile_url",
  "user_channel",
  "user_url",
]);
const MIN_LENGTH = 4;
export const AT_HANDLE = /(?<![\w.[\]])@[A-Za-z0-9_][A-Za-z0-9_.]{1,}/g;

function handleFromUrl(value) {
  try {
    const segs = new URL(value).pathname.split("/").filter(Boolean);
    const last = segs.at(-1);
    return last ? decodeURIComponent(last).replace(/^@/, "") : null;
  } catch {
    return null;
  }
}

/** Walks any JSON value and adds author values to `out` (Set). */
export function collectAuthorValues(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const v of value) collectAuthorValues(v, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, v] of Object.entries(value)) {
    const k = key.toLowerCase();
    if (typeof v === "string") {
      if (AUTHOR_KEYS.has(k)) out.add(v.trim().replace(/^@/, ""));
      else if (AUTHOR_URL_KEYS.has(k)) {
        const h = handleFromUrl(v);
        if (h) out.add(h);
      } else if (k === "name" && "user_posted" in value) out.add(v.trim());
    } else if (v && typeof v === "object") {
      collectAuthorValues(v, out);
    }
  }
  return out;
}

/**
 * Author values worth scanning for. Values equal (case-insensitive) to a
 * pre-registered dictionary term (e.g. a hub's own official account named
 * "Nexus Mods") are organisation names, not personal handles; they are
 * returned separately as `exempt` and reported.
 */
export function usableTokens(values, dictionary = []) {
  const dict = new Set(dictionary.map((t) => t.toLowerCase()));
  const tokens = [];
  const exempt = [];
  for (const v of [...values].map((x) => x.trim()).sort()) {
    if (v.length < MIN_LENGTH || /^\d+$/.test(v)) continue;
    (dict.has(v.toLowerCase()) ? exempt : tokens).push(v);
  }
  return { tokens, exempt };
}

export function dictionaryTerms(configDir) {
  const read = (f) =>
    JSON.parse(fs.readFileSync(path.join(configDir, f), "utf8"));
  const mention = Object.values(read("mention-terms.json").categories).flat();
  const signal = Object.values(read("signal-groups.json").groups).flat();
  return [...mention, ...signal];
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mask(value) {
  return `${value.slice(0, 2)}…(${value.length})`;
}

/** Returns findings [{ file, kind, value }] for one text. */
export function scanText(file, text, tokens) {
  const findings = [];
  const lower = text.toLowerCase();
  for (const token of tokens) {
    if (!lower.includes(token.toLowerCase())) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escape(token)}(?![\\p{L}\\p{N}_])`,
      "iu",
    );
    if (re.test(text))
      findings.push({ file, kind: "author-value", value: token });
  }
  for (const m of text.matchAll(AT_HANDLE)) {
    findings.push({ file, kind: "at-handle", value: m[0] });
  }
  return findings;
}

function readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      phase: { type: "string", default: "02-public-web" },
      also: { type: "string", multiple: true, default: [] },
    },
  });
  const raw = rawDir(values.phase);
  const authors = new Set();
  for (const sub of ["pipeline", "scrape"]) {
    for (const envelope of readJsonFiles(path.join(raw, sub))) {
      collectAuthorValues(envelope.data, authors);
    }
  }
  const { tokens, exempt } = usableTokens(authors, dictionaryTerms(CONFIG_DIR));
  const dir = derivedDir(values.phase);
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".csv"))
        .sort()
        .map((f) => path.join(dir, f))
    : [];
  files.push(...values.also.map((f) => path.resolve(f)));
  const findings = [];
  for (const file of files) {
    findings.push(
      ...scanText(path.basename(file), fs.readFileSync(file, "utf8"), tokens),
    );
  }
  process.stdout.write(
    `author values: ${tokens.length} (+${exempt.length} exempt dictionary terms: ${exempt.join(", ") || "none"})\nfiles scanned: ${files.length}\nfindings: ${findings.length}\n`,
  );
  for (const f of findings) {
    process.stdout.write(`  ${f.file}: ${f.kind} ${mask(f.value)}\n`);
  }
  if (findings.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
