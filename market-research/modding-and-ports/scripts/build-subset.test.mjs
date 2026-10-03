import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  COLLECTOR_GROUPS,
  FROZEN_SHA256,
  buildPlans,
  groupOfPlatform,
  selectSubset,
} from "./build-subset.mjs";
import { validatePlan } from "./bd-run.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

const listBytes = fs.readFileSync(path.join(CONFIG_DIR, "query-list.json"));
const list = JSON.parse(listBytes.toString("utf8"));
const matrix = JSON.parse(
  fs.readFileSync(path.join(CONFIG_DIR, "query-matrix.json"), "utf8"),
);
const intents = matrix.intents.map((i) => i.id);
const subset = selectSubset(list, intents);
const frozen = new Map(list.map((q) => [q.id, q.query]));

describe("selectSubset", () => {
  test("frozen list hash is unchanged", () => {
    const digest = crypto.createHash("sha256").update(listBytes).digest("hex");
    assert.equal(digest, FROZEN_SHA256);
  });

  test("220 pairs; each wave covers every pair once", () => {
    assert.equal(subset.pairs.length, 220);
    for (const wave of [subset.waveA, subset.waveB]) {
      assert.equal(wave.length, 220);
      const keys = new Set(wave.map((q) => `${q.platform}/${q.theme}`));
      assert.equal(keys.size, 220);
    }
  });

  test("each intent appears 44 times per wave", () => {
    for (const wave of [subset.waveA, subset.waveB]) {
      const counts = {};
      for (const q of wave) counts[q.intent] = (counts[q.intent] ?? 0) + 1;
      assert.deepEqual(Object.keys(counts).sort(), [...intents].sort());
      for (const n of Object.values(counts)) assert.equal(n, 44);
    }
  });

  test("intent rule: A = i mod 5, B = (i+2) mod 5", () => {
    subset.pairs.forEach((p, i) => {
      const a = subset.waveA[i];
      assert.equal(a.platform, p.platform);
      assert.equal(a.theme, p.theme);
      assert.equal(a.intent, intents[i % 5]);
      const b = subset.waveB.find(
        (q) => q.platform === p.platform && q.theme === p.theme,
      );
      assert.equal(b.intent, intents[(i + 2) % 5]);
    });
  });

  test("waves do not overlap; 36 disconfirmation queries", () => {
    const a = new Set(subset.waveA.map((q) => q.id));
    assert.ok(subset.waveB.every((q) => !a.has(q.id)));
    assert.equal(subset.disconfirm.length, 36);
  });

  test("every selected query is verbatim from the frozen list", () => {
    for (const q of [...subset.waveA, ...subset.waveB, ...subset.disconfirm]) {
      assert.equal(frozen.get(q.id), q.query, q.id);
    }
  });
});

describe("buildPlans", () => {
  const plans = buildPlans(subset);

  test("groups cover all 20 platforms exactly once", () => {
    const all = Object.values(COLLECTOR_GROUPS).flat();
    assert.equal(all.length, 20);
    assert.equal(new Set(all).size, 20);
    for (const p of matrix.platforms) assert.ok(groupOfPlatform(p.id), p.id);
  });

  test("group plans add up to the waves and are valid runner plans", () => {
    const groups = Object.keys(COLLECTOR_GROUPS);
    const sum = (wave) =>
      groups.reduce(
        (s, g) => s + plans[`phase2-wave-${wave}-${g}.json`].length,
        0,
      );
    assert.equal(sum("a"), 220);
    assert.equal(sum("b"), 220);
    assert.equal(plans["phase2-wave-b-all.json"].length, 220);
    assert.equal(plans["phase2-disconfirm.json"].length, 36);
    for (const plan of Object.values(plans)) {
      validatePlan(plan);
      for (const item of plan) {
        assert.equal(item.kind, "search");
        assert.equal(frozen.get(item.id), item.query);
      }
    }
  });

  test("pairs per group match the collector split", () => {
    const expected = { forums: 66, video: 33, modhubs: 88, dev: 33 };
    for (const [g, n] of Object.entries(expected)) {
      assert.equal(plans[`phase2-wave-a-${g}.json`].length, n);
    }
  });

  test("Wave B order is deterministic", () => {
    const again = buildPlans(selectSubset(list, intents));
    assert.deepEqual(
      again["phase2-wave-b-all.json"],
      plans["phase2-wave-b-all.json"],
    );
  });
});
