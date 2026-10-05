import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  citedVenues,
  countVenues,
  ownPlatform,
  parseReading,
  toCsv,
} from "./count-venues.mjs";

describe("citedVenues", () => {
  test("needs the venue name and a gathering cue in the same sentence", () => {
    assert.deepEqual(citedVenues("Join our Discord for help."), ["discord"]);
    assert.deepEqual(citedVenues("Discord. Twitter. YouTube."), []);
    assert.deepEqual(
      citedVenues("Ask on the subreddit. Our forum has a help section."),
      ["forum", "reddit"],
    );
    assert.deepEqual(citedVenues("Post it on r/skyrimmods please"), ["reddit"]);
  });
  test("does not read 'x' or 'steam' alone as venues", () => {
    assert.deepEqual(citedVenues("join x and get steam for help"), []);
    assert.deepEqual(citedVenues("ask in the Steam Workshop discussions"), [
      "steam",
    ]);
  });
});

describe("parseReading", () => {
  test("pipeline records keep text fields only", () => {
    const raw = [
      "item: ds-reddit_posts-0123456789abcdef",
      "host: www.reddit.com",
      "---",
      "[0].title: Where do modders talk?",
      "[0].community_name: discord",
      "[0].url: https://discord.gg/abc",
      "[0].comments[0].comment: join the discord server",
    ].join("\n");
    const r = parseReading(raw);
    assert.equal(r.item, "ds-reddit_posts-0123456789abcdef");
    assert.ok(!r.text.includes("discord.gg"));
    assert.ok(!r.text.includes("community_name"));
    assert.deepEqual(citedVenues(r.text), ["discord"]);
  });
  test("scrape records are read whole", () => {
    const r = parseReading(
      "item: ds-scrape-0123456789abcdef\nhost: a.example.com\n---\nAsk on our forum.",
    );
    assert.deepEqual(citedVenues(r.text), ["forum"]);
  });
});

describe("countVenues", () => {
  const readings = [
    {
      item: "ds-reddit_posts-0000000000000001",
      host: "www.reddit.com",
      text: "ask on the subreddit. join our discord server",
    },
    {
      item: "ds-scrape-0000000000000002",
      host: "a.example.com",
      text: "Join our Discord.",
    },
    {
      item: "ds-scrape-0000000000000003",
      host: "b.example.com",
      text: "Nothing here.",
    },
  ];
  test("counts records, shares and the own-platform exclusion", () => {
    const res = countVenues(readings);
    const d = res.rows.find((r) => r.venue === "discord");
    const rd = res.rows.find((r) => r.venue === "reddit");
    assert.equal(d.records, 2);
    assert.equal(rd.records, 1);
    assert.equal(rd.recordsExclOwn, 0);
    assert.equal(d.share, 0.667);
    assert.deepEqual(d.bySource, { reddit_posts: 1, scrape: 1 });
    assert.ok(!toCsv(res).includes("http"));
  });
  test("ownPlatform maps pipelines and known hosts", () => {
    assert.equal(
      ownPlatform("ds-youtube_videos-0000000000000001", ""),
      "youtube",
    );
    assert.equal(
      ownPlatform("ds-scrape-0000000000000001", "disboard.org"),
      "discord",
    );
    assert.equal(
      ownPlatform("ds-scrape-0000000000000001", "old.reddit.com"),
      "reddit",
    );
    assert.equal(
      ownPlatform("ds-scrape-0000000000000001", "example.com"),
      "web",
    );
  });
});
