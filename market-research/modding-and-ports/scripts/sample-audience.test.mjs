import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  QUOTAS,
  REDDIT_CHUNK,
  buildAudienceSample,
  collectCommunityCandidates,
  loadFrozenQueries,
  roundRobin,
} from "./sample-audience.mjs";
import { buildCallArgs, validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const queries = [
  {
    id: "a3-c01",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com a",
  },
  {
    id: "a3-c02",
    group: "community",
    platform: "reddit",
    query: "site:reddit.com b",
  },
  {
    id: "a3-c11",
    group: "community",
    platform: "youtube",
    query: "site:youtube.com c",
  },
  {
    id: "a3-c15",
    group: "community",
    platform: "tiktok",
    query: "site:tiktok.com d",
  },
  { id: "a3-s01", group: "survey", query: "modding survey age" },
];
const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});
const post = (n) => `https://www.reddit.com/r/x/comments/p${n}/title/`;

describe("collectCommunityCandidates", () => {
  test("keeps on-site results of community queries only", () => {
    // Arrange
    const envelopes = [
      env("a3-c01", [post(1), "https://example.com/a"]),
      env("a3-s01", ["https://www.reddit.com/r/x/comments/s1/t/"]),
      env("a3-c11", [
        "https://youtu.be/abc",
        "https://www.youtube.com/watch?v=v1",
      ]),
    ];
    // Act
    const out = collectCommunityCandidates(envelopes, queries);
    // Assert
    const urls = [...out.values()].map((c) => c.url).sort();
    assert.deepEqual(urls, [post(1), "https://www.youtube.com/watch?v=v1"]);
  });

  test("a URL found by several queries belongs to the lowest query id", () => {
    const out = collectCommunityCandidates(
      [env("a3-c02", [post(1)]), env("a3-c01", [post(1)])],
      queries,
    );
    assert.equal(out.size, 1);
    assert.equal(out.get(recordIdFor(post(1))).queryId, "a3-c01");
  });
});

describe("roundRobin", () => {
  const cands = (queryId, n) =>
    Array.from({ length: n }, (_, i) => ({
      recordId: recordIdFor(`https://r.example/${queryId}/${i}`),
      queryId,
    }));

  test("caps each query at perQuery and alternates queries", () => {
    const picked = roundRobin([...cands("q1", 5), ...cands("q2", 1)], 10, 3);
    assert.equal(picked.filter((c) => c.queryId === "q1").length, 3);
    assert.equal(picked.filter((c) => c.queryId === "q2").length, 1);
    assert.deepEqual(
      picked.slice(0, 2).map((c) => c.queryId),
      ["q1", "q2"],
    );
  });

  test("stops at the quota and is order-independent", () => {
    const input = [...cands("q1", 3), ...cands("q2", 3), ...cands("q3", 3)];
    const a = roundRobin(input, 4, 3);
    const b = roundRobin([...input].reverse(), 4, 3);
    assert.equal(a.length, 4);
    assert.deepEqual(a, b);
    assert.deepEqual(
      a.map((c) => c.queryId),
      ["q1", "q2", "q3", "q1"],
    );
  });

  test("within a query, picks the lowest record ids", () => {
    const input = cands("q1", 6);
    const want = [...input]
      .sort((x, y) => (x.recordId < y.recordId ? -1 : 1))
      .slice(0, 3);
    assert.deepEqual(roundRobin(input, 30, 3), want);
  });
});

describe("buildAudienceSample", () => {
  const envelopes = [
    env(
      "a3-c01",
      [1, 2, 3, 4, 5].map(post).concat("https://www.reddit.com/r/x/"),
    ),
    env("a3-c02", [6, 7, 8].map(post)),
    env("a3-c11", [
      "https://www.youtube.com/watch?v=v1",
      "https://www.youtube.com/@chan",
    ]),
    env("a3-c15", [
      "https://www.tiktok.com/@u/video/111",
      "https://www.tiktok.com/@u/video/222",
      "https://www.tiktok.com/@u",
    ]),
  ];
  const { plans, manifest } = buildAudienceSample(
    collectCommunityCandidates(envelopes, queries),
  );

  test("chunks reddit plans and caps per query", () => {
    const reddit = Object.entries(plans)
      .filter(([name]) => name.startsWith("a3-reddit-"))
      .flatMap(([, items]) => items);
    assert.equal(reddit.length, 6);
    for (const [name, items] of Object.entries(plans)) {
      if (name.startsWith("a3-reddit-"))
        assert.ok(items.length <= REDDIT_CHUNK);
    }
  });

  test("youtube uses comments with 12 per video; tiktok one item per plan", () => {
    assert.deepEqual(
      plans["a3-youtube-comments.json"].map((i) => [i.type, i.numComments]),
      [["youtube_comments", 12]],
    );
    assert.equal(plans["a3-tiktok-1.json"].length, 1);
    assert.equal(plans["a3-tiktok-2.json"].length, 1);
    assert.equal(plans["a3-tiktok-3.json"], undefined);
  });

  test("plans are valid runner plans with fetch-rates item ids", () => {
    for (const items of Object.values(plans)) {
      validatePlan(items);
      for (const item of items) {
        assert.match(item.id, ITEM_ID);
        assert.ok(buildCallArgs(item, { timeoutS: 600 }).includes(item.url));
      }
    }
  });

  test("manifest carries counts only, no URLs", () => {
    const text = JSON.stringify(manifest);
    assert.doesNotMatch(text, /https?:/);
    const reddit = manifest.find((m) => m.platform === "reddit");
    assert.equal(reddit.candidates, 9);
    assert.equal(reddit.eligible, 8);
    assert.equal(reddit.selected, 6);
    assert.deepEqual(
      manifest.map((m) => m.quota),
      QUOTAS.map((q) => q.quota),
    );
  });
});

describe("frozen Phase 3 query list", () => {
  const frozen = loadFrozenQueries();
  const readPlan = (name) =>
    JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, name), "utf8"));

  test("ids are unique and well-formed; community queries carry site:", () => {
    const ids = frozen.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const q of frozen) {
      const idShape = {
        survey: /^a3-s\d{2}$/,
        community: /^a3-c\d{2}$/,
        disconfirm: /^a3-d\d{2}$/,
      }[q.group];
      assert.ok(idShape, `unknown group ${q.group}`);
      assert.match(q.id, idShape);
      if (q.group === "community") {
        assert.match(q.query, new RegExp(`^site:${q.platform}\\.com `));
      }
    }
  });

  test("search plans copy the frozen list verbatim", () => {
    for (const [name, group] of [
      ["phase3-surveys.json", "survey"],
      ["phase3-community.json", "community"],
    ]) {
      const plan = validatePlan(readPlan(name));
      const want = frozen.filter((q) => q.group === group);
      assert.deepEqual(
        plan.map((i) => [i.id, i.kind, i.query, i.searchType]),
        want.map((q) => [q.id, "search", q.query, q.searchType]),
      );
    }
  });
});
