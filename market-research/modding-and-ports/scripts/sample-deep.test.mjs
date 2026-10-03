import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_STRATA,
  buildDeepSample,
  collectCandidates,
  stratumOf,
} from "./sample-deep.mjs";
import { validatePlan } from "./bd-run.mjs";
import { ITEM_ID } from "./fetch-rates.mjs";

const platforms = [
  { id: "reddit", host: "reddit.com" },
  { id: "youtube", host: "youtube.com" },
  { id: "x", host: "x.com" },
  { id: "tiktok", host: "tiktok.com" },
  { id: "gbatemp", host: "gbatemp.net" },
];
const queries = [
  { id: "m-reddit-a-b", kind: "matrix", platform: "reddit" },
  { id: "m-youtube-a-b", kind: "matrix", platform: "youtube" },
  { id: "m-gbatemp-a-b", kind: "matrix", platform: "gbatemp" },
  { id: "d-H1-1", kind: "disconfirmation", hypothesis: "H1" },
];
const env = (queryId, links) => ({
  queryId,
  envelope: { data: { organic: links.map((link) => ({ link, title: "x" })) } },
});

describe("eligibility by URL shape", () => {
  const get = (method) => PIPELINE_STRATA.find((s) => s.method === method);
  const cases = [
    ["reddit_posts", "https://www.reddit.com/r/a/comments/abc12/t/", true],
    ["reddit_posts", "https://www.reddit.com/r/a/", false],
    ["youtube_videos", "https://www.youtube.com/watch?v=abc", true],
    ["youtube_videos", "https://www.youtube.com/shorts/abc", true],
    ["youtube_videos", "https://youtu.be/abc", true],
    ["youtube_videos", "https://www.youtube.com/@chan", false],
    ["tiktok_posts", "https://www.tiktok.com/@u/video/123", true],
    ["tiktok_posts", "https://www.tiktok.com/@u", false],
    ["x_posts", "https://x.com/u/status/123", true],
    ["x_posts", "https://x.com/u", false],
    ["instagram_posts", "https://www.instagram.com/p/abc/", true],
    ["instagram_posts", "https://www.instagram.com/someone/", false],
    ["facebook_posts", "https://www.facebook.com/page/posts/123", true],
    ["facebook_posts", "https://www.facebook.com/page", false],
  ];
  for (const [method, url, expected] of cases) {
    test(`${method} ${url}`, () =>
      assert.equal(get(method).eligible(new URL(url)), expected));
  }
});

describe("stratumOf", () => {
  test("matrix hosts, IG/FB, other", () => {
    assert.equal(stratumOf("old.reddit.com", platforms), "reddit");
    assert.equal(stratumOf("www.instagram.com", platforms), "instagram");
    assert.equal(stratumOf("m.facebook.com", platforms), "facebook");
    assert.equal(stratumOf("example.org", platforms), "other");
  });
});

describe("collectCandidates + buildDeepSample", () => {
  const envelopes = [
    env("m-reddit-a-b", [
      "https://www.reddit.com/r/a/comments/1/x",
      "https://www.reddit.com/r/a/comments/1/x/",
      "https://www.reddit.com/r/a/",
      "https://off-site.example/z",
    ]),
    env("m-youtube-a-b", [
      "https://www.youtube.com/watch?v=v1",
      "https://www.youtube.com/watch?v=v2",
    ]),
    env("m-gbatemp-a-b", [
      "https://gbatemp.net/t/1",
      "https://gbatemp.net/t/2",
      "https://gbatemp.net/t/3",
    ]),
    env("d-H1-1", [
      "https://www.instagram.com/p/abc/",
      "https://news.example/article",
      "https://x.com/u/status/9",
    ]),
  ];
  const candidates = collectCandidates(envelopes, queries, platforms);

  test("off-site matrix results excluded, duplicates merged", () => {
    const urls = [...candidates.values()].map((c) => c.url);
    assert.equal(
      urls.some((u) => u.includes("off-site")),
      false,
    );
    assert.equal(candidates.size, 10);
  });

  const { plans, manifest } = buildDeepSample(candidates, platforms);

  test("plans are valid runner plans with deep-sample ids", () => {
    for (const items of Object.values(plans)) {
      validatePlan(items);
      for (const item of items) assert.match(item.id, ITEM_ID);
    }
  });

  test("pipelines by platform; open-web X/IG results eligible; quotas hold", () => {
    assert.equal(plans["deep-reddit-x.json"].length, 2);
    assert.equal(plans["deep-ig-fb.json"].length, 1);
    const yt = plans["deep-youtube.json"];
    assert.equal(yt.filter((i) => i.type === "youtube_videos").length, 2);
    assert.equal(yt.filter((i) => i.type === "youtube_comments").length, 2);
    assert.ok(
      yt.every((i) => i.type !== "youtube_comments" || i.numComments === 10),
    );
    const scrape = plans["deep-scrape.json"];
    assert.equal(scrape.filter((i) => i.url.includes("gbatemp")).length, 2);
    assert.equal(
      scrape.filter((i) => i.url.includes("news.example")).length,
      1,
    );
    assert.equal(
      scrape.some((i) => /reddit|youtube/.test(i.url)),
      false,
    );
  });

  test("selection is ordered by recordId and is deterministic", () => {
    const scrape = plans["deep-scrape.json"].filter((i) =>
      i.url.includes("gbatemp"),
    );
    const ids = scrape.map((i) => i.id);
    assert.deepEqual(ids, [...ids].sort());
    const again = buildDeepSample(
      collectCandidates(envelopes, queries, platforms),
      platforms,
    );
    assert.deepEqual(again.plans, plans);
  });

  test("manifest records quotas and counts without URLs", () => {
    assert.equal(JSON.stringify(manifest).includes("http"), false);
    const ig = manifest.find((m) => m.method === "instagram_posts");
    assert.deepEqual(ig, {
      stratum: "instagram",
      method: "instagram_posts",
      quota: 5,
      candidates: 1,
      eligible: 1,
      selected: 1,
    });
  });
});
