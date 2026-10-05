#!/usr/bin/env node
// Mechanical venue-citation count (01-research-protocol.md section 10,
// Phase 8 addendum items 3-4). Written before any Phase 8 request.
//
//   node count-venues.mjs [--phase 02-public-web] [--out 08-community]
//
// Reads the handle-scrubbed reading copies (data/raw/<phase>/reading/*.txt:
// header lines, then `---`, then the record text). For pipeline records only
// text fields are read (title, description, comment, text, transcript,
// caption, content, body, post); scrape records are read whole. Snippets are
// never read.
//
// A record CITES a venue when one sentence contains the venue's name AND a
// gathering cue (join, ask, post, share, chat, talk, hang out, community,
// server, channel, group, discuss, member, help, find us, come to, check out).
// A bare link or a footer word with no cue does not count.
//
// Output (no URLs): data/derived/<out>/corpus-venues.csv, one row per venue:
// records citing it, share of all venue citations, and the same counts
// excluding records whose own platform is that venue (self-citation check),
// plus one column per source type.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { derivedDir, rawDir } from "./lib/paths.mjs";

export const VENUES = Object.freeze([
  { id: "discord", name: /\bdiscord\b/i },
  { id: "reddit", name: /\b(reddit|subreddits?)\b|(^|[\s(])r\/[a-z0-9_]{3,}/i },
  { id: "forum", name: /\bforums?\b/i },
  { id: "youtube", name: /\byoutube\b/i },
  { id: "tiktok", name: /\btiktok\b/i },
  { id: "x", name: /\b(twitter|x\.com)\b/i },
  { id: "twitch", name: /\btwitch\b/i },
  {
    id: "steam",
    name: /\bsteam\s+(community|workshop|forums?|groups?|discussions?)\b/i,
  },
  { id: "telegram", name: /\btelegram\b/i },
  { id: "guilded", name: /\bguilded\b/i },
]);

export const CUE =
  /\b(join|joined|joining|ask|asked|asking|post|posted|posting|share|shared|sharing|chat|chatting|talk|talking|hang(ing)? out|community|communities|server|servers|channel|channels|group|groups|discuss|discussion|members?|help|find us|come to|check out)\b/i;

const TEXT_KEY =
  /(^|\.)(\w*title|\w*description|comment|comments?\[\d+\]\.comment|text|transcript|caption|content|body|post\w*)$/i;

/** Own platform of a record, from its item id (pipeline) or host (scrape). */
export function ownPlatform(itemId, host) {
  const m = /^ds-([a-z]+)_/.exec(itemId);
  if (m && m[1] !== "scrape") return m[1] === "youtube" ? "youtube" : m[1];
  const h = (host ?? "").toLowerCase();
  if (h.endsWith("reddit.com")) return "reddit";
  if (h.endsWith("youtube.com")) return "youtube";
  if (h.endsWith("discord.com") || h.endsWith("disboard.org")) return "discord";
  return "web";
}

/** Splits a reading file into { item, host, text } (text fields only for pipelines). */
export function parseReading(raw) {
  const cut = raw.indexOf("\n---\n");
  const head = cut >= 0 ? raw.slice(0, cut) : "";
  const body = cut >= 0 ? raw.slice(cut + 5) : raw;
  const field = (k) => new RegExp(`^${k}: (.*)$`, "m").exec(head)?.[1] ?? "";
  const item = field("item");
  const isPipeline = !/^ds-scrape-/.test(item);
  let text = body;
  if (isPipeline) {
    text = body
      .split("\n")
      .map((l) => /^(\S+?): (.*)$/.exec(l))
      .filter((m) => m && TEXT_KEY.test(m[1].replace(/\[\d+\]$/, "")))
      .map((m) => m[2])
      .join("\n");
  }
  return { item, host: field("host"), text };
}

/** Venue ids cited in `text` (sorted). */
export function citedVenues(text) {
  const out = new Set();
  for (const s of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!CUE.test(s)) continue;
    for (const v of VENUES) if (v.name.test(s)) out.add(v.id);
  }
  return [...out].sort();
}

const sourceType = (item) =>
  /^ds-([a-z_]+)-[0-9a-f]{16}$/.exec(item)?.[1] ?? "unknown";

/** Counts per venue over reading files. Returns { rows, records, sources }. */
export function countVenues(readings) {
  const sources = [...new Set(readings.map((r) => sourceType(r.item)))].sort();
  const rows = VENUES.map((v) => ({
    venue: v.id,
    records: 0,
    recordsExclOwn: 0,
    bySource: Object.fromEntries(sources.map((s) => [s, 0])),
  }));
  for (const r of readings) {
    const own = ownPlatform(r.item, r.host);
    for (const id of citedVenues(r.text)) {
      const row = rows.find((x) => x.venue === id);
      row.records++;
      if (own !== id) row.recordsExclOwn++;
      row.bySource[sourceType(r.item)]++;
    }
  }
  const total = rows.reduce((s, r) => s + r.records, 0);
  const totalExcl = rows.reduce((s, r) => s + r.recordsExclOwn, 0);
  for (const r of rows) {
    r.share = total ? +(r.records / total).toFixed(3) : 0;
    r.shareExclOwn = totalExcl ? +(r.recordsExclOwn / totalExcl).toFixed(3) : 0;
  }
  return { rows, records: readings.length, sources };
}

export function toCsv({ rows, sources }) {
  const head = [
    "venue",
    "records_citing",
    "share",
    "records_citing_excl_own_platform",
    "share_excl_own_platform",
    ...sources.map((s) => `from_${s}`),
  ];
  const lines = rows.map((r) =>
    [
      r.venue,
      r.records,
      r.share,
      r.recordsExclOwn,
      r.shareExclOwn,
      ...sources.map((s) => r.bySource[s]),
    ].join(","),
  );
  return `${[head.join(","), ...lines].join("\n")}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      phase: { type: "string", default: "02-public-web" },
      out: { type: "string", default: "08-community" },
    },
  });
  const dir = path.join(rawDir(values.phase), "reading");
  const readings = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => parseReading(fs.readFileSync(path.join(dir, f), "utf8")));
  const result = countVenues(readings);
  const outDir = derivedDir(values.out);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `corpus-venues-${values.phase}.csv`);
  fs.writeFileSync(file, toCsv(result));
  console.log(
    `${result.records} records -> ${path.relative(process.cwd(), file)}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
