import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  audienceRows,
  compileTerms,
  competitorRows,
  isOnTopic,
  matchTerms,
  onTopicRecords,
  organisationFor,
  outcomeFor,
  readingBody,
} from "./count-terms.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const config = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, "phase10-terms.json"), "utf8"),
);
const compiled = compileTerms(config);
const T = config.thresholds;

describe("frozen terms", () => {
  test("phrase family matches both spellings; need terms match", () => {
    const m = matchTerms(
      "We are democratising modding. It is easy; no coding needed.",
      compiled,
    );
    assert.equal(m.phrase.size, 1);
    assert.ok(m.need.size >= 2);
    assert.equal(matchTerms("Democratize it", compiled).phrase.size, 1);
    assert.equal(matchTerms("an easygoing guide", compiled).need.size, 0);
  });
});

describe("readingBody", () => {
  test("drops the header and field paths", () => {
    const text =
      "item: x\nrole: learner p10-g01 easy\n---\n[0].title: Simple start\n[0].comments[1].comment: fine";
    assert.equal(readingBody(text), "Simple start\nfine");
  });
});

describe("isOnTopic / onTopicRecords", () => {
  test("rules per file; union of phases per record", () => {
    assert.ok(
      isOnTopic(
        { usable: "yes", stance: "neutral" },
        "usable=yes and any row stance != off-topic",
      ),
    );
    assert.ok(
      !isOnTopic(
        { usable: "yes", stance: "off-topic" },
        "usable=yes and any row stance != off-topic",
      ),
    );
    assert.ok(
      isOnTopic(
        { usable: "yes", H3: "off-topic", H10: "supports", H11: "off-topic" },
        "usable=yes and any of H3/H10/H11 != off-topic",
      ),
    );
    assert.throws(() => isOnTopic({}, "nonsense"));
    const rows = {
      a: [
        { recordId: "r1", onTopic: "yes" },
        { recordId: "r2", onTopic: "no" },
      ],
      b: [{ recordId: "r1", onTopic: "yes" }],
    };
    const recs = onTopicRecords(
      [
        { phase: "a", file: "f", rule: "onTopic=yes" },
        { phase: "b", file: "f", rule: "onTopic=yes" },
      ],
      (phase) => rows[phase],
    );
    assert.deepEqual([...recs.keys()], ["r1"]);
    assert.deepEqual([...recs.get("r1")].sort(), ["a", "b"]);
  });
});

describe("outcomeFor", () => {
  test("rules in order", () => {
    assert.equal(
      outcomeFor({ phrase: 0.01, synonymOnly: 0.04, need: 0.5 }, T),
      "phrase fits",
    );
    assert.equal(
      outcomeFor({ phrase: 0, synonymOnly: 0.02, need: 0.3 }, T),
      "concept fits, wording doesn't",
    );
    assert.equal(
      outcomeFor({ phrase: 0, synonymOnly: 0, need: 0.05 }, T),
      "doesn't fit",
    );
    assert.equal(
      outcomeFor({ phrase: 0, synonymOnly: 0, need: 0.15 }, T),
      "mixed",
    );
  });
});

describe("audienceRows", () => {
  test("denominator excludes records without reading; outcome per scope", () => {
    const records = new Map([
      ["r1", new Set(["03-audience"])],
      ["r2", new Set(["03-audience"])],
      ["r3", new Set(["10-personas"])],
      ["r4", new Set(["03-audience"])],
    ]);
    const texts = new Map([
      ["r1", "too hard to set up"],
      ["r2", "nice mod"],
      ["r3", "it is simple"],
    ]);
    const rows = audienceRows(records, texts, compiled, T);
    const all = rows.find(
      (r) => r.scope === "all" && r.family === "need" && r.term === "*",
    );
    assert.equal(all.withReading, 3);
    assert.equal(all.missingReading, 1);
    assert.equal(all.records, 2);
    const without = rows.find(
      (r) =>
        r.scope === "all-without-10" && r.family === "need" && r.term === "*",
    );
    assert.equal(without.records, 1);
    const outcome = rows.find(
      (r) => r.scope === "all" && r.family === "outcome",
    );
    assert.equal(outcome.term, "concept fits, wording doesn't");
  });
});

describe("competitor side", () => {
  const known = [
    { name: "mod.io", host: "mod.io" },
    { name: "Nexus Mods", host: "nexusmods.com" },
  ];
  test("organisationFor maps subdomains to the known organisation", () => {
    assert.deepEqual(organisationFor("docs.mod.io", known), {
      organisation: "mod.io",
      known: "yes",
    });
    assert.deepEqual(organisationFor("www.example.org", known), {
      organisation: "example.org",
      known: "no",
    });
  });
  test("only phrase/synonym matches are kept; snippets flagged", () => {
    const rows = competitorRows(
      [
        {
          source: "stored-page",
          phase: "04-competitors",
          recordId: "r1",
          host: "mod.io",
          text: "Modding for everyone",
        },
        {
          source: "search-snippet",
          phase: "10-personas",
          queryId: "p10-c01",
          host: "blog.example.org",
          text: "Democratizing modding",
        },
        {
          source: "stored-page",
          phase: "04-competitors",
          recordId: "r2",
          host: "nexusmods.com",
          text: "easy installs",
        },
      ],
      compiled,
      known,
    );
    assert.equal(rows.length, 2);
    const snip = rows.find((r) => r.source === "search-snippet");
    assert.equal(snip.snippetOnly, "yes");
    assert.equal(snip.phraseTerms.length > 0, true);
    assert.equal(
      rows.find((r) => r.organisation === "mod.io").knownCompetitor,
      "yes",
    );
  });
});
