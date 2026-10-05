#!/usr/bin/env node
// Mechanical extraction of Disboard tag-page listings (01-research-protocol.md
// section 10, Phase 8 addendum items 3, 6, 8).
//
//   node extract-disboard.mjs [--phase 08-community]
//
// Reads stored scrape envelopes (data/raw/<phase>/scrape/*.json) whose input is
// a disboard.org /servers/tag/<tag> page and writes
// data/derived/<phase>/directory-servers.csv: one row per (tag page, listed
// server) in page order.
//
// Privacy: server names, descriptions and invite links are NOT written. A
// server is identified only by a 16-hex hash of its public server id, so the
// same server can be de-duplicated across tag pages.
//
// Fields: listed_count is the number shown on the card as stored (the stored
// text does not label it as members or online; reported as-is).
// last_bump_days converts "N minutes/hours/days/weeks/months/years ago".
// active = last bump within 30 days of the scrape; large = listed_count
// >= 10,000; modding_related = the card's own tags or description mention
// mods, modding, mod making, map making, romhacks or game development.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { derivedDir, rawDir, toCsv } from "./lib/paths.mjs";

export const ACTIVE_DAYS = 30;
export const LARGE_COUNT = 10_000;

const MODDING =
  /\bmod(s|ding|ded|der|ders|pack|packs|ding-community)?\b|\bmod[- ]making\b|\bmap[- ]making\b|\bmapping\b|\brom[- ]?hack(s|ing)?\b|\bgame[- ]?dev\b|\bgame development\b|\bdecomp(ilation)?\b/i;

/** Matches a card's relative bump time ("31 minutes ago", "just now"). */
const WHEN = /^(just now|.+\bago)$/i;

/** "31 minutes ago" -> 0, "just now" -> 0, "a month ago" -> 30, unknown -> null. */
export function agoToDays(text) {
  if (/^just now$/i.test(text.trim())) return 0;
  const m =
    /^(a|an|\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(
      text.trim(),
    );
  if (!m) return null;
  const n = /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
  const unit = m[2].toLowerCase();
  const per = {
    second: 0,
    minute: 0,
    hour: 0,
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };
  return n * per[unit];
}

/** "1,495" / "1.2K" / "12k" -> number; else null. */
export function parseCount(text) {
  const m = /^([\d,.]+)\s*([KkMm])?$/.exec(text.trim());
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return Math.round(base * mult);
}

const hashId = (id) =>
  crypto
    .createHash("sha256")
    .update(`discord-server:${id}`)
    .digest("hex")
    .slice(0, 16);

/**
 * Parses listing cards from a Disboard tag page (markdown as stored).
 * Each card starts with "[](/server/<id>)", then the count, then "<when> ago".
 */
export function parseTagPage(markdown) {
  const starts = [...markdown.matchAll(/\[\]\(\/server\/(\d+)\)/g)];
  const cards = [];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : markdown.length;
    const block = markdown.slice(m.index + m[0].length, end);
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const count = lines[0] !== undefined ? parseCount(lines[0]) : null;
    const when = lines.find((l) => WHEN.test(l)) ?? "";
    const tags = [
      ...block.matchAll(/\]\(\/servers\/tag\/([a-z0-9-]+) "/gi),
    ].map((t) => t[1].toLowerCase());
    const description = lines
      .filter(
        (l) =>
          !l.startsWith("*") &&
          !l.startsWith("[") &&
          !WHEN.test(l) &&
          parseCount(l) === null,
      )
      .join(" ");
    cards.push({
      serverHash: hashId(m[1]),
      listedCount: count,
      lastBumpText: when,
      lastBumpDays: when ? agoToDays(when) : null,
      tags,
      moddingRelated: MODDING.test(`${tags.join(" ")} ${description}`),
    });
  });
  return cards;
}

export const COLUMNS = [
  "directory",
  "tag",
  "record_id",
  "rank",
  "server_hash",
  "listed_count",
  "last_bump",
  "last_bump_days",
  "active",
  "large",
  "modding_related",
  "card_tags",
];

/** Rows for every stored Disboard tag page in `scrapeDir`. */
export function extractRows(scrapeDir) {
  const rows = [];
  for (const f of fs
    .readdirSync(scrapeDir)
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const e = JSON.parse(fs.readFileSync(path.join(scrapeDir, f), "utf8"));
    let u;
    try {
      u = new URL(e.input);
    } catch {
      continue;
    }
    const tagMatch = /^\/servers\/tag\/([a-z0-9-]+)\/?$/i.exec(u.pathname);
    if (!/(^|\.)disboard\.org$/i.test(u.hostname) || !tagMatch) continue;
    if (e.status !== "ok" || typeof e.data !== "string") continue;
    const recordId = /([0-9a-f]{16})$/.exec(e.id)?.[1] ?? "";
    parseTagPage(e.data).forEach((c, i) => {
      rows.push({
        directory: "disboard.org",
        tag: tagMatch[1].toLowerCase(),
        record_id: recordId,
        rank: i + 1,
        server_hash: c.serverHash,
        listed_count: c.listedCount ?? "",
        last_bump: c.lastBumpText,
        last_bump_days: c.lastBumpDays ?? "",
        active:
          c.lastBumpDays !== null && c.lastBumpDays <= ACTIVE_DAYS
            ? "yes"
            : "no",
        large:
          c.listedCount !== null && c.listedCount >= LARGE_COUNT ? "yes" : "no",
        modding_related: c.moddingRelated ? "yes" : "no",
        card_tags: c.tags.join(";"),
      });
    });
  }
  return rows;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { phase: { type: "string", default: "08-community" } },
  });
  const rows = extractRows(path.join(rawDir(values.phase), "scrape"));
  const out = derivedDir(values.phase);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "directory-servers.csv"),
    toCsv(COLUMNS, rows),
  );
  const distinct = new Map();
  for (const r of rows) distinct.set(r.server_hash, r);
  const d = [...distinct.values()];
  const am = d.filter((r) => r.active === "yes" && r.modding_related === "yes");
  console.log(
    `rows ${rows.length}, distinct servers ${d.length}, active+modding ${am.length}, of which large ${am.filter((r) => r.large === "yes").length}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
