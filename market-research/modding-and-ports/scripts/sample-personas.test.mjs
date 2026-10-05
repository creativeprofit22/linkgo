import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  QUOTAS,
  buildSample,
  buildSearchPlans,
  collectCandidates,
  loadPhase10,
  storedRecordIds,
} from "./sample-personas.mjs";
import { validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";

const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});
const post = (n) => `https://www.reddit.com/r/x/comments/p${n}/title/`;
const video = (n) => `https://www.youtube.com/watch?v=v${n}`;

const queries = [
  { id: "p10-c01", group: "competitor", platform: "web", query: '"x"' },
  {
    id: "p10-d01",
    group: "disconfirm",
    platform: "reddit",
    query: "site:reddit.com d",
  },
  {
    id: "p10-g01",
    group: "persona",
    platform: "reddit",
    query: "site:reddit.com a",
  },
  {
    id: "p10-g02",
    group: "persona",
    platform: "reddit",
    query: "site:reddit.com b",
  },
  {
    id: "p10-g09",
    group: "persona",
    platform: "youtube",
    query: "site:youtube.com c",
  },
  { id: "p10-x01", group: "disconfirmer", platform: "web", query: "extra" },
];

describe("frozen Phase 10 queries", () => {
  test("load, unique ids, at most 30, groups and site: rules", () => {
    const q = loadPhase10();
    assert.ok(q.length <= 30);
    assert.equal(new Set(q.map((x) => x.id)).size, q.length);
    const by = (g) => q.filter((x) => x.group === g);
    assert.equal(by("persona").length, 14);
    assert.equal(
      by("persona").filter((x) => x.platform === "reddit").length,
      8,
    );
    assert.equal(
      by("persona").filter((x) => x.platform === "youtube").length,
      4,
    );
    assert.equal(by("persona").filter((x) => x.platform === "web").length, 2);
    assert.equal(by("disconfirm").length, 4);
    assert.ok(by("competitor").length <= 6);
    for (const x of q.filter((x) => ["reddit", "youtube"].includes(x.platform)))
      assert.match(x.query, new RegExp(`^site:${x.platform}\\.com `));
  });
});

describe("buildSearchPlans", () => {
  test("main holds frozen groups; disconfirmer holds p10-x*; plans validate", () => {
    const plans = buildSearchPlans(queries);
    assert.deepEqual(
      plans["p10-search-main.json"].map((i) => i.id),
      ["p10-c01", "p10-d01", "p10-g01", "p10-g02", "p10-g09"],
    );
    assert.deepEqual(
      plans["p10-search-disconfirmer.json"].map((i) => i.id),
      ["p10-x01"],
    );
    for (const items of Object.values(plans)) validatePlan(items);
  });
});

describe("collectCandidates", () => {
  test("on-site only, lowest query id wins, excluded ids and competitor queries skipped", () => {
    const envs = [
      env("p10-g02", [post(1), post(2)]),
      env("p10-g01", [post(1), "https://example.com/a"]),
      env("p10-c01", [post(9)]),
      env("p10-d01", [post(3)]),
    ];
    const exclude = new Set([recordIdFor(post(3))]);
    const c = collectCandidates(envs, queries, exclude);
    assert.equal(c.get(recordIdFor(post(1))).queryId, "p10-g01");
    assert.equal(c.get(recordIdFor(post(2))).queryId, "p10-g02");
    assert.ok(!c.has(recordIdFor(post(9))));
    assert.ok(!c.has(recordIdFor(post(3))));
    assert.ok(![...c.values()].some((x) => x.url.includes("example.com")));
  });
});

describe("buildSample", () => {
  test("quotas, <= 2 per query, youtube_comments with numComments 10", () => {
    const links = Array.from({ length: 10 }, (_, i) => post(i));
    const envs = [
      env("p10-g01", links),
      env(
        "p10-g02",
        links.map((l) => l.replace("/p", "/q")),
      ),
      env("p10-g09", [
        video(1),
        video(2),
        video(3),
        "https://www.youtube.com/@chan",
      ]),
    ];
    const { plans, manifest } = buildSample(collectCandidates(envs, queries));
    const reddit = plans["p10-reddit.json"];
    const yt = plans["p10-youtube.json"];
    assert.equal(reddit.length, 4);
    assert.equal(yt.length, 2);
    assert.ok(
      yt.every((i) => i.type === "youtube_comments" && i.numComments === 10),
    );
    assert.ok(
      reddit.every((i) => i.type === "reddit_posts" && i.kind === "pipeline"),
    );
    const m = manifest.find((x) => x.platform === "reddit");
    assert.deepEqual(m.selectedByQuery, { "p10-g01": 2, "p10-g02": 2 });
    validatePlan(reddit);
    validatePlan(yt);
    assert.deepEqual(
      QUOTAS.map((q) => q.quota),
      [12, 2],
    );
  });
});

describe("storedRecordIds", () => {
  test("reads 16-hex ids from pipeline and scrape folders", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p10-"));
    fs.mkdirSync(path.join(root, "02-public-web", "pipeline"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "07-legal", "scrape"), { recursive: true });
    fs.writeFileSync(
      path.join(
        root,
        "02-public-web",
        "pipeline",
        "ds-reddit_posts-0123456789abcdef.json",
      ),
      "{}",
    );
    fs.writeFileSync(
      path.join(root, "07-legal", "scrape", "ds-scrape-fedcba9876543210.json"),
      "{}",
    );
    const ids = storedRecordIds(root, [
      "02-public-web",
      "07-legal",
      "09-sizing",
    ]);
    assert.deepEqual([...ids].sort(), ["0123456789abcdef", "fedcba9876543210"]);
  });
});
