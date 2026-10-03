import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  aggregateMentions,
  aggregateSignals,
  countSignals,
  termPattern,
} from "./signal-count.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const groups = {
  porting: ["port", "porting", "source port"],
  platforms: ["mod.io", "itch.io"],
  beginner: ["new to modding", "noob"],
};

describe("countSignals", () => {
  const cases = [
    ["Port the game", { porting: 1, platforms: 0, beginner: 0 }],
    ["Need support with my report", { porting: 0, platforms: 0, beginner: 0 }],
    [
      "port, porting and a source   port",
      { porting: 4, platforms: 0, beginner: 0 },
    ],
    [
      "Published on MOD.IO and itch.io",
      { porting: 0, platforms: 2, beginner: 0 },
    ],
    [
      "modXio is not mod.io-like? mod.io.",
      { porting: 0, platforms: 2, beginner: 0 },
    ],
    [
      "I'm New To\nModding, total noob",
      { porting: 0, platforms: 0, beginner: 2 },
    ],
    ["noobs and newbie", { porting: 0, platforms: 0, beginner: 0 }],
    ["", { porting: 0, platforms: 0, beginner: 0 }],
  ];
  for (const [text, expected] of cases) {
    test(JSON.stringify(text), () =>
      assert.deepEqual(countSignals(text, groups), expected),
    );
  }

  test("escapes regex characters", () => {
    assert.equal(termPattern("mod.io").test("modxio"), false);
    assert.equal(termPattern("c++").test("I use c++ daily"), true);
  });

  test("frozen config compiles", () => {
    const frozen = JSON.parse(
      fs.readFileSync(path.join(CONFIG_DIR, "signal-groups.json"), "utf8"),
    ).groups;
    const counts = countSignals("anything at all", frozen);
    assert.deepEqual(Object.keys(counts), Object.keys(frozen));
  });
});

describe("aggregateSignals", () => {
  test("slices by platform/theme/intent and counts result-level hits", () => {
    const queries = [
      {
        id: "m-reddit-t1-i1",
        kind: "matrix",
        platform: "reddit",
        theme: "t1",
        intent: "i1",
      },
      { id: "d-H1-1", kind: "disconfirmation", hypothesis: "H1" },
    ];
    const envelopes = [
      {
        queryId: "m-reddit-t1-i1",
        envelope: {
          data: {
            organic: [
              {
                link: "https://a.com",
                title: "port port",
                description: "noob",
              },
              { link: "https://b.com", title: "support", description: "" },
            ],
          },
        },
      },
      {
        queryId: "d-H1-1",
        envelope: {
          data: { organic: [{ link: "https://c.com", title: "mod.io" }] },
        },
      },
    ];
    const rows = aggregateSignals(envelopes, queries, groups);
    const get = (dimension, value, group) =>
      rows.find(
        (r) =>
          r.dimension === dimension && r.value === value && r.group === group,
      );
    assert.deepEqual(get("all", "all", "porting"), {
      dimension: "all",
      value: "all",
      group: "porting",
      hits: 1,
      results: 3,
      offsiteDropped: 0,
    });
    assert.equal(get("platform", "reddit", "porting").hits, 1);
    assert.equal(get("platform", "reddit", "porting").results, 2);
    assert.equal(get("theme", "t1", "beginner").hits, 1);
    assert.equal(get("hypothesis", "H1", "platforms").hits, 1);
  });

  test("with platforms, drops off-site matrix results and counts them", () => {
    const platforms = [{ id: "reddit", host: "reddit.com" }];
    const queries = [
      {
        id: "m-reddit-t1-i1",
        kind: "matrix",
        platform: "reddit",
        theme: "t1",
        intent: "i1",
      },
      { id: "d-H1-1", kind: "disconfirmation", hypothesis: "H1" },
    ];
    const envelopes = [
      {
        queryId: "m-reddit-t1-i1",
        envelope: {
          data: {
            organic: [
              { link: "https://reddit.com/r/a", title: "port" },
              { link: "https://other.com/b", title: "port" },
            ],
          },
        },
      },
      {
        queryId: "d-H1-1",
        envelope: {
          data: { organic: [{ link: "https://c.com", title: "port" }] },
        },
      },
    ];
    const rows = aggregateSignals(envelopes, queries, groups, platforms);
    const get = (dimension, value) =>
      rows.find(
        (r) =>
          r.dimension === dimension &&
          r.value === value &&
          r.group === "porting",
      );
    assert.equal(get("platform", "reddit").results, 1);
    assert.equal(get("platform", "reddit").hits, 1);
    assert.equal(get("platform", "reddit").offsiteDropped, 1);
    assert.equal(get("hypothesis", "H1").results, 1);
    assert.equal(get("hypothesis", "H1").offsiteDropped, 0);
    assert.equal(get("all", "all").results, 2);
  });
});

describe("aggregateMentions", () => {
  test("counts unique records, result rows and queries per term", () => {
    const platforms = [{ id: "reddit", host: "reddit.com" }];
    const queries = [{ id: "m-r", kind: "matrix", platform: "reddit" }];
    const categories = { hub: ["nexus mods", "mod.io"], tool: ["r2modman"] };
    const envelopes = [
      {
        queryId: "m-r",
        envelope: {
          data: {
            organic: [
              { link: "https://reddit.com/r/a", title: "Nexus Mods vs mod.io" },
              { link: "https://reddit.com/r/a/", title: "nexus mods again" },
              { link: "https://other.com/x", title: "r2modman" },
            ],
          },
        },
      },
      {
        queryId: "q-extra",
        envelope: {
          data: { organic: [{ link: "https://z.com", title: "nexus mods" }] },
        },
      },
    ];
    const rows = aggregateMentions(envelopes, queries, categories, platforms);
    const by = Object.fromEntries(rows.map((r) => [r.term, r]));
    assert.deepEqual(by["nexus mods"], {
      category: "hub",
      term: "nexus mods",
      records: 2,
      results: 3,
      queries: 2,
    });
    assert.equal(by["mod.io"].records, 1);
    assert.equal(by.r2modman.results, 0, "off-site result dropped");
  });

  test("frozen mention config compiles", () => {
    const { categories } = JSON.parse(
      fs.readFileSync(path.join(CONFIG_DIR, "mention-terms.json"), "utf8"),
    );
    const rows = aggregateMentions([], [], categories);
    assert.ok(rows.length > 40);
  });
});
