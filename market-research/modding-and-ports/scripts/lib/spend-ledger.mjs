// Study-wide Bright Data spend ledger (owner cap $5, approved 2026-10-02).
//
// One JSON file shared by every batch and every parallel collector. It holds
// no secrets. Spend is tracked two ways:
// - Study total = live zone cost since the study baseline (account-wide, so
//   parallel batches are not double-counted) + estimated pipeline cost of
//   settled batches + open reservations.
// - Group total (per-phase allocation) = settled batch spend + open
//   reservations in that group. Under parallel batches a batch's zone delta
//   can include the other batch's spend, so group totals may over-count; that
//   errs toward stopping early.
// Every batch reserves its ceiling under a file lock before it runs and
// settles the measured spend afterwards. A crashed batch leaves its
// reservation open, which keeps that budget held (fail closed).
import fs from "node:fs";
import path from "node:path";

const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;
const CENTS = (n) => Math.round(n * 1e6) / 1e6;

export function phaseNumber(phase) {
  const match = /^(\d{1,2})(?:-|$)/.exec(String(phase));
  if (!match) throw new Error(`phase "${phase}" must start with its number`);
  return Number(match[1]);
}

export function validateLedger(ledger) {
  const fail = (why) => {
    throw new Error(`spend ledger invalid: ${why}`);
  };
  if (!ledger || ledger.version !== 1) fail("version must be 1");
  if (!(ledger.studyCapUsd > 0)) fail("studyCapUsd must be > 0");
  const base = ledger.zoneBaseline;
  if (!base || !/^\d{4}-\d{2}$/.test(base.month ?? ""))
    fail("zoneBaseline.month");
  if (!Number.isFinite(base.totalUsd) || base.totalUsd < 0)
    fail("zoneBaseline.totalUsd");
  if (!Array.isArray(ledger.groups) || ledger.groups.length === 0)
    fail("groups");
  const seen = new Set();
  let capSum = 0;
  for (const g of ledger.groups) {
    if (!g?.id || seen.has(g.id)) fail(`group id ${g?.id}`);
    seen.add(g.id);
    if (!Array.isArray(g.phases) || !g.phases.every(Number.isInteger))
      fail(`group ${g.id} phases`);
    if (!Number.isFinite(g.capUsd) || g.capUsd < 0) fail(`group ${g.id} cap`);
    capSum += g.capUsd;
  }
  if (CENTS(capSum) > ledger.studyCapUsd)
    fail("group caps add up to more than the study cap");
  if (!Array.isArray(ledger.entries)) fail("entries");
  for (const e of ledger.entries) {
    if (!["reserved", "settled"].includes(e?.status)) fail(`entry ${e?.id}`);
    if (!Number.isFinite(e.usd) || e.usd < 0) fail(`entry ${e.id} usd`);
    if (e.status === "settled") {
      if (!Number.isFinite(e.pipelineEstimateUsd)) fail(`entry ${e.id} est`);
      if (!Number.isFinite(e.zoneDeltaUsd)) fail(`entry ${e.id} zone`);
    }
  }
  return ledger;
}

export function groupFor(ledger, phase) {
  const n = phaseNumber(phase);
  const group = ledger.groups.find((g) => g.phases.includes(n));
  if (!group) throw new Error(`no budget group for phase ${phase}`);
  return group;
}

/** Month key (YYYY-MM, UTC) for a Date. */
export function monthOf(date) {
  return date.toISOString().slice(0, 7);
}

/**
 * Zone spend since the study started. Same month as the baseline: exact
 * (live total − baseline). Later month: settled zone deltas from earlier
 * months + the whole current-month total (conservative).
 */
export function studyZoneSpend(ledger, zoneTotalNow, now) {
  if (zoneTotalNow == null || !Number.isFinite(zoneTotalNow)) return null;
  const month = monthOf(now);
  if (month === ledger.zoneBaseline.month) {
    return Math.max(0, zoneTotalNow - ledger.zoneBaseline.totalUsd);
  }
  const earlier = ledger.entries
    .filter((e) => e.status === "settled" && (e.month ?? "") < month)
    .reduce((s, e) => s + e.zoneDeltaUsd, 0);
  return earlier + zoneTotalNow;
}

/** Remaining budget for a phase given the live zone total (USD). */
export function computeRemaining(ledger, phase, zoneTotalNow, now) {
  const group = groupFor(ledger, phase);
  const zone = studyZoneSpend(ledger, zoneTotalNow, now);
  if (zone == null) return null;
  const settled = ledger.entries.filter((e) => e.status === "settled");
  const open = ledger.entries.filter((e) => e.status === "reserved");
  const pipelines = settled.reduce((s, e) => s + e.pipelineEstimateUsd, 0);
  const reserved = open.reduce((s, e) => s + e.usd, 0);
  const studySpent = zone + pipelines + reserved;
  const groupSpent = ledger.entries
    .filter((e) => e.group === group.id)
    .reduce((s, e) => s + e.usd, 0);
  const study = ledger.studyCapUsd - studySpent;
  const inGroup = group.capUsd - groupSpent;
  return {
    group: group.id,
    studySpent: CENTS(studySpent),
    groupSpent: CENTS(groupSpent),
    studyRemaining: CENTS(study),
    groupRemaining: CENTS(inGroup),
    remaining: CENTS(Math.max(0, Math.min(study, inGroup))),
  };
}

export function loadLedger(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`spend ledger missing: ${file}`);
  }
  return validateLedger(JSON.parse(text));
}

/** JSON matching Prettier's layout: short number arrays stay on one line. */
export function formatLedger(ledger) {
  return (
    JSON.stringify(ledger, null, 2).replace(
      /\[\s*(-?\d+(?:\.\d+)?(?:,\s*-?\d+(?:\.\d+)?)*)\s*\]/g,
      (_, nums) => `[${nums.split(/,\s*/).join(", ")}]`,
    ) + "\n"
  );
}

function saveLedger(file, ledger) {
  validateLedger(ledger);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, formatLedger(ledger), "utf8");
  fs.renameSync(tmp, file);
}

async function withLock(file, fn, { sleep, nowMs = () => Date.now() } = {}) {
  if (!fs.existsSync(file)) throw new Error(`spend ledger missing: ${file}`);
  const lock = `${file}.lock`;
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const start = nowMs();
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lock, "wx");
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (nowMs() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS)
          fs.rmSync(lock, { force: true });
      } catch {
        // lock vanished between checks; retry
      }
      if (nowMs() - start > LOCK_TIMEOUT_MS)
        throw new Error("spend ledger is locked; refusing to spend");
      await wait(100);
    }
  }
  try {
    return await fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lock, { force: true });
  }
}

/**
 * Reserves up to `requestedUsd` for one batch. Resolves to
 * { id, ceiling, remaining } or throws when nothing is left.
 */
export async function reserveSpend(
  file,
  { phase, label, requestedUsd, zoneTotalNow, now = () => new Date() },
) {
  if (!Number.isFinite(requestedUsd) || requestedUsd <= 0)
    throw new Error("reservation must be a positive amount");
  return withLock(file, async () => {
    const ledger = loadLedger(file);
    const at = now();
    const rem = computeRemaining(ledger, phase, zoneTotalNow, at);
    if (rem == null) throw new Error("zone cost unreadable; refusing to spend");
    const ceiling = CENTS(Math.min(requestedUsd, rem.remaining));
    if (!(ceiling > 0)) {
      throw new Error(
        `budget exhausted for ${rem.group}: study $${rem.studyRemaining.toFixed(2)} left, group $${rem.groupRemaining.toFixed(2)} left`,
      );
    }
    const id = `${at.toISOString()}-${process.pid}-${label}`;
    ledger.entries.push({
      id,
      status: "reserved",
      phase,
      group: rem.group,
      label,
      at: at.toISOString(),
      month: monthOf(at),
      usd: ceiling,
    });
    saveLedger(file, ledger);
    return { id, ceiling, remaining: rem };
  });
}

/** Replaces a reservation with measured spend. */
export async function settleSpend(
  file,
  id,
  { zoneDeltaUsd, pipelineEstimateUsd, measured, now = () => new Date() },
) {
  return withLock(file, async () => {
    const ledger = loadLedger(file);
    const entry = ledger.entries.find((e) => e.id === id);
    if (!entry || entry.status !== "reserved")
      throw new Error(`no open reservation ${id}`);
    const zone = Number.isFinite(zoneDeltaUsd) ? Math.max(0, zoneDeltaUsd) : 0;
    const est = Number.isFinite(pipelineEstimateUsd) ? pipelineEstimateUsd : 0;
    // Unmeasured spend keeps the full reservation as spent (fail closed): it
    // is booked as an estimate so it still counts toward the study total.
    const usd = measured ? CENTS(zone + est) : entry.usd;
    Object.assign(entry, {
      status: "settled",
      settledAt: now().toISOString(),
      reservedUsd: entry.usd,
      usd,
      zoneDeltaUsd: measured ? CENTS(zone) : 0,
      pipelineEstimateUsd: measured ? CENTS(est) : entry.usd,
      measured: !!measured,
    });
    saveLedger(file, ledger);
    return entry;
  });
}

export function defaultLedgerPath(dataDir) {
  return path.join(dataDir, "spend-ledger.json");
}
