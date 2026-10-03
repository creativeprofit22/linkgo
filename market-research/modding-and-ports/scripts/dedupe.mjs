#!/usr/bin/env node
// Dedupes SERP results from data/raw/<phase>/search/*.json into
// data/derived/<phase>/source-index.csv. Full URLs stay only in raw; the
// derived table carries a hashed record id and a handle-anonymised path.
//
// Raw files are bd-run.mjs envelopes: { id, fetchedAt, data } where data is
// the Bright Data parsed Google SERP (`organic[]` / `news[]` with `link`,
// `title`, `description`), per @brightdata/cli 0.3.7 commands/search.js.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { expandMatrix } from "./build-queries.mjs";
import { onsiteRule, queryResolver, splitOnSite } from "./lib/onsite.mjs";
import {
  CONFIG_DIR,
  DEFAULT_PHASE,
  derivedDir,
  rawDir,
  toCsv,
} from "./lib/paths.mjs";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "si", "feature"]);
const HOST_ALIASES = {
  "twitter.com": "x",
  "youtu.be": "youtube",
  "old.reddit.com": "reddit",
};
const HANDLE = "[handle]";

export function normaliseHost(host) {
  return host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

export function normaliseUrl(input) {
  const url = new URL(input);
  url.hash = "";
  const host = normaliseHost(url.hostname);
  const kept = [...url.searchParams.entries()]
    .filter(([name]) => {
      const lower = name.toLowerCase();
      return !lower.startsWith("utm_") && !TRACKING_PARAMS.has(lower);
    })
    .sort(([a, av], [b, bv]) =>
      a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1,
    );
  const query = new URLSearchParams(kept).toString();
  let pathname = url.pathname.replace(/\/+$/, "");
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol.toLowerCase()}//${host}${port}${pathname}${query ? `?${query}` : ""}`;
}

export function recordIdFor(url) {
  return crypto
    .createHash("sha256")
    .update(normaliseUrl(url))
    .digest("hex")
    .slice(0, 16);
}

export function platformForHost(host, platforms) {
  const h = normaliseHost(host);
  for (const [alias, id] of Object.entries(HOST_ALIASES)) {
    if (h === alias || h.endsWith(`.${alias}`)) return id;
  }
  let best = null;
  for (const p of platforms) {
    const ph = normaliseHost(p.host);
    if ((h === ph || h.endsWith(`.${ph}`)) && (!best || ph.length > best.len)) {
      best = { id: p.id, len: ph.length };
    }
  }
  return best ? best.id : "other";
}

// Segment after one of these markers is treated as a user/channel handle on any host.
const MARKERS = new Set([
  "u",
  "user",
  "users",
  "member",
  "members",
  "profile",
  "profiles",
  "id",
  "c",
  "channel",
]);
const X_RESERVED = new Set([
  "home",
  "search",
  "explore",
  "hashtag",
  "i",
  "settings",
  "intent",
  "share",
]);
const TWITCH_RESERVED = new Set([
  "directory",
  "videos",
  "search",
  "p",
  "settings",
  "downloads",
  "jobs",
  "store",
]);
const GITHUB_RESERVED = new Set([
  "about",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "pricing",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "topics",
  "trending",
]);

/** Returns the anonymised host + path; owner/user segments become "[handle]". */
export function anonymisePath(host, pathname) {
  const h = normaliseHost(host);
  const segments = pathname.split("/").filter(Boolean);
  const out = [];
  const is = (domain) => h === domain || h.endsWith(`.${domain}`);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = (segments[i - 1] ?? "").toLowerCase();
    let anon = false;
    if (seg.startsWith("@") || seg.startsWith("%40")) anon = true;
    else if (i > 0 && MARKERS.has(prev)) anon = true;
    else if (/^user(_talk)?:/i.test(seg)) {
      out.push(seg.replace(/^(user(?:_talk)?:).*/i, `$1${HANDLE}`));
      continue;
    } else if (
      i === 0 &&
      (is("x.com") || is("twitter.com")) &&
      !X_RESERVED.has(seg.toLowerCase())
    ) {
      anon = true;
    } else if (
      i === 0 &&
      is("twitch.tv") &&
      !TWITCH_RESERVED.has(seg.toLowerCase())
    )
      anon = true;
    else if (
      i === 0 &&
      is("github.com") &&
      !GITHUB_RESERVED.has(seg.toLowerCase())
    )
      anon = true;
    else if (i === 1 && is("github.com") && ["orgs", "sponsors"].includes(prev))
      anon = true;
    out.push(
      anon
        ? seg.startsWith("@") || seg.startsWith("%40")
          ? `@${HANDLE}`
          : HANDLE
        : seg,
    );
  }
  return "/" + out.join("/");
}

/** itch.io and github.io subdomains are creator handles. */
export function anonymiseHost(host) {
  const h = normaliseHost(host);
  for (const base of ["itch.io", "github.io"]) {
    if (h.endsWith(`.${base}`)) return `${HANDLE}.${base}`;
  }
  return h;
}

export function resultsFromEnvelope(envelope) {
  const data = envelope?.data ?? envelope;
  if (!data || typeof data !== "object") return [];
  const rows = [...(data.organic ?? []), ...(data.news ?? [])];
  return rows
    .map((r) => ({
      link: r.link ?? r.url,
      title: r.title ?? "",
      description: r.description ?? r.snippet ?? "",
    }))
    .filter((r) => typeof r.link === "string" && /^https?:\/\//i.test(r.link));
}

export function readSearchEnvelopes(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const envelope = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return {
        queryId: envelope.id ?? path.basename(f, ".json"),
        fetchedAt: envelope.fetchedAt ?? null,
        envelope,
      };
    });
}

/**
 * Deduplicated source index. When `queries` (the frozen list) is given,
 * matrix results whose host is not the query's site are dropped (protocol
 * section 5.3); `stats.offsiteDropped` counts them.
 */
export function buildSourceIndex(envelopes, platforms, queries = null, stats) {
  const index = new Map();
  const resolve = queries ? queryResolver(queries) : null;
  let offsiteDropped = 0;
  for (const { queryId, fetchedAt, envelope } of envelopes) {
    let results = resultsFromEnvelope(envelope);
    if (resolve) {
      const rule = onsiteRule(
        resolve(queryId, envelope?.input),
        envelope?.input,
      );
      const split = splitOnSite(results, rule, platforms);
      offsiteDropped += split.dropped.length;
      results = split.kept;
    }
    for (const result of results) {
      let url;
      try {
        url = new URL(normaliseUrl(result.link));
      } catch {
        continue;
      }
      const recordId = recordIdFor(result.link);
      const existing = index.get(recordId);
      if (existing) {
        existing.queryIds.add(queryId);
        if (
          fetchedAt &&
          (!existing.firstSeen || fetchedAt < existing.firstSeen)
        ) {
          existing.firstSeen = fetchedAt;
        }
        continue;
      }
      index.set(recordId, {
        recordId,
        host: anonymiseHost(url.hostname),
        platform: platformForHost(url.hostname, platforms),
        firstSeen: fetchedAt,
        queryIds: new Set([queryId]),
        anonymisedPath: anonymisePath(url.hostname, url.pathname),
      });
    }
  }
  if (stats) stats.offsiteDropped = offsiteDropped;
  return [...index.values()]
    .sort((a, b) => (a.recordId < b.recordId ? -1 : 1))
    .map((row) => ({ ...row, queryIds: [...row.queryIds].sort().join(";") }));
}

export const COLUMNS = [
  "recordId",
  "host",
  "platform",
  "firstSeen",
  "queryIds",
  "anonymisedPath",
];

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { phase: { type: "string", default: DEFAULT_PHASE } },
  });
  const matrix = JSON.parse(
    fs.readFileSync(path.join(CONFIG_DIR, "query-matrix.json"), "utf8"),
  );
  const envelopes = readSearchEnvelopes(
    path.join(rawDir(values.phase), "search"),
  );
  const stats = {};
  const rows = buildSourceIndex(
    envelopes,
    matrix.platforms,
    expandMatrix(matrix),
    stats,
  );
  const outDir = derivedDir(values.phase);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "source-index.csv");
  fs.writeFileSync(outPath, toCsv(COLUMNS, rows), "utf8");
  process.stdout.write(
    `files: ${envelopes.length}\nrecords: ${rows.length}\noff-site dropped: ${stats.offsiteDropped}\nfile: ${outPath}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
