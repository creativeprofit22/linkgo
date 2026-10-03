import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildFetchRates, methodOf } from "./fetch-rates.mjs";

const rid1 = "0123456789abcdef";
const rid2 = "fedcba9876543210";

describe("methodOf", () => {
  test("scrape, pipeline type, other", () => {
    assert.equal(methodOf({ kind: "scrape" }), "scrape");
    assert.equal(
      methodOf({
        kind: "pipeline",
        args: ["pipelines", "--json", "--", "reddit_posts", "u"],
      }),
      "reddit_posts",
    );
    assert.equal(methodOf({ kind: "search" }), null);
  });
});

describe("buildFetchRates", () => {
  const pipe = (id, status, extra = {}) => ({
    id,
    kind: "pipeline",
    args: ["pipelines", "--", "reddit_posts", "u"],
    status,
    recordCount: status === "ok" ? 1 : 0,
    ...extra,
  });
  const entries = [
    pipe(`ds-reddit_posts-${rid1}`, "failed", { errorClass: "timeout" }),
    pipe(`ds-reddit_posts-${rid1}`, "ok"),
    pipe(`ds-reddit_posts-${rid2}`, "blocked", { errorClass: "brd_error" }),
    { id: `ds-scrape-${rid1}`, kind: "scrape", status: "ok", recordCount: 1 },
    { id: "f01-not-deep-sample", kind: "scrape", status: "ok", recordCount: 1 },
    { id: "m-x", kind: "search", status: "ok" },
  ];
  const coding = [
    { recordId: rid1, method: "reddit_posts", usable: "yes" },
    { recordId: rid1, method: "scrape", usable: "no" },
  ];
  const rows = buildFetchRates(entries, coding);
  const by = Object.fromEntries(rows.map((r) => [r.method, r]));

  test("last attempt decides; retries counted; failures by class", () => {
    assert.deepEqual(by.reddit_posts, {
      method: "reddit_posts",
      items: 2,
      attempts: 3,
      ok: 1,
      okWithRecords: 1,
      failed: 1,
      failedByClass: "brd_error:1",
      coded: 1,
      usable: 1,
      okRate: "0.500",
      usableRate: "0.500",
    });
  });

  test("usable comes from the coding table; non-sample ids ignored", () => {
    assert.equal(by.scrape.items, 1);
    assert.equal(by.scrape.usable, 0);
    assert.equal(by.scrape.usableRate, "0.000");
    assert.equal(by.all.items, 3);
    assert.equal(by.all.usable, 1);
  });
});
