#!/usr/bin/env node
// Phase 2 subset rule (protocol section 10, registered 2026-10-02 before any
// Phase 2 request). Writes search plans for bd-run.mjs batch from the frozen
// config/query-list.json:
//   phase2-wave-a-<group>.json  pair i -> intents[i mod 5]
//   phase2-wave-b-<group>.json  pair i -> intents[(i+2) mod 5]
//   phase2-wave-b-all.json      all Wave B queries in fixed run order
//   phase2-disconfirm.json      all 36 disconfirmation queries
// The rule never looks at hypotheses or results. Wave B run order is the
// SHA-256 of the query id, so a budget cut-off is spread across platforms.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./build-queries.mjs";
import { CONFIG_DIR } from "./lib/paths.mjs";

export const FROZEN_SHA256 =
  "d2b459f4f0061518a22ed0dab2bff0a2fc2238e3d6059b337d40fd3545932bea";

/** Collector groups (plan section "Collector split"). */
export const COLLECTOR_GROUPS = Object.freeze({
  forums: ["reddit", "x", "discord", "resetera", "gbatemp", "fandom"],
  video: ["youtube", "tiktok", "twitch"],
  modhubs: [
    "nexusmods",
    "moddb",
    "gamebanana",
    "curseforge",
    "modio",
    "thunderstore",
    "steam",
    "itchio",
  ],
  dev: ["github", "hackernews", "rustforum"],
});

export function groupOfPlatform(platform) {
  for (const [group, platforms] of Object.entries(COLLECTOR_GROUPS)) {
    if (platforms.includes(platform)) return group;
  }
  return null;
}

function hashId(id) {
  return crypto.createHash("sha256").update(id).digest("hex");
}

/**
 * Applies the subset rule to the frozen list. `intents` is the ordered intent
 * id list from query-matrix.json. Returns frozen-list entries (verbatim).
 */
export function selectSubset(list, intents) {
  const byId = new Map(list.map((q) => [q.id, q]));
  const pairs = [];
  const seen = new Set();
  for (const q of list) {
    if (q.kind !== "matrix") continue;
    const key = `${q.platform}\u0000${q.theme}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ platform: q.platform, theme: q.theme });
  }
  const pick = (pair, intent) => {
    const id = `m-${pair.platform}-${pair.theme}-${intent}`;
    const entry = byId.get(id);
    if (!entry) throw new Error(`frozen list has no query ${id}`);
    return { ...entry, wave: null };
  };
  const n = intents.length;
  const waveA = pairs.map((p, i) => ({
    ...pick(p, intents[i % n]),
    wave: "A",
  }));
  const waveB = pairs.map((p, i) => ({
    ...pick(p, intents[(i + 2) % n]),
    wave: "B",
  }));
  const disconfirm = list
    .filter((q) => q.kind === "disconfirmation")
    .map((q) => ({ ...q, wave: "D" }));
  const waveBOrdered = [...waveB].sort((a, b) =>
    hashId(a.id) < hashId(b.id) ? -1 : 1,
  );
  return { pairs, waveA, waveB: waveBOrdered, disconfirm };
}

export function toPlan(entries) {
  return entries.map((q) => ({ id: q.id, kind: "search", query: q.query }));
}

export function buildPlans(subset) {
  const plans = {};
  for (const group of Object.keys(COLLECTOR_GROUPS)) {
    const inGroup = (q) => groupOfPlatform(q.platform) === group;
    plans[`phase2-wave-a-${group}.json`] = toPlan(subset.waveA.filter(inGroup));
    plans[`phase2-wave-b-${group}.json`] = toPlan(subset.waveB.filter(inGroup));
  }
  plans["phase2-wave-b-all.json"] = toPlan(subset.waveB);
  plans["phase2-disconfirm.json"] = toPlan(subset.disconfirm);
  return plans;
}

export function main({
  listPath = path.join(CONFIG_DIR, "query-list.json"),
  matrixPath = path.join(CONFIG_DIR, "query-matrix.json"),
  outDir = CONFIG_DIR,
} = {}) {
  const bytes = fs.readFileSync(listPath);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (digest !== FROZEN_SHA256) {
    throw new Error(`query-list.json hash changed: ${digest}`);
  }
  const list = JSON.parse(bytes.toString("utf8"));
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const subset = selectSubset(
    list,
    matrix.intents.map((i) => i.id),
  );
  const plans = buildPlans(subset);
  const lines = [`frozen sha256: ${digest}`];
  for (const [name, plan] of Object.entries(plans).sort()) {
    fs.writeFileSync(path.join(outDir, name), canonicalJson(plan), "utf8");
    lines.push(`${name}: ${plan.length}`);
  }
  lines.push(
    `pairs ${subset.pairs.length}, wave A ${subset.waveA.length}, wave B ${subset.waveB.length}, disconfirmation ${subset.disconfirm.length}`,
  );
  process.stdout.write(lines.join("\n") + "\n");
  return { digest, plans, subset };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
