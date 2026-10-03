#!/usr/bin/env node
// Guarded runner for the Bright Data CLI (pinned to 0.3.7).
// - The API key comes from Windows Credential Manager (lib/secret.mjs) and is
//   passed to the child ONLY as env BRIGHTDATA_API_KEY, never in argv.
// - Every child output passes through redact() before it is printed or saved.
// - Every CLI call writes one line to data/raw/<phase>/run-log.jsonl.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadApiKey, redact, containsSecret } from "./lib/secret.mjs";
import { createRunLog } from "./lib/run-log.mjs";
import {
  DATA_DIR,
  DEFAULT_PHASE,
  assertSafeName,
  rawDir,
} from "./lib/paths.mjs";
import {
  defaultLedgerPath,
  reserveSpend,
  settleSpend,
} from "./lib/spend-ledger.mjs";

export const REQUIRED_CLI_VERSION = "0.3.7";
const ALLOWED_VERBS = [
  "search",
  "scrape",
  "pipelines",
  "zones",
  "budget",
  "--version",
];
const FORBIDDEN_VERBS = ["login", "logout", "discover", "config", "init"];
const SEARCH_TIMEOUT_MS = 180_000;
const DEFAULT_PIPELINE_TIMEOUT_S = 300;

export const USAGE = `Usage: node bd-run.mjs <command> [options]

Commands:
  readiness                       --version, zones, budget, budget zones (no spend)
  budget                          show balance (no spend)
  search <query>                  one SERP call (needs --serp-zone)
  scrape <url>                    one Web Unlocker call (needs --unlocker-zone)
  pipeline <type> <url>           one pipeline snapshot (polls until --timeout)
  batch <plan.json>               run a plan (needs --spend-ceiling)

Options:
  --phase <name>          data phase folder (default ${DEFAULT_PHASE})
  --serp-zone <zone>      SERP zone for search
  --unlocker-zone <zone>  Web Unlocker zone for scrape
  --max-parallel <n>      batch concurrency (default 1)
  --max-requests <n>      batch item cap (default: plan length)
  --spend-ceiling <usd>   batch stops once spend exceeds this (also capped by
                          data/spend-ledger.json: study $5 and per-phase caps)
  --timeout <s>           pipeline polling timeout (default ${DEFAULT_PIPELINE_TIMEOUT_S})
  --id <id>               record id for single search/scrape/pipeline
  --search-type <type>    search type, e.g. news
  --num-comments <n>      youtube_comments comment count
  -h, --help              show this help

Plan items: {"id","kind":"search|scrape|pipeline","query"|"url","type"?,"searchType"?,"numComments"?}`;

// ---------- pure guards ----------

export function assertAllowedArgs(args) {
  if (!Array.isArray(args) || args.length === 0)
    throw new Error("CLI args required");
  for (const arg of args) {
    if (typeof arg !== "string") throw new Error("CLI args must be strings");
    // -k is commander's short alias for --api-key (also accepts -kVALUE).
    if (arg.startsWith("--api-key") || /^-k/.test(arg)) {
      throw new Error("refusing --api-key: the key goes through env only");
    }
  }
  const verb = args[0];
  if (FORBIDDEN_VERBS.includes(verb))
    throw new Error(`refusing forbidden CLI verb: ${verb}`);
  if (!ALLOWED_VERBS.includes(verb))
    throw new Error(`CLI verb not allow-listed: ${verb}`);
  const sub = args[1];
  if (
    verb === "budget" &&
    sub &&
    !sub.startsWith("--") &&
    !["balance", "zones", "zone"].includes(sub)
  ) {
    throw new Error("budget subcommand not allow-listed");
  }
  if (verb === "zones" && args[1] && !args[1].startsWith("--")) {
    throw new Error("zones subcommand not allow-listed");
  }
  return args;
}

export function buildChildEnv(baseEnv, key, { serpZone, unlockerZone } = {}) {
  if (!key) throw new Error("API key required for child env");
  const env = {};
  for (const [name, value] of Object.entries(baseEnv ?? {})) {
    if (name.toUpperCase().startsWith("BRIGHTDATA_")) continue;
    env[name] = value;
  }
  env.BRIGHTDATA_API_KEY = key;
  if (serpZone) env.BRIGHTDATA_SERP_ZONE = serpZone;
  if (unlockerZone) env.BRIGHTDATA_UNLOCKER_ZONE = unlockerZone;
  return env;
}

export function npmGlobalRoot(env = process.env) {
  return path.join(env.APPDATA ?? "", "npm", "node_modules");
}

export function resolveCli({ npmRoot = npmGlobalRoot() } = {}) {
  const root = path.join(npmRoot, "@brightdata", "cli");
  const pkgPath = path.join(root, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    throw new Error(`Bright Data CLI not found at ${root}`);
  }
  if (pkg.version !== REQUIRED_CLI_VERSION) {
    throw new Error(
      `Bright Data CLI version ${pkg.version} refused; pinned to ${REQUIRED_CLI_VERSION}`,
    );
  }
  const indexJs = path.join(root, "dist", "index.js");
  if (!fs.existsSync(indexJs))
    throw new Error("Bright Data CLI entry dist/index.js missing");
  return { root, indexJs, version: pkg.version };
}

// ---------- argv builders (never contain the key) ----------

export function buildCallArgs(item, { serpZone, unlockerZone, timeoutS } = {}) {
  switch (item.kind) {
    case "search": {
      if (!serpZone) throw new Error("search needs --serp-zone");
      if (!item.query) throw new Error(`search item ${item.id} needs query`);
      const args = ["search", "--zone", serpZone, "--json"];
      if (item.searchType) args.push("--type", item.searchType);
      // "--" stops option parsing so a query can never be read as a flag.
      args.push("--", item.query);
      return args;
    }
    case "scrape": {
      if (!unlockerZone) throw new Error("scrape needs --unlocker-zone");
      if (!item.url) throw new Error(`scrape item ${item.id} needs url`);
      return [
        "scrape",
        "--zone",
        unlockerZone,
        "--format",
        "markdown",
        "--json",
        "--",
        item.url,
      ];
    }
    case "pipeline": {
      if (!item.type || !/^[a-z_]+$/.test(item.type)) {
        throw new Error(`pipeline item ${item.id} needs a type`);
      }
      if (!item.url) throw new Error(`pipeline item ${item.id} needs url`);
      const args = ["pipelines", "--format", "json"];
      args.push(
        "--timeout",
        String(timeoutS ?? DEFAULT_PIPELINE_TIMEOUT_S),
        "--json",
      );
      args.push("--", item.type, item.url);
      if (item.type === "youtube_comments" && item.numComments != null) {
        const n = Number.parseInt(item.numComments, 10);
        if (!Number.isInteger(n) || n < 1)
          throw new Error(`item ${item.id}: bad numComments`);
        args.push(String(n));
      }
      return args;
    }
    default:
      throw new Error(`unknown item kind: ${item.kind}`);
  }
}

// ---------- classification ----------

export function parseJsonOutput(stdout) {
  const text = (stdout ?? "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function countRecords(kind, data) {
  if (data == null) return 0;
  if (kind === "search") {
    if (Array.isArray(data.organic)) return data.organic.length;
    if (Array.isArray(data.news)) return data.news.length;
    return 0;
  }
  if (kind === "scrape")
    return typeof data === "string" ? (data.trim() ? 1 : 0) : 1;
  if (Array.isArray(data)) return data.length;
  if (typeof data === "object") return Object.keys(data).length ? 1 : 0;
  return 0;
}

export function countRequests(kind, stderr) {
  if (kind !== "pipeline") return 1;
  const received = /Data received after (\d+) attempts/.exec(stderr ?? "");
  if (received) return 1 + Number(received[1]);
  const polls = (stderr ?? "").match(/polling again/g)?.length ?? 0;
  return 1 + polls;
}

export function classifyResult({
  exitCode,
  stderr = "",
  timedOut = false,
  recordCount = 0,
}) {
  if (timedOut || /Timeout after \d+ seconds/.test(stderr)) {
    return { status: "timeout", errorClass: "timeout" };
  }
  if (exitCode === 0) {
    return recordCount > 0
      ? { status: "ok", errorClass: null }
      : { status: "empty", errorClass: null };
  }
  if (
    /No API key found|No zone specified|No Web Unlocker zone|Unknown pipeline type/.test(
      stderr,
    )
  ) {
    return { status: "cli_error", errorClass: "cli_config" };
  }
  const httpStatus = /Status: (\d{3})/.exec(stderr);
  if (httpStatus) {
    const code = Number(httpStatus[1]);
    if (code === 403) return { status: "blocked", errorClass: "http_403" };
    return { status: "http_error", errorClass: `http_${code}` };
  }
  if (/Network request failed|Max retries exceeded/.test(stderr)) {
    return { status: "http_error", errorClass: "network" };
  }
  // client.js turns an x-brd-error / x-luminati-error header into "Error: <reason>".
  if (/^Error: /m.test(stderr))
    return { status: "blocked", errorClass: "brd_error" };
  return { status: "cli_error", errorClass: `exit_${exitCode}` };
}

// ---------- spend ceiling ----------
//
// The saved API key cannot read the account balance (HTTP 403 on
// /customer/balance, 2026-10-02), so spend is measured from `budget zones`
// (per-zone cost this month) instead. Scraper API pipelines are not billed to
// a zone, so their cost is estimated conservatively per record. Before every
// item the guard reserves that item's worst-case cost and stops if measured
// spend plus the reserve would pass the ceiling. Unknown spend fails closed.

/** Absolute ceiling until the owner approves a cap; any --spend-ceiling is clamped to it. */
export const HARD_SPEND_CAP_USD = 5;

/**
 * Conservative cost assumptions (USD). List prices are about $1.50 per 1,000
 * requests or records; these are set several times higher on purpose.
 */
export const COST_ESTIMATES = Object.freeze({
  searchReserve: 0.01,
  scrapeReserve: 0.01,
  pipelineReserve: 0.25,
  pipelinePerRecord: 0.005,
});

export function effectiveCeiling(requested, hardCap = HARD_SPEND_CAP_USD) {
  if (!Number.isFinite(requested) || requested < 0) {
    throw new Error("batch requires a non-negative --spend-ceiling");
  }
  return Math.min(requested, hardCap);
}

/** Available balance; a pending charge counts as already spent (conservative). */
export function effectiveBalance(raw) {
  if (!raw || typeof raw.balance !== "number" || !Number.isFinite(raw.balance))
    return null;
  // The live API (2026-10-02) returns `pending_costs`; the CLI's own summary
  // reads `pending_balance`. Count whichever is larger as already spent.
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const pending = Math.max(num(raw.pending_balance), num(raw.pending_costs));
  return raw.balance - pending;
}

/**
 * Parses the text table printed by CLI 0.3.7 `budget zones` (its `--json`
 * flag is consumed by the parent `budget` command, so JSON is unreachable).
 * Returns { zones: {name: cost}, total } or null when the shape is unknown.
 */
export function parseZoneCostTable(text) {
  if (typeof text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
  if (/No active zones found/i.test(clean)) return { zones: {}, total: 0 };
  const zones = {};
  let total = null;
  for (const line of clean.split(/\r?\n/)) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const match = /^\$(\d+(?:\.\d+)?)$/.exec(cells[1]);
    if (!match) continue;
    const cost = Number(match[1]);
    if (cells[0] === "TOTAL") total = cost;
    else if (cells[0]) zones[cells[0]] = cost;
  }
  if (total == null) return null;
  return { zones, total };
}

/** Worst-case cost reserved before an item runs. */
export function itemReserve(item, est = COST_ESTIMATES) {
  if (item.kind === "search") return est.searchReserve;
  if (item.kind === "scrape") return est.scrapeReserve;
  return est.pipelineReserve;
}

/**
 * Estimated cost of a finished pipeline run. Failed or timed-out runs may
 * still be billed, so they are charged the full reserve.
 */
export function estimatePipelineCost(record, est = COST_ESTIMATES) {
  if (record?.status === "ok" || record?.status === "empty") {
    return (record.recordCount ?? 0) * est.pipelinePerRecord;
  }
  return est.pipelineReserve;
}

export function checkSpend({ spent, reserve = 0, spendCeiling }) {
  if (spent == null || !Number.isFinite(spent)) {
    return { stop: true, spent: null, reason: "spend_unavailable" };
  }
  if (spent + reserve > spendCeiling)
    return { stop: true, spent, reason: "spend_ceiling" };
  return { stop: false, spent, reason: null };
}

/**
 * Spend meter: zone-cost delta since start plus estimated pipeline cost.
 * `readZoneTotal()` resolves to the `budget zones` TOTAL in USD, or null.
 */
export function createZoneCostMeter({ readZoneTotal, est = COST_ESTIMATES }) {
  let baseline = null;
  let pipelineEstimate = 0;
  return {
    async start() {
      baseline = await readZoneTotal();
      return baseline == null ? null : 0;
    },
    async spent() {
      if (baseline == null) return null;
      const now = await readZoneTotal();
      if (now == null) return null;
      return Math.max(0, now - baseline) + pipelineEstimate;
    },
    record(item, result) {
      if (item.kind === "pipeline")
        pipelineEstimate += estimatePipelineCost(result, est);
    },
    get pipelineEstimate() {
      return pipelineEstimate;
    },
  };
}

/**
 * Runs plan items under a spend ceiling (clamped to HARD_SPEND_CAP_USD).
 * `meter` has start(), spent() and record(item, result);
 * `execute(item, {spendBefore})` runs one item.
 */
export async function runBatch(
  items,
  {
    execute,
    meter,
    spendCeiling,
    maxRequests = items.length,
    maxParallel = 1,
    est = COST_ESTIMATES,
  },
) {
  const ceiling = effectiveCeiling(spendCeiling);
  const start = await meter.start();
  const results = [];
  let stopReason = start == null ? "spend_unavailable" : null;
  let next = 0;
  let started = 0;
  let lastSpent = start ?? 0;
  let inFlightReserve = 0;
  // Largest measured cost of one item so far; reserved before every item so
  // the batch cannot overshoot the ceiling by an unexpectedly expensive item.
  let prevSpent = start;
  let completedSinceRead = 0;
  let maxObservedItemCost = 0;

  const worker = async () => {
    while (!stopReason && next < items.length) {
      if (started >= maxRequests) {
        stopReason = "max_requests";
        return;
      }
      const current = started === 0 ? start : await meter.spent();
      if (current != null && prevSpent != null && completedSinceRead > 0) {
        maxObservedItemCost = Math.max(
          maxObservedItemCost,
          (current - prevSpent) / completedSinceRead,
        );
        prevSpent = current;
        completedSinceRead = 0;
      }
      if (stopReason || next >= items.length) return;
      const item = items[next];
      const reserve = Math.max(itemReserve(item, est), maxObservedItemCost);
      const verdict = checkSpend({
        spent: current,
        reserve: reserve + inFlightReserve,
        spendCeiling: ceiling,
      });
      if (verdict.spent != null) lastSpent = verdict.spent;
      if (verdict.stop) {
        stopReason = verdict.reason;
        return;
      }
      if (started >= maxRequests) continue;
      const index = next++;
      started++;
      inFlightReserve += reserve;
      try {
        const result = await execute(item, { spendBefore: current });
        results[index] = result;
        meter.record(item, result);
      } finally {
        inFlightReserve -= reserve;
        completedSinceRead++;
      }
    }
  };
  const lanes = Math.max(1, Math.min(maxParallel, items.length || 1));
  await Promise.all(Array.from({ length: lanes }, worker));
  const end = started > 0 ? await meter.spent() : start;
  return {
    results: results.filter(Boolean),
    started,
    stopReason: stopReason ?? "done",
    ceiling,
    spent: end ?? lastSpent,
  };
}

// ---------- process execution ----------

export function runChild({ cli, args, env, timeoutMs, spawnImpl = spawn }) {
  assertAllowedArgs(args);
  return new Promise((resolve) => {
    const child = spawnImpl(process.execPath, [cli.indexJs, ...args], {
      shell: false,
      windowsHide: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => out.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => err.push(Buffer.from(chunk)));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ exitCode: -1, stdout: "", stderr: "spawn failed", timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        timedOut,
      });
    });
  });
}

/** One CLI call → redacted raw file + one run-log line. */
export async function executeCall(
  ctx,
  { id, kind, input = null, args, subdir, spendBefore },
) {
  assertSafeName(id, "id");
  assertAllowedArgs(args);
  if (containsSecret(JSON.stringify(args), ctx.key))
    throw new Error("argv contains the key");
  const startedAt = ctx.now().toISOString();
  const timeoutMs =
    kind === "pipeline" ? (ctx.timeoutS + 120) * 1000 : SEARCH_TIMEOUT_MS;
  const res = await (ctx.runChildImpl ?? runChild)({
    cli: ctx.cli,
    args,
    env: ctx.env,
    timeoutMs,
    spawnImpl: ctx.spawnImpl,
  });
  const stdout = redact(res.stdout, ctx.key);
  const stderr = redact(res.stderr, ctx.key);
  const parsed = parseJsonOutput(stdout);
  const data = parsed === undefined ? (stdout.trim() ? stdout : null) : parsed;
  const recordCount = ["search", "scrape", "pipeline"].includes(kind)
    ? countRecords(kind, data)
    : data == null
      ? 0
      : 1;
  const { status, errorClass } = classifyResult({
    exitCode: res.exitCode,
    stderr,
    timedOut: res.timedOut,
    recordCount,
  });
  const endedAt = ctx.now().toISOString();
  const outDir = path.join(ctx.rawRoot, subdir);
  const outputPath = path.join(outDir, `${id}.json`);
  const envelope = {
    id,
    kind,
    input,
    args,
    fetchedAt: endedAt,
    status,
    exitCode: res.exitCode,
    data,
    stderr: stderr.trim() || null,
  };
  const body = JSON.stringify(envelope, null, 2) + "\n";
  if (containsSecret(body, ctx.key))
    throw new Error("refusing to write output containing key");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, body, "utf8");
  const record = ctx.log.append({
    id,
    phase: ctx.phase,
    kind,
    input,
    args,
    startedAt,
    endedAt,
    status,
    exitCode: res.exitCode,
    recordCount,
    requestCount: countRequests(kind, stderr),
    outputPath: path
      .relative(ctx.rawRoot, outputPath)
      .split(path.sep)
      .join("/"),
    errorClass,
    balanceBefore: null,
    balanceAfter: null,
    spendBefore: spendBefore ?? null,
  });
  return { ...record, data, stderr };
}

// ---------- CLI ----------

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      phase: { type: "string", default: DEFAULT_PHASE },
      "serp-zone": { type: "string" },
      "unlocker-zone": { type: "string" },
      "max-parallel": { type: "string", default: "1" },
      "max-requests": { type: "string" },
      "spend-ceiling": { type: "string" },
      timeout: { type: "string", default: String(DEFAULT_PIPELINE_TIMEOUT_S) },
      id: { type: "string" },
      "search-type": { type: "string" },
      "num-comments": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const toInt = (v, name) => {
    if (v == null) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1)
      throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  const ceiling =
    values["spend-ceiling"] == null
      ? undefined
      : Number(values["spend-ceiling"]);
  if (ceiling !== undefined && (!Number.isFinite(ceiling) || ceiling < 0)) {
    throw new Error("--spend-ceiling must be a non-negative number (USD)");
  }
  return {
    command: positionals[0],
    positionals: positionals.slice(1),
    help: !!values.help,
    phase: assertSafeName(values.phase, "phase"),
    serpZone: values["serp-zone"],
    unlockerZone: values["unlocker-zone"],
    maxParallel: toInt(values["max-parallel"], "max-parallel"),
    maxRequests: toInt(values["max-requests"], "max-requests"),
    spendCeiling: ceiling,
    timeoutS: toInt(values.timeout, "timeout"),
    id: values.id,
    searchType: values["search-type"],
    numComments: values["num-comments"],
  };
}

function stamp(now) {
  return now()
    .toISOString()
    .replace(/[-:.]/g, "")
    .replace("T", "-")
    .slice(0, 15);
}

async function createContext(opts, { now = () => new Date() } = {}) {
  const cli = resolveCli();
  const key = await loadApiKey();
  const rawRoot = rawDir(opts.phase);
  return {
    cli,
    key,
    now,
    phase: opts.phase,
    rawRoot,
    ledgerPath: defaultLedgerPath(DATA_DIR),
    timeoutS: opts.timeoutS,
    env: buildChildEnv(process.env, key, {
      serpZone: opts.serpZone,
      unlockerZone: opts.unlockerZone,
    }),
    log: createRunLog({ path: path.join(rawRoot, "run-log.jsonl"), key, now }),
  };
}

async function readBalanceCall(ctx, id) {
  const res = await executeCall(ctx, {
    id,
    kind: "budget",
    args: ["budget", "--json"],
    subdir: "budget",
  });
  return res.status === "ok" ? effectiveBalance(res.data) : null;
}

/** `budget zones` TOTAL in USD, or null when unreadable. */
async function readZoneTotalCall(ctx, id) {
  const res = await executeCall(ctx, {
    id,
    kind: "budget",
    args: ["budget", "zones"],
    subdir: "budget",
  });
  if (res.status !== "ok") return null;
  return parseZoneCostTable(res.data)?.total ?? null;
}

function say(ctx, text) {
  process.stdout.write(redact(text, ctx?.key) + "\n");
}

async function cmdReadiness(ctx) {
  const t = stamp(ctx.now);
  const version = await executeCall(ctx, {
    id: `version-${t}`,
    kind: "version",
    args: ["--version"],
    subdir: "readiness",
  });
  const zones = await executeCall(ctx, {
    id: `zones-${t}`,
    kind: "zones",
    args: ["zones", "--json"],
    subdir: "readiness",
  });
  const budget = await executeCall(ctx, {
    id: `budget-${t}`,
    kind: "budget",
    args: ["budget", "--json"],
    subdir: "readiness",
  });
  const budgetZones = await executeCall(ctx, {
    id: `budget-zones-${t}`,
    kind: "budget",
    args: ["budget", "zones"],
    subdir: "readiness",
  });
  const lines = [
    `CLI version: ${String(version.data ?? "").trim() || version.status}`,
  ];
  if (Array.isArray(zones.data)) {
    lines.push(`Zones (${zones.data.length}):`);
    for (const z of zones.data)
      lines.push(`  - ${z.name ?? "?"} [${z.type ?? "?"}]`);
  } else {
    lines.push(`Zones: ${zones.status} ${zones.errorClass ?? ""}`.trim());
  }
  if (budget.data && typeof budget.data.balance === "number") {
    lines.push(
      `Balance: $${budget.data.balance.toFixed(2)} (pending $${Number(budget.data.pending_balance ?? 0).toFixed(2)})`,
    );
  } else {
    lines.push(`Balance: ${budget.status} ${budget.errorClass ?? ""}`.trim());
  }
  const zoneCosts = parseZoneCostTable(budgetZones.data);
  if (zoneCosts) {
    lines.push(
      `Zone cost this month (spend meter): $${zoneCosts.total.toFixed(2)}`,
    );
    for (const [zone, cost] of Object.entries(zoneCosts.zones).sort()) {
      lines.push(`  cost ${zone}: $${cost.toFixed(2)}`);
    }
  } else {
    lines.push(
      `Zone cost: ${budgetZones.status} ${budgetZones.errorClass ?? "unparsed"}`.trim(),
    );
  }
  lines.push(`Run log: ${ctx.log.path}`);
  say(ctx, lines.join("\n"));
}

function itemFromOpts(kind, opts, ctx) {
  const id = opts.id ?? `${kind}-${stamp(ctx.now)}`;
  if (kind === "search") {
    return {
      id,
      kind,
      query: opts.positionals.join(" "),
      searchType: opts.searchType,
    };
  }
  if (kind === "scrape") return { id, kind, url: opts.positionals[0] };
  return {
    id,
    kind,
    type: opts.positionals[0],
    url: opts.positionals[1],
    numComments: opts.numComments,
  };
}

async function executeItem(ctx, opts, item, spendBefore) {
  const args = buildCallArgs(item, {
    serpZone: opts.serpZone,
    unlockerZone: opts.unlockerZone,
    timeoutS: opts.timeoutS,
  });
  return executeCall(ctx, {
    id: item.id,
    kind: item.kind,
    input: item.query ?? item.url ?? null,
    args,
    subdir: item.kind,
    spendBefore,
  });
}

function summarise(record) {
  return `${record.id}: ${record.status} records=${record.recordCount} requests=${record.requestCount}${record.errorClass ? ` (${record.errorClass})` : ""}`;
}

export function validatePlan(plan) {
  if (!Array.isArray(plan)) throw new Error("plan must be a JSON array");
  const seen = new Set();
  for (const item of plan) {
    assertSafeName(item?.id, "plan item id");
    if (seen.has(item.id)) throw new Error(`duplicate plan id ${item.id}`);
    seen.add(item.id);
    if (!["search", "scrape", "pipeline"].includes(item.kind)) {
      throw new Error(`plan item ${item.id} has invalid kind`);
    }
  }
  return plan;
}

async function cmdBatch(ctx, opts) {
  const planPath = opts.positionals[0];
  if (!planPath) throw new Error("batch needs <plan.json>");
  const plan = validatePlan(JSON.parse(fs.readFileSync(planPath, "utf8")));
  for (const item of plan) buildCallArgs(item, opts); // validate all before spending
  if (opts.spendCeiling === undefined)
    throw new Error("batch requires --spend-ceiling <usd>");
  let reads = 0;
  const readZoneTotal = () =>
    readZoneTotalCall(ctx, `zone-cost-${stamp(ctx.now)}-${++reads}`);
  const zoneAtStart = await readZoneTotal();
  const reservation = await reserveSpend(ctx.ledgerPath, {
    phase: ctx.phase,
    label: path.basename(planPath, ".json"),
    requestedUsd: effectiveCeiling(opts.spendCeiling),
    zoneTotalNow: zoneAtStart,
    now: ctx.now,
  });
  say(
    ctx,
    `ledger: reserved $${reservation.ceiling.toFixed(2)} for ${reservation.remaining.group} (study spent $${reservation.remaining.studySpent.toFixed(2)})`,
  );
  const meter = createZoneCostMeter({ readZoneTotal });
  let summary;
  try {
    summary = await runBatch(plan, {
      spendCeiling: reservation.ceiling,
      maxRequests: opts.maxRequests ?? plan.length,
      maxParallel: opts.maxParallel ?? 1,
      meter,
      execute: async (item, { spendBefore }) => {
        const record = await executeItem(ctx, opts, item, spendBefore);
        say(ctx, summarise(record));
        return record;
      },
    });
  } finally {
    const spent = summary?.spent ?? (await meter.spent().catch(() => null));
    const measured = spent != null && Number.isFinite(spent);
    await settleSpend(ctx.ledgerPath, reservation.id, {
      zoneDeltaUsd: measured ? spent - meter.pipelineEstimate : null,
      pipelineEstimateUsd: meter.pipelineEstimate,
      measured,
      now: ctx.now,
    });
  }
  say(
    ctx,
    `batch: ${summary.results.length}/${plan.length} run, stop=${summary.stopReason}, ceiling=$${summary.ceiling.toFixed(2)}, spent≈$${summary.spent == null ? "?" : summary.spent.toFixed(4)} (pipeline estimate $${meter.pipelineEstimate.toFixed(4)})`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  let ctx;
  try {
    const opts = parseCliArgs(argv);
    if (opts.help || !opts.command) {
      process.stdout.write(USAGE + "\n");
      return 0;
    }
    const known = [
      "readiness",
      "search",
      "scrape",
      "pipeline",
      "budget",
      "batch",
    ];
    if (!known.includes(opts.command))
      throw new Error(`unknown command: ${opts.command}`);
    if (opts.command === "search" && !opts.serpZone)
      throw new Error("search needs --serp-zone");
    if (opts.command === "scrape" && !opts.unlockerZone) {
      throw new Error("scrape needs --unlocker-zone");
    }
    ctx = await createContext(opts);
    if (opts.command === "readiness") {
      await cmdReadiness(ctx);
    } else if (opts.command === "budget") {
      const bal = await readBalanceCall(ctx, `balance-${stamp(ctx.now)}`);
      say(
        ctx,
        `effective balance: ${bal == null ? "unavailable" : `$${bal.toFixed(2)}`}`,
      );
    } else if (opts.command === "batch") {
      await cmdBatch(ctx, opts);
    } else {
      const item = itemFromOpts(opts.command, opts, ctx);
      buildCallArgs(item, opts);
      const before = await readZoneTotalCall(
        ctx,
        `zone-cost-${stamp(ctx.now)}-before`,
      );
      if (before == null)
        throw new Error("zone cost unreadable; refusing to spend");
      const reserve = itemReserve(item);
      const reservation = await reserveSpend(ctx.ledgerPath, {
        phase: ctx.phase,
        label: item.id,
        requestedUsd: reserve,
        zoneTotalNow: before,
        now: ctx.now,
      });
      if (reservation.ceiling < reserve) {
        await settleSpend(ctx.ledgerPath, reservation.id, {
          zoneDeltaUsd: 0,
          pipelineEstimateUsd: 0,
          measured: true,
          now: ctx.now,
        });
        throw new Error("not enough budget left for this request");
      }
      let record;
      let after = null;
      try {
        record = await executeItem(ctx, opts, item, before);
        after = await readZoneTotalCall(
          ctx,
          `zone-cost-${stamp(ctx.now)}-after`,
        );
      } finally {
        const est = item.kind === "pipeline" ? estimatePipelineCost(record) : 0;
        await settleSpend(ctx.ledgerPath, reservation.id, {
          zoneDeltaUsd: after == null ? null : after - before,
          pipelineEstimateUsd: est,
          measured: after != null,
          now: ctx.now,
        });
      }
      say(ctx, summarise(record));
      say(ctx, `zone cost before/after: ${before} / ${after ?? "?"}`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(redact(`bd-run: ${error.message}`, ctx?.key) + "\n");
    return 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  });
}
