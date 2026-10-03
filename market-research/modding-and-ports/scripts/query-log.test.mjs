import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildQueryLog, frozenListContext } from "./query-log.mjs";
import { buildCoverage } from "./coverage.mjs";
import { parseCsv } from "./lib/csv.mjs";
import { toCsv } from "./lib/paths.mjs";
import {
  finalAttempts,
  loadWaves,
  searchAttempts,
  unrunQueries,
} from "./lib/search-runs.mjs";

const platforms = [
  { id: "reddit", host: "reddit.com" },
  { id: "github", host: "github.com" },
];
const queries = [
  {
    id: "m-reddit-t1-i1",
    kind: "matrix",
    platform: "reddit",
    theme: "t1",
    intent: "i1",
    query: "site:reddit.com a",
  },
  {
    id: "m-reddit-t1-i2",
    kind: "matrix",
    platform: "reddit",
    theme: "t1",
    intent: "i2",
    query: "site:reddit.com b",
  },
  {
    id: "m-github-t1-i1",
    kind: "matrix",
    platform: "github",
    theme: "t1",
    intent: "i1",
    query: "site:github.com c",
  },
  { id: "H1-1", kind: "disconfirmation", hypothesis: "H1", query: "d" },
];
const waves = new Map([
  ["m-reddit-t1-i1", "A"],
  ["m-github-t1-i1", "A"],
  ["m-reddit-t1-i2", "B"],
  ["H1-1", "D"],
]);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qlog-"));
  fs.mkdirSync(path.join(root, "search"));
  const write = (name, organic) =>
    fs.writeFileSync(
      path.join(root, "search", name),
      JSON.stringify({ data: { organic } }),
    );
  write("m-reddit-t1-i1.json", [
    { link: "https://www.reddit.com/r/a/comments/1" },
    { link: "https://reddit.com/r/a/comments/1/" },
    { link: "https://elsewhere.com/x" },
  ]);
  write("m-github-t1-i1.json", [{ link: "https://example.com/off" }]);
  write("H1-1.json", [{ link: "https://example.org/a" }]);
  const entries = [
    {
      id: "m-reddit-t1-i1",
      kind: "search",
      input: "site:reddit.com a",
      status: "ok",
      durationMs: 5,
      outputPath: "search/m-reddit-t1-i1.json",
    },
    {
      id: "m-github-t1-i1",
      kind: "search",
      input: "site:github.com c",
      status: "failed",
      errorClass: "timeout",
      durationMs: 9,
      outputPath: "search/none.json",
    },
    {
      id: "m-github-t1-i1",
      kind: "search",
      input: "site:github.com c",
      status: "ok",
      durationMs: 4,
      outputPath: "search/m-github-t1-i1.json",
    },
    {
      id: "H1-1",
      kind: "search",
      input: "d",
      status: "ok",
      outputPath: "search/H1-1.json",
    },
    {
      id: "x-extra-1",
      kind: "search",
      input: "site:gbatemp.net e",
      status: "ok",
      outputPath: "search/../../escape.json",
    },
    {
      id: "p01",
      kind: "pipeline",
      input: "https://reddit.com/r/a",
      status: "ok",
    },
  ];
  return { root, entries };
}

describe("searchAttempts", () => {
  const { root, entries } = fixture();
  const attempts = searchAttempts({
    entries,
    rawRoot: root,
    queries,
    waves,
    platforms,
  });

  test("one row per search attempt with on-site counts", () => {
    assert.equal(attempts.length, 5);
    const first = attempts[0];
    assert.equal(first.wave, "A");
    assert.equal(first.rawResults, 3);
    assert.equal(first.onsiteResults, 2);
    assert.equal(first.offsiteDropped, 1);
    assert.equal(new Set(first.recordIds).size, 1, "same URL normalised");
  });

  test("retries are numbered; empty-site flagged; disconfirmation unfiltered", () => {
    const gh = attempts.filter((a) => a.id === "m-github-t1-i1");
    assert.deepEqual(
      gh.map((a) => a.attempt),
      [1, 2],
    );
    assert.equal(gh[0].rawResults, 0);
    assert.equal(gh[1].emptySite, true);
    const d = attempts.find((a) => a.id === "H1-1");
    assert.equal(d.onsiteResults, 1);
    assert.equal(d.emptySite, false);
  });

  test("additions are labelled and paths outside raw are not read", () => {
    const x = attempts.find((a) => a.id === "x-extra-1");
    assert.equal(x.kind, "addition");
    assert.equal(x.wave, "addition");
    assert.equal(x.rawResults, 0);
  });

  test("query log lists unrun planned queries and holds no URLs", () => {
    const unrun = unrunQueries(attempts, waves, queries);
    assert.deepEqual(
      unrun.map((q) => [q.id, q.wave]),
      [["m-reddit-t1-i2", "B"]],
    );
    const rows = buildQueryLog(attempts, unrun);
    const csv = toCsv(
      Object.keys(rows[0]).filter((k) => k !== "recordIds"),
      rows,
    );
    assert.equal(/https?:\/\//.test(csv), false);
    assert.equal(rows.at(-1).status, "unrun");
  });

  test("coverage uses final attempts and counts unique records", () => {
    const planned = [...waves.entries()].map(([id, wave]) => ({
      ...queries.find((q) => q.id === id),
      wave,
    }));
    const rows = buildCoverage(attempts, planned);
    const get = (d, v) => rows.find((r) => r.dimension === d && r.value === v);
    assert.deepEqual(get("platform", "reddit"), {
      dimension: "platform",
      value: "reddit",
      planned: 2,
      run: 1,
      ok: 1,
      withOnsite: 1,
      onsiteResults: 2,
      offsiteDropped: 1,
      uniqueRecords: 1,
    });
    assert.equal(get("platform", "github").ok, 1);
    assert.equal(get("platform", "github").withOnsite, 0);
    assert.equal(get("wave", "B").run, 0);
    assert.equal(get("hypothesis", "H1").uniqueRecords, 1);
    assert.equal(get("all", "all").run, finalAttempts(attempts).length);
  });
});

describe("loadWaves", () => {
  test("reads wave plans and ignores other config files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waves-"));
    fs.writeFileSync(
      path.join(dir, "phase2-wave-a-forums.json"),
      JSON.stringify([{ id: "a1" }]),
    );
    fs.writeFileSync(
      path.join(dir, "phase2-wave-b-all.json"),
      JSON.stringify([{ id: "b1" }]),
    );
    fs.writeFileSync(
      path.join(dir, "phase2-disconfirm.json"),
      JSON.stringify([{ id: "d1" }]),
    );
    fs.writeFileSync(
      path.join(dir, "pilot-plan-1.json"),
      JSON.stringify([{ id: "p1" }]),
    );
    const w = loadWaves(dir);
    assert.deepEqual([...w.entries()].sort(), [
      ["a1", "A"],
      ["b1", "B"],
      ["d1", "D"],
    ]);
  });
});

describe("frozenListContext", () => {
  test("later-phase frozen list replaces the Phase 2 matrix and waves", () => {
    // Arrange
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frozen-"));
    const file = path.join(dir, "phase3-queries.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        queries: [
          { id: "a3-s01", group: "survey", query: "modding survey age" },
          {
            id: "a3-c01",
            group: "community",
            platform: "reddit",
            query: "site:reddit.com a",
          },
        ],
      }),
    );
    // Act
    const ctx = frozenListContext(file);
    const attempts = [{ id: "a3-s01" }];
    const unrun = unrunQueries(attempts, ctx.waves, ctx.queries);
    // Assert
    assert.deepEqual(
      unrun.map((q) => [q.id, q.kind, q.platform, q.theme, q.wave]),
      [["a3-c01", "frozen", "reddit", "community", "frozen"]],
    );
  });
});

describe("parseCsv", () => {
  test("round-trips toCsv with quotes, commas and newlines", () => {
    const rows = [
      { a: 'x "y", z', b: "line1\nline2" },
      { a: "", b: "plain" },
    ];
    assert.deepEqual(parseCsv(toCsv(["a", "b"], rows)), rows);
  });
});
