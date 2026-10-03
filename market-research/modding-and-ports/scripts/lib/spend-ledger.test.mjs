import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeRemaining,
  formatLedger,
  phaseNumber,
  reserveSpend,
  settleSpend,
  studyZoneSpend,
  validateLedger,
} from "./spend-ledger.mjs";

const OCT = new Date("2026-10-15T00:00:00Z");
const NOV = new Date("2026-11-02T00:00:00Z");

function makeLedger(entries = []) {
  return {
    version: 1,
    studyCapUsd: 5,
    zoneBaseline: { month: "2026-10", totalUsd: 0 },
    groups: [
      { id: "phase-01", phases: [1], capUsd: 0.15 },
      { id: "phase-02", phases: [2], capUsd: 1.94 },
      { id: "phases-03-08", phases: [3, 4, 5, 6, 7, 8], capUsd: 2.43 },
      { id: "phases-09-11", phases: [9, 10, 11], capUsd: 0.48 },
    ],
    entries,
  };
}

const pilot = {
  id: "pilot",
  status: "settled",
  phase: "01-protocol",
  group: "phase-01",
  month: "2026-10",
  usd: 0.135,
  zoneDeltaUsd: 0.04,
  pipelineEstimateUsd: 0.095,
};

function tempLedger(ledger) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
  const file = path.join(dir, "spend-ledger.json");
  fs.writeFileSync(file, JSON.stringify(ledger));
  return file;
}

describe("spend ledger", () => {
  test("the committed study ledger is valid and adds up to $5", () => {
    const file = new URL("../../data/spend-ledger.json", import.meta.url);
    const ledger = validateLedger(JSON.parse(fs.readFileSync(file, "utf8")));
    const caps = ledger.groups.reduce((s, g) => s + g.capUsd, 0);
    assert.ok(Math.abs(caps - 5) < 1e-9);
    assert.equal(ledger.studyCapUsd, 5);
  });

  test("the committed ledger is exactly what the writer produces", () => {
    // Keeps the machine-written file in Prettier's layout after every batch.
    const file = new URL("../../data/spend-ledger.json", import.meta.url);
    const text = fs.readFileSync(file, "utf8");
    assert.equal(formatLedger(JSON.parse(text)), text);
    assert.equal(
      formatLedger({ phases: [3, 4, 5], usd: 0.5, list: [] }),
      '{\n  "phases": [3, 4, 5],\n  "usd": 0.5,\n  "list": []\n}\n',
    );
  });

  test("phaseNumber reads the leading number", () => {
    assert.equal(phaseNumber("01-protocol"), 1);
    assert.equal(phaseNumber("02-public-web"), 2);
    assert.equal(phaseNumber("11"), 11);
    assert.throws(() => phaseNumber("protocol"), /number/);
  });

  test("validateLedger rejects group caps above the study cap", () => {
    const bad = makeLedger();
    bad.groups[1].capUsd = 3;
    assert.throws(() => validateLedger(bad), /more than the study cap/);
  });

  test("remaining = min(study left, group left) using live zone cost", () => {
    const ledger = makeLedger([pilot]);
    const rem = computeRemaining(ledger, "02-public-web", 0.04, OCT);
    assert.equal(rem.studySpent, 0.135);
    assert.equal(rem.groupRemaining, 1.94);
    assert.equal(rem.remaining, 1.94);
    // Zone spend elsewhere eats the study total, not the group's.
    const late = computeRemaining(ledger, "02-public-web", 4.0, OCT);
    assert.equal(late.studyRemaining, 0.905);
    assert.equal(late.remaining, 0.905);
  });

  test("unreadable zone cost fails closed", () => {
    assert.equal(computeRemaining(makeLedger(), "02-x", null, OCT), null);
    assert.equal(studyZoneSpend(makeLedger(), Number.NaN, OCT), null);
  });

  test("a new month counts earlier settled zone spend plus the whole new total", () => {
    const ledger = makeLedger([pilot]);
    assert.equal(studyZoneSpend(ledger, 0.3, NOV), 0.04 + 0.3);
  });

  test("reservations block parallel collectors from overspending a group", async () => {
    const file = tempLedger(makeLedger([pilot]));
    const now = () => OCT;
    const a = await reserveSpend(file, {
      phase: "02-public-web",
      label: "collector-a",
      requestedUsd: 1.5,
      zoneTotalNow: 0.04,
      now,
    });
    const b = await reserveSpend(file, {
      phase: "02-public-web",
      label: "collector-b",
      requestedUsd: 1.5,
      zoneTotalNow: 0.04,
      now,
    });
    assert.equal(a.ceiling, 1.5);
    assert.equal(b.ceiling, 0.44); // 1.94 - 1.5
    await assert.rejects(
      reserveSpend(file, {
        phase: "02-public-web",
        label: "collector-c",
        requestedUsd: 0.5,
        zoneTotalNow: 0.04,
        now,
      }),
      /budget exhausted for phase-02/,
    );
  });

  test("concurrent reservations never exceed the cap in total", async () => {
    const file = tempLedger(makeLedger([pilot]));
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        reserveSpend(file, {
          phase: "02-public-web",
          label: `c${i}`,
          requestedUsd: 0.5,
          zoneTotalNow: 0.04,
          now: () => OCT,
        }),
      ),
    );
    const granted = attempts
      .filter((r) => r.status === "fulfilled")
      .reduce((s, r) => s + r.value.ceiling, 0);
    assert.ok(granted <= 1.94 + 1e-9, `granted ${granted}`);
    assert.ok(Math.abs(granted - 1.94) < 1e-9);
  });

  test("settling releases unused budget; unmeasured spend keeps the reservation", async () => {
    const file = tempLedger(makeLedger([pilot]));
    const now = () => OCT;
    const r1 = await reserveSpend(file, {
      phase: "02-public-web",
      label: "a",
      requestedUsd: 1,
      zoneTotalNow: 0.04,
      now,
    });
    await settleSpend(file, r1.id, {
      zoneDeltaUsd: 0.2,
      pipelineEstimateUsd: 0.05,
      measured: true,
      now,
    });
    let ledger = JSON.parse(fs.readFileSync(file, "utf8"));
    // Live zone total now includes the batch's 0.2.
    let rem = computeRemaining(ledger, "02-public-web", 0.24, OCT);
    assert.equal(rem.groupSpent, 0.25);
    assert.equal(rem.studySpent, 0.385); // 0.24 zone + 0.095 + 0.05 estimates

    const r2 = await reserveSpend(file, {
      phase: "02-public-web",
      label: "b",
      requestedUsd: 0.5,
      zoneTotalNow: 0.24,
      now,
    });
    await settleSpend(file, r2.id, { measured: false, now });
    ledger = JSON.parse(fs.readFileSync(file, "utf8"));
    rem = computeRemaining(ledger, "02-public-web", 0.24, OCT);
    assert.equal(rem.groupSpent, 0.75);
    assert.equal(rem.studySpent, 0.885); // + 0.5 unmeasured reservation
    await assert.rejects(
      settleSpend(file, r2.id, { measured: true }),
      /no open/,
    );
  });

  test("a missing ledger refuses to spend", async () => {
    await assert.rejects(
      reserveSpend(path.join(os.tmpdir(), "nope", "spend-ledger.json"), {
        phase: "02-x",
        label: "x",
        requestedUsd: 1,
        zoneTotalNow: 0,
      }),
      /missing/,
    );
  });
});
