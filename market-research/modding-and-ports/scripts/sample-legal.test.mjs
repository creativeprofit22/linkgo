import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  QUOTAS,
  buildFirstResultPlan,
  buildPolicyPlan,
  buildRevivalSample,
  buildSearchPlans,
  isSocial,
  loadPhase7,
} from "./sample-legal.mjs";
import { buildCallArgs, validatePlan } from "./bd-run.mjs";
import { recordIdFor } from "./dedupe.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";

const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "t" })) } },
});

describe("isSocial", () => {
  test("flags social platforms and their subdomains only", () => {
    assert.equal(isSocial("https://www.reddit.com/r/x/comments/1/"), true);
    assert.equal(isSocial("https://old.reddit.com/r/x/"), true);
    assert.equal(isSocial("https://m.youtube.com/watch?v=1"), true);
    assert.equal(isSocial("https://x.com/a/status/1"), true);
    assert.equal(isSocial("https://www.linkedin.com/pulse/x"), true);
    assert.equal(isSocial("https://www.box.com/x"), false);
    assert.equal(isSocial("https://www.polygon.com/a"), false);
  });
});

describe("buildSearchPlans", () => {
  test("groups queries and keeps the news search type", () => {
    const plans = buildSearchPlans([
      { id: "p7-e02", group: "enforcement", query: "b" },
      { id: "p7-e01", group: "enforcement", searchType: "news", query: "a" },
      { id: "p7-v01", group: "revival", query: "c" },
      { id: "p7-d01", group: "disconfirm", query: "d" },
      { id: "p7-l01", group: "lookup", query: "e" },
      { id: "p7-x01", group: "disconfirmer", query: "f" },
    ]);
    const ids = (n) => plans[n].map((i) => i.id);
    assert.deepEqual(ids("p7-search-enforcement.json"), ["p7-e01", "p7-e02"]);
    assert.deepEqual(ids("p7-search-revival.json"), ["p7-d01", "p7-v01"]);
    assert.deepEqual(ids("p7-search-lookups.json"), ["p7-l01"]);
    assert.deepEqual(ids("p7-search-disconfirmer.json"), ["p7-x01"]);
    const news = plans["p7-search-enforcement.json"][0];
    assert.equal(news.searchType, "news");
    assert.ok(buildCallArgs(news, { serpZone: "z" }).includes("news"));
    for (const p of Object.values(plans)) validatePlan(p);
  });
});

describe("buildPolicyPlan", () => {
  const policies = [
    { id: "a", lookup: "p7-l01", domains: ["xbox.com"] },
    { id: "b", lookup: "p7-l02", domains: ["nintendo.co.jp"] },
    { id: "c", lookup: "p7-l03", domains: ["sega.com"] },
  ];
  const envelopes = [
    env("p7-l01", [
      "https://news.example.com/xbox-rules",
      "https://www.xbox.com/en-US/developers/rules",
    ]),
    env("p7-l02", [
      "https://notnintendo.co.jp.evil.com/x",
      "https://example.com/y",
    ]),
  ];
  test("takes the first official-domain result and never guesses", () => {
    const { items, manifest } = buildPolicyPlan(policies, envelopes);
    assert.deepEqual(
      items.map((i) => i.url),
      ["https://www.xbox.com/en-US/developers/rules"],
    );
    assert.deepEqual(
      manifest.map((m) => m.status),
      ["found", "not found", "lookup not run"],
    );
    for (const i of items) assert.match(i.id, ITEM_ID);
    assert.ok(!JSON.stringify(manifest).includes("https://"));
    validatePlan(items);
  });
});

describe("buildFirstResultPlan", () => {
  test("first non-social, not-yet-selected result per query, within quota", () => {
    const envelopes = [
      env("p7-e01", [
        "https://www.reddit.com/r/a/comments/1/",
        "https://a.example.com/1",
      ]),
      env("p7-e02", ["https://a.example.com/1", "https://b.example.com/2"]),
      env("p7-e03", ["https://c.example.com/3"]),
    ];
    const { items, manifest } = buildFirstResultPlan(
      envelopes,
      ["p7-e03", "p7-e01", "p7-e02"],
      2,
    );
    assert.deepEqual(
      items.map((i) => i.url),
      ["https://a.example.com/1", "https://b.example.com/2"],
    );
    assert.equal(manifest.length, 2);
    validatePlan(items);
  });
});

describe("buildRevivalSample", () => {
  const links = (q, n) =>
    Array.from(
      { length: n },
      (_, i) => `https://site${i}.example.com/${q}/${i}`,
    );
  const envelopes = [
    env("p7-v01", [...links("v01", 5), "https://www.youtube.com/watch?v=1"]),
    env("p7-v02", links("v02", 5)),
    env("p7-d01", links("d01", 5)),
  ];
  test("round-robin, at most 2 per query, social and other groups excluded", () => {
    const { items, manifest } = buildRevivalSample(envelopes, [
      "p7-v01",
      "p7-v02",
    ]);
    assert.equal(manifest.eligible, 10);
    assert.deepEqual(manifest.selectedByQuery, { "p7-v01": 2, "p7-v02": 2 });
    assert.ok(
      items.every((i) => !i.url.includes("youtube") && !i.url.includes("d01")),
    );
    assert.ok(items.length <= QUOTAS.revival);
    validatePlan(items);
  });
  test("selection ignores titles", () => {
    const retitled = envelopes.map((e) => ({
      ...e,
      envelope: {
        data: {
          organic: e.envelope.data.organic.map((r) => ({ ...r, title: "zz" })),
        },
      },
    }));
    assert.deepEqual(
      buildRevivalSample(retitled, ["p7-v01", "p7-v02"]).manifest.recordIds,
      buildRevivalSample(envelopes, ["p7-v01", "p7-v02"]).manifest.recordIds,
    );
  });
  test("ids follow the fetch-rates pattern", () => {
    const { items } = buildRevivalSample(envelopes, ["p7-v01"]);
    for (const i of items)
      assert.equal(i.id, `ds-scrape-${recordIdFor(i.url)}`);
  });
});

describe("frozen Phase 7 config", () => {
  test("every policy has one lookup query and every lookup a policy", () => {
    const { queries, policies } = loadPhase7();
    const lookups = queries
      .filter((q) => q.group === "lookup")
      .map((q) => q.id);
    assert.deepEqual(policies.map((p) => p.lookup).sort(), [...lookups].sort());
    assert.equal(new Set(queries.map((q) => q.id)).size, queries.length);
    for (const q of queries) assert.match(q.id, /^p7-[edvlx]\d{2}$/);
    for (const p of policies) assert.ok(p.domains.length > 0, p.id);
  });
});
