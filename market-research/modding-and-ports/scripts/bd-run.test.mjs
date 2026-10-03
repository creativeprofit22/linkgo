import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertAllowedArgs,
  buildCallArgs,
  buildChildEnv,
  checkSpend,
  classifyResult,
  COST_ESTIMATES,
  countRecords,
  countRequests,
  createZoneCostMeter,
  effectiveBalance,
  effectiveCeiling,
  estimatePipelineCost,
  executeCall,
  HARD_SPEND_CAP_USD,
  parseZoneCostTable,
  resolveCli,
  runBatch,
  validatePlan,
} from "./bd-run.mjs";
import { createRunLog } from "./lib/run-log.mjs";

const KEY = "test-key-123456";

function fakeNpmRoot(version, { withIndex = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bd-npm-"));
  const cli = path.join(root, "@brightdata", "cli");
  fs.mkdirSync(path.join(cli, "dist"), { recursive: true });
  fs.writeFileSync(path.join(cli, "package.json"), JSON.stringify({ version }));
  if (withIndex) fs.writeFileSync(path.join(cli, "dist", "index.js"), "");
  return root;
}

describe("assertAllowedArgs", () => {
  test("allows the allow-listed verbs", () => {
    for (const args of [
      ["--version"],
      ["zones", "--json"],
      ["budget", "--json"],
      ["budget", "zones", "--json"],
      ["search", "--zone", "z", "--json", "--", "q"],
      ["scrape", "--zone", "z", "--", "https://example.com"],
      ["pipelines", "--json", "--", "reddit_posts", "https://reddit.com/r/x"],
    ]) {
      assert.doesNotThrow(() => assertAllowedArgs(args));
    }
  });

  test("refuses forbidden and unknown verbs", () => {
    for (const verb of ["login", "logout", "discover", "config", "init"]) {
      assert.throws(() => assertAllowedArgs([verb]), /forbidden/);
    }
    for (const verb of ["browser", "add", "skill", "status", "scraper", ""]) {
      assert.throws(() => assertAllowedArgs([verb]), /allow-listed/);
    }
    assert.throws(() => assertAllowedArgs(["zones", "info"]), /allow-listed/);
    assert.throws(() => assertAllowedArgs([]), /required/);
  });

  test("refuses --api-key in any position and form", () => {
    for (const args of [
      ["--api-key", KEY, "budget"],
      ["budget", "--api-key", KEY],
      ["budget", `--api-key=${KEY}`],
      ["budget", "-k", KEY],
      ["budget", `-k${KEY}`],
    ]) {
      assert.throws(() => assertAllowedArgs(args), /api-key/);
    }
  });
});

describe("buildCallArgs", () => {
  const zones = {
    serpZone: "serp_zone",
    unlockerZone: "unlocker_zone",
    timeoutS: 300,
  };

  test("search/scrape/pipeline argv never contains the key and passes --zone", () => {
    const items = [
      {
        id: "a",
        kind: "search",
        query: 'site:reddit.com "port" help',
        searchType: "news",
      },
      { id: "b", kind: "scrape", url: "https://example.com/x" },
      {
        id: "c",
        kind: "pipeline",
        type: "youtube_comments",
        url: "https://youtu.be/x",
        numComments: 25,
      },
    ];
    const built = items.map((item) => buildCallArgs(item, zones));
    for (const args of built) {
      assert.equal(args.join(" ").includes(KEY), false);
      assert.doesNotThrow(() => assertAllowedArgs(args));
    }
    assert.deepEqual(built[0], [
      "search",
      "--zone",
      "serp_zone",
      "--json",
      "--type",
      "news",
      "--",
      items[0].query,
    ]);
    assert.deepEqual(built[1].slice(0, 3), [
      "scrape",
      "--zone",
      "unlocker_zone",
    ]);
    assert.deepEqual(built[2].slice(-4), [
      "--",
      "youtube_comments",
      "https://youtu.be/x",
      "25",
    ]);
    assert.ok(built[2].includes("--timeout"));
  });

  test("requires zones and valid inputs", () => {
    assert.throws(
      () => buildCallArgs({ id: "a", kind: "search", query: "q" }, {}),
      /serp-zone/,
    );
    assert.throws(
      () => buildCallArgs({ id: "a", kind: "scrape", url: "u" }, {}),
      /unlocker-zone/,
    );
    assert.throws(
      () =>
        buildCallArgs(
          { id: "a", kind: "pipeline", type: "x;y", url: "u" },
          zones,
        ),
      /type/,
    );
    assert.throws(
      () => buildCallArgs({ id: "a", kind: "login" }, zones),
      /unknown/,
    );
  });
});

describe("buildChildEnv", () => {
  test("drops stale BRIGHTDATA_* and sets key and requested zones only", () => {
    const env = buildChildEnv(
      {
        PATH: "p",
        BRIGHTDATA_API_KEY: "stale-key",
        BRIGHTDATA_SERP_ZONE: "stale",
        brightdata_unlocker_zone: "stale",
        BRIGHTDATA_POLLING_TIMEOUT: "9999",
      },
      KEY,
      { serpZone: "serp_zone" },
    );
    assert.deepEqual(env, {
      PATH: "p",
      BRIGHTDATA_API_KEY: KEY,
      BRIGHTDATA_SERP_ZONE: "serp_zone",
    });
  });

  test("requires a key", () => {
    assert.throws(() => buildChildEnv({}, ""), /key/);
  });
});

describe("resolveCli version gate", () => {
  test("accepts exactly 0.3.7", () => {
    const cli = resolveCli({ npmRoot: fakeNpmRoot("0.3.7") });
    assert.equal(cli.version, "0.3.7");
    assert.match(cli.indexJs, /dist[\\/]index\.js$/);
  });

  test("refuses other versions and missing installs", () => {
    assert.throws(
      () => resolveCli({ npmRoot: fakeNpmRoot("0.3.8") }),
      /refused/,
    );
    assert.throws(
      () => resolveCli({ npmRoot: fakeNpmRoot("0.3.7", { withIndex: false }) }),
      /missing/,
    );
    assert.throws(
      () => resolveCli({ npmRoot: path.join(os.tmpdir(), "nope-bd") }),
      /not found/,
    );
  });
});

describe("classification", () => {
  test("statuses from exit code and stderr", () => {
    assert.equal(classifyResult({ exitCode: 0, recordCount: 3 }).status, "ok");
    assert.equal(
      classifyResult({ exitCode: 0, recordCount: 0 }).status,
      "empty",
    );
    assert.equal(
      classifyResult({
        exitCode: 1,
        stderr: "Timeout after 300 seconds waiting for data.",
      }).status,
      "timeout",
    );
    assert.equal(
      classifyResult({ exitCode: -1, timedOut: true }).status,
      "timeout",
    );
    assert.deepEqual(
      classifyResult({ exitCode: 1, stderr: "Error: nope\n  Status: 502" }),
      {
        status: "http_error",
        errorClass: "http_502",
      },
    );
    assert.equal(
      classifyResult({ exitCode: 1, stderr: "Error: x\n  Status: 403" }).status,
      "blocked",
    );
    assert.equal(
      classifyResult({ exitCode: 1, stderr: "Error: zone_blocked_by_policy" })
        .status,
      "blocked",
    );
    assert.equal(
      classifyResult({
        exitCode: 1,
        stderr: "Error: Network request failed — x",
      }).status,
      "http_error",
    );
    assert.equal(
      classifyResult({ exitCode: 1, stderr: "Error: No API key found." })
        .status,
      "cli_error",
    );
    assert.equal(
      classifyResult({ exitCode: 1, stderr: "weird" }).status,
      "cli_error",
    );
  });

  test("record and request counting", () => {
    assert.equal(countRecords("search", { organic: [{}, {}, {}] }), 3);
    assert.equal(countRecords("search", { news: [{}] }), 1);
    assert.equal(countRecords("search", {}), 0);
    assert.equal(countRecords("pipeline", [{}, {}]), 2);
    assert.equal(countRecords("scrape", "# page"), 1);
    assert.equal(countRecords("scrape", "  "), 0);
    assert.equal(countRequests("search", ""), 1);
    assert.equal(
      countRequests("pipeline", "Data received after 4 attempts"),
      5,
    );
    assert.equal(countRequests("pipeline", "polling again\npolling again"), 3);
  });
});

describe("spend ceiling", () => {
  test("effectiveBalance subtracts pending", () => {
    assert.equal(effectiveBalance({ balance: 10, pending_balance: 1.5 }), 8.5);
    assert.equal(effectiveBalance({ balance: 10 }), 10);
    assert.equal(effectiveBalance({ balance: 10, pending_costs: 2 }), 8);
    assert.equal(
      effectiveBalance({
        balance: 0,
        credit: 0,
        prepayment: 0,
        pending_costs: 0,
      }),
      0,
    );
    assert.equal(effectiveBalance({}), null);
  });

  test("parseZoneCostTable reads the CLI 0.3.7 text table", () => {
    const table =
      "zone         | cost ($) | bandwidth\n-------------+----------+----------\n" +
      "cli_unlocker | $1.25    | 3.0 KB   \ncli_serp     | $0.40    | 0 B      \n" +
      "TOTAL        | $1.65    | 3.0 KB   \n";
    assert.deepEqual(parseZoneCostTable(table), {
      zones: { cli_unlocker: 1.25, cli_serp: 0.4 },
      total: 1.65,
    });
    assert.deepEqual(parseZoneCostTable("No active zones found.\n"), {
      zones: {},
      total: 0,
    });
    assert.equal(parseZoneCostTable("garbage"), null);
    assert.equal(parseZoneCostTable(null), null);
  });

  test("ceiling is clamped to the $5 hard cap", () => {
    assert.equal(HARD_SPEND_CAP_USD, 5);
    assert.equal(effectiveCeiling(2), 2);
    assert.equal(effectiveCeiling(50), 5);
    assert.throws(() => effectiveCeiling(-1), /spend-ceiling/);
    assert.throws(() => effectiveCeiling(undefined), /spend-ceiling/);
  });

  test("checkSpend reserves the next item and fails closed on unknown spend", () => {
    assert.deepEqual(
      checkSpend({ spent: 0.5, reserve: 0.4, spendCeiling: 1 }),
      {
        stop: false,
        spent: 0.5,
        reason: null,
      },
    );
    assert.equal(
      checkSpend({ spent: 0.7, reserve: 0.4, spendCeiling: 1 }).reason,
      "spend_ceiling",
    );
    assert.equal(
      checkSpend({ spent: null, spendCeiling: 1 }).reason,
      "spend_unavailable",
    );
  });

  test("pipeline cost estimate charges the full reserve on failure", () => {
    assert.equal(
      estimatePipelineCost({ status: "ok", recordCount: 10 }),
      10 * COST_ESTIMATES.pipelinePerRecord,
    );
    assert.equal(
      estimatePipelineCost({ status: "timeout", recordCount: null }),
      COST_ESTIMATES.pipelineReserve,
    );
  });

  test("zone-cost guard stops the batch at the $5 hard cap even with a higher ceiling", async () => {
    // Each scrape bills $1.20 to the zone; the fake `budget zones` TOTAL rises.
    let zoneTotal = 3.0; // month-to-date cost before the batch starts
    const meter = createZoneCostMeter({ readZoneTotal: async () => zoneTotal });
    const executed = [];
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      kind: "scrape",
    }));
    const summary = await runBatch(items, {
      spendCeiling: 100, // requested far above the cap
      meter,
      execute: async (item, { spendBefore }) => {
        executed.push([item.id, Number(spendBefore.toFixed(2))]);
        zoneTotal += 1.2;
        return { status: "ok", recordCount: 1 };
      },
    });
    // spend before each item: 0, 1.2, 2.4, 3.6, 4.8. After s0 the guard has
    // measured $1.20 per item and reserves that: 4.8 + 1.2 > 5, so it stops
    // before s4 instead of overshooting to $6.
    assert.deepEqual(executed, [
      ["s0", 0],
      ["s1", 1.2],
      ["s2", 2.4],
      ["s3", 3.6],
    ]);
    assert.equal(summary.ceiling, 5);
    assert.equal(summary.stopReason, "spend_ceiling");
    assert.ok(summary.spent <= 5, `spent ${summary.spent} must be <= $5`);
  });

  test("zone-cost guard counts estimated pipeline cost against the cap", async () => {
    // Pipelines do not bill a zone, so only the estimate moves the meter.
    const meter = createZoneCostMeter({ readZoneTotal: async () => 0 });
    let ran = 0;
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      kind: "pipeline",
    }));
    const summary = await runBatch(items, {
      spendCeiling: 1,
      meter,
      execute: async () => {
        ran++;
        return { status: "timeout", recordCount: null }; // billed at full reserve
      },
    });
    // 0.25 per run: before run n spent = 0.25n; stop when 0.25n + 0.25 > 1 → 4 runs.
    assert.equal(ran, 4);
    assert.equal(summary.stopReason, "spend_ceiling");
    assert.ok(summary.spent <= 1);
  });

  test("runBatch respects max requests and refuses to run when spend is unreadable", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      kind: "search",
    }));
    const capped = await runBatch(items, {
      spendCeiling: 5,
      maxRequests: 2,
      meter: createZoneCostMeter({ readZoneTotal: async () => 0 }),
      execute: async (item) => item,
    });
    assert.equal(capped.results.length, 2);
    assert.equal(capped.stopReason, "max_requests");

    let ran = 0;
    const blind = await runBatch(items, {
      spendCeiling: 5,
      meter: createZoneCostMeter({ readZoneTotal: async () => null }),
      execute: async () => ran++,
    });
    assert.equal(ran, 0);
    assert.equal(blind.stopReason, "spend_unavailable");

    // Readable at start, unreadable mid-batch → stop before the next item.
    let reads = 0;
    let ranMid = 0;
    const flaky = await runBatch(items, {
      spendCeiling: 5,
      meter: createZoneCostMeter({
        readZoneTotal: async () => (reads++ === 0 ? 0 : null),
      }),
      execute: async () => ranMid++,
    });
    assert.equal(ranMid, 1);
    assert.equal(flaky.stopReason, "spend_unavailable");
  });

  test("runBatch with parallel lanes runs everything under the ceiling", async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `i${i}`,
      kind: "search",
    }));
    let active = 0;
    let peak = 0;
    const summary = await runBatch(items, {
      spendCeiling: 5,
      maxParallel: 3,
      meter: createZoneCostMeter({ readZoneTotal: async () => 0 }),
      execute: async (item) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return item;
      },
    });
    assert.equal(summary.results.length, 6);
    assert.equal(summary.stopReason, "done");
    assert.ok(peak <= 3);
  });

  test("runBatch requires a ceiling", async () => {
    await assert.rejects(
      runBatch([], {
        meter: createZoneCostMeter({ readZoneTotal: async () => 0 }),
        execute: async () => {},
      }),
      /spend-ceiling/,
    );
  });
});

describe("validatePlan", () => {
  test("rejects unsafe ids, duplicates and bad kinds", () => {
    assert.throws(() => validatePlan({}), /array/);
    assert.throws(() => validatePlan([{ id: "../x", kind: "search" }]), /id/);
    assert.throws(
      () =>
        validatePlan([
          { id: "a", kind: "search" },
          { id: "a", kind: "search" },
        ]),
      /duplicate/,
    );
    assert.throws(() => validatePlan([{ id: "a", kind: "budget" }]), /kind/);
  });
});

describe("executeCall", () => {
  test("redacts child output in raw file and log; argv has no key", async () => {
    const rawRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bd-exec-"));
    const seen = [];
    const ctx = {
      key: KEY,
      now: () => new Date("2026-10-02T12:00:00.000Z"),
      phase: "01-protocol",
      rawRoot,
      timeoutS: 300,
      cli: { indexJs: "index.js" },
      env: buildChildEnv({}, KEY, { serpZone: "serp_zone" }),
      log: createRunLog({
        path: path.join(rawRoot, "run-log.jsonl"),
        key: KEY,
      }),
      runChildImpl: async ({ args, env }) => {
        seen.push({ args, env });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            organic: [{ link: "https://a.com", title: `echo ${KEY}` }],
          }),
          stderr: `debug Bearer ${KEY}`,
          timedOut: false,
        };
      },
    };
    const args = buildCallArgs(
      { id: "q1", kind: "search", query: "q" },
      { serpZone: "serp_zone" },
    );
    const record = await executeCall(ctx, {
      id: "q1",
      kind: "search",
      input: "q",
      args,
      subdir: "search",
    });
    assert.equal(record.status, "ok");
    assert.equal(record.recordCount, 1);
    assert.equal(seen[0].args.includes(KEY), false);
    assert.equal(seen[0].env.BRIGHTDATA_API_KEY, KEY);
    const raw = fs.readFileSync(
      path.join(rawRoot, "search", "q1.json"),
      "utf8",
    );
    const log = fs.readFileSync(path.join(rawRoot, "run-log.jsonl"), "utf8");
    assert.equal(raw.includes(KEY), false);
    assert.equal(log.includes(KEY), false);
    assert.match(raw, /\[redacted\]/);
  });
});
