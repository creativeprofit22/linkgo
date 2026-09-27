import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  evaluateFindings,
  findingKey,
  formatResult,
  lockedBunVersions,
  parseBunAudit,
  parseCargoAudit,
  runAuditJson,
  today,
  validateExceptions,
} from "./check-dependency-audit.mjs";

const exception = (overrides = {}) => ({
  ecosystem: "cargo",
  id: "RUSTSEC-2023-0071",
  package: "rsa",
  version: "0.9.10",
  kind: "vulnerability",
  severity: "medium",
  reachability: "not-compiled",
  rationale: "Not compiled for any target.",
  owner: "owner",
  reviewed: "2026-09-26",
  expires: "2026-12-24",
  ...overrides,
});

const cargoReport = (vulns = [], warnings = {}) => ({
  vulnerabilities: {
    list: vulns.map(([id, name, version]) => ({
      advisory: { id, cvss: null },
      package: { name, version },
    })),
  },
  warnings,
});

const exceptions = (...entries) =>
  validateExceptions({ version: 1, exceptions: entries });

test("fails a finding without an exception", () => {
  const findings = parseCargoAudit(
    cargoReport([["RUSTSEC-2026-0285", "rustls", "0.23.41"]]),
  );
  const result = evaluateFindings(findings, exceptions(), "2026-09-26");
  assert.equal(result.ok, false);
  assert.deepEqual(result.unexcepted, [
    "cargo:RUSTSEC-2026-0285:rustls@0.23.41",
  ]);
});

test("passes a finding covered by an exact active exception", () => {
  const findings = parseCargoAudit(
    cargoReport([["RUSTSEC-2023-0071", "rsa", "0.9.10"]]),
  );
  const result = evaluateFindings(
    findings,
    exceptions(exception()),
    "2026-12-24",
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.excepted, ["cargo:RUSTSEC-2023-0071:rsa@0.9.10"]);
});

test("fails an exception whose kind differs from the finding", () => {
  const findings = parseCargoAudit(
    cargoReport([["RUSTSEC-2023-0071", "rsa", "0.9.10"]]),
  );
  const result = evaluateFindings(
    findings,
    exceptions(exception({ kind: "unmaintained" })),
    "2026-09-26",
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.kindMismatch, [
    "cargo:RUSTSEC-2023-0071:rsa@0.9.10 (exception kind unmaintained, finding kind vulnerability)",
  ]);
  assert.deepEqual(result.unexcepted, []);
  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.excepted, []);
  assert.match(
    formatResult(findings.length, result),
    /kind does not match[\s\S]*exception kind unmaintained, finding kind vulnerability/,
  );
});

test("does not match an exception for a different version", () => {
  const findings = parseCargoAudit(
    cargoReport([["RUSTSEC-2023-0071", "rsa", "0.9.11"]]),
  );
  const result = evaluateFindings(
    findings,
    exceptions(exception()),
    "2026-09-26",
  );
  assert.equal(result.ok, false);
  assert.equal(result.unexcepted.length, 1);
  assert.equal(result.stale.length, 1);
});

test("fails an expired exception", () => {
  const findings = parseCargoAudit(
    cargoReport([["RUSTSEC-2023-0071", "rsa", "0.9.10"]]),
  );
  const result = evaluateFindings(
    findings,
    exceptions(exception()),
    "2026-12-25",
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.expired, ["cargo:RUSTSEC-2023-0071:rsa@0.9.10"]);
});

test("fails a stale exception that matches no finding", () => {
  const result = evaluateFindings([], exceptions(exception()), "2026-09-26");
  assert.equal(result.ok, false);
  assert.deepEqual(result.stale, ["cargo:RUSTSEC-2023-0071:rsa@0.9.10"]);
});

test("treats cargo warnings as findings that need exceptions", () => {
  const findings = parseCargoAudit(
    cargoReport([], {
      unmaintained: [
        {
          advisory: { id: "RUSTSEC-2025-0080" },
          package: { name: "unic-common", version: "0.9.0" },
        },
      ],
      yanked: [{ advisory: null, package: { name: "spin", version: "0.9.8" } }],
    }),
  );
  assert.deepEqual(
    findings.map((f) => `${f.kind}:${f.id}:${f.package}`),
    ["unmaintained:RUSTSEC-2025-0080:unic-common", "yanked:yanked:spin"],
  );
});

test("parses bun audit output and resolves locked versions", () => {
  const lock = [
    "{",
    '  "packages": {',
    '    "vite": ["vite@8.0.10", "", {}, "sha512-x"],',
    '    "@scope/pkg": ["@scope/pkg@1.2.3", "", {}, "sha512-y"],',
    '    "a/vite": ["vite@7.0.0", "", {}, "sha512-z"],',
    "  }",
    "}",
  ].join("\n");
  assert.deepEqual([...lockedBunVersions(lock).get("@scope/pkg")], ["1.2.3"]);
  const findings = parseBunAudit(
    {
      vite: [
        {
          url: "https://github.com/advisories/GHSA-v6wh-96g9-6wx3",
          severity: "moderate",
        },
      ],
    },
    lock,
  );
  assert.deepEqual(findings, [
    {
      ecosystem: "bun",
      id: "GHSA-v6wh-96g9-6wx3",
      package: "vite",
      version: "7.0.0|8.0.10",
      kind: "vulnerability",
      severity: "moderate",
    },
  ]);
});

test("bun exceptions must pin every locked version of the package", () => {
  const lock = [
    "{",
    '  "packages": {',
    '    "vite": ["vite@8.0.10", "", {}, "sha512-x"],',
    '    "a/vite": ["vite@7.0.0", "", {}, "sha512-z"],',
    "  }",
    "}",
  ].join("\n");
  const findings = parseBunAudit(
    {
      vite: [
        {
          url: "https://github.com/advisories/GHSA-v6wh-96g9-6wx3",
          severity: "moderate",
        },
      ],
    },
    lock,
  );
  const bunException = (version) =>
    exception({
      ecosystem: "bun",
      id: "GHSA-v6wh-96g9-6wx3",
      package: "vite",
      version,
      severity: "moderate",
    });
  const all = evaluateFindings(
    findings,
    exceptions(bunException("7.0.0|8.0.10")),
    "2026-09-26",
  );
  assert.equal(all.ok, true);
  assert.deepEqual(all.excepted, ["bun:GHSA-v6wh-96g9-6wx3:vite@7.0.0|8.0.10"]);
  const single = evaluateFindings(
    findings,
    exceptions(bunException("8.0.10")),
    "2026-09-26",
  );
  assert.equal(single.ok, false);
  assert.deepEqual(single.unexcepted, [
    "bun:GHSA-v6wh-96g9-6wx3:vite@7.0.0|8.0.10",
  ]);
  assert.deepEqual(single.stale, ["bun:GHSA-v6wh-96g9-6wx3:vite@8.0.10"]);
});

// Trimmed `bun audit --json` output recorded with the official Bun 1.4.2 release (CI's pinned
// version) against the pre-remediation lockfile from commit 382acdd. Bun 1.3.14 emitted a
// byte-identical report for the same lockfile; both print `{}` for a clean lockfile.
const BUN_1_4_2_LOCK = [
  "{",
  '  "packages": {',
  '    "postcss": ["postcss@8.5.15", "", {}, "sha512-a"],',
  '    "vite": ["vite@8.0.10", "", {}, "sha512-b"],',
  "  }",
  "}",
].join("\n");
const BUN_1_4_2_REPORT = {
  vite: [
    {
      id: 1120786,
      url: "https://github.com/advisories/GHSA-v6wh-96g9-6wx3",
      title:
        "launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows",
      severity: "moderate",
      vulnerable_versions: ">=8.0.0 <=8.0.15",
      cwe: ["CWE-73", "CWE-522"],
      cvss: { score: 0, vectorString: null },
    },
    {
      id: 1123527,
      url: "https://github.com/advisories/GHSA-fx2h-pf6j-xcff",
      title: "vite: `server.fs.deny` bypass on Windows alternate paths",
      severity: "high",
      vulnerable_versions: ">=8.0.0 <=8.0.15",
      cwe: ["CWE-22", "CWE-200"],
      cvss: {
        score: 7.5,
        vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
      },
    },
  ],
  postcss: [
    {
      id: 1130709,
      url: "https://github.com/advisories/GHSA-fxqj-rqcc-2cmp",
      title:
        "PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset",
      severity: "moderate",
      vulnerable_versions: "<=8.5.22",
      cwe: ["CWE-22", "CWE-200"],
      cvss: { score: 0, vectorString: null },
    },
  ],
};

test("parses recorded Bun 1.4.2 audit output", () => {
  const findings = parseBunAudit(BUN_1_4_2_REPORT, BUN_1_4_2_LOCK);
  assert.deepEqual(
    findings.map((f) => `${findingKey(f)}:${f.severity}`),
    [
      "bun:GHSA-v6wh-96g9-6wx3:vite@8.0.10:moderate",
      "bun:GHSA-fx2h-pf6j-xcff:vite@8.0.10:high",
      "bun:GHSA-fxqj-rqcc-2cmp:postcss@8.5.15:moderate",
    ],
  );
  assert.deepEqual(parseBunAudit({}, BUN_1_4_2_LOCK), []);
});

test("rejects bun audit wrappers and malformed advisories", () => {
  const cases = [
    { vulnerabilities: [] },
    { vulnerabilities: BUN_1_4_2_REPORT.vite },
    { vite: [] },
    { vite: {} },
    { vite: [null] },
    { vite: [[]] },
    { vite: [{ severity: "high" }] },
  ];
  for (const report of cases) {
    assert.throws(
      () => parseBunAudit(report, BUN_1_4_2_LOCK),
      /Unexpected bun audit output/,
    );
  }
});

test("rejects malformed exception files", () => {
  const cases = [
    null,
    [],
    { version: 2, exceptions: [] },
    { version: 1, exceptions: {} },
    { version: 1, exceptions: [], extra: true },
    { version: 1, exceptions: [{ ...exception(), owner: "" }] },
    { version: 1, exceptions: [{ ...exception(), extra: "x" }] },
    { version: 1, exceptions: [{ ...exception(), ecosystem: "npm" }] },
    { version: 1, exceptions: [{ ...exception(), package: "*" }] },
    { version: 1, exceptions: [{ ...exception(), expires: "2026-13-01" }] },
    { version: 1, exceptions: [{ ...exception(), expires: "2026-09-25" }] },
    { version: 1, exceptions: [{ ...exception(), expires: "2026-12-26" }] },
    { version: 1, exceptions: [exception(), exception()] },
  ];
  for (const document of cases) {
    assert.throws(
      () => validateExceptions(document),
      /Malformed|Unsupported|Duplicate/,
    );
  }
});

test("rejects unexpected audit output shapes", () => {
  assert.throws(() => parseCargoAudit({}), /Unexpected cargo audit output/);
  assert.throws(() => parseBunAudit([], ""), /Unexpected bun audit output/);
});

test("never echoes tool output or environment values on failure", () => {
  const secret = "sk-test-DO-NOT-PRINT-1234567890";
  const spawn = () => ({ status: 2, stdout: secret, stderr: secret });
  assert.throws(
    () => runAuditJson("cargo audit", "cargo", ["audit"], { spawn }),
    (error) =>
      !error.message.includes(secret) && /exit status 2/.test(error.message),
  );
  const badJson = () => ({
    status: 1,
    stdout: `not json ${secret}`,
    stderr: "",
  });
  assert.throws(
    () => runAuditJson("bun audit", "bun", ["audit"], { spawn: badJson }),
    (error) => !error.message.includes(secret),
  );
  const text = formatResult(
    1,
    evaluateFindings(
      parseCargoAudit(cargoReport([["RUSTSEC-1", "crate", "1.0.0"]])),
      [],
      "2026-09-26",
    ),
  );
  assert.ok(!text.includes(secret));
  assert.match(text, /cargo:RUSTSEC-1:crate@1\.0\.0/);
});

test("accepts findings exit status and passes argument arrays without a shell", () => {
  let seen;
  const spawn = (command, args, options) => {
    seen = { command, args, shell: options.shell };
    return { status: 1, stdout: "{}", stderr: "" };
  };
  assert.deepEqual(
    runAuditJson("bun audit", "bun", ["audit", "--json"], { spawn }),
    {},
  );
  assert.deepEqual(seen, {
    command: "bun",
    args: ["audit", "--json"],
    shell: false,
  });
});

test("uses an injected clock for today", () => {
  assert.equal(
    today(() => new Date("2026-09-26T23:59:00Z")),
    "2026-09-26",
  );
});

test("committed exception file is valid", () => {
  const document = JSON.parse(
    fs.readFileSync(
      new URL("../docs/security/dependency-exceptions.json", import.meta.url),
      "utf8",
    ),
  );
  assert.doesNotThrow(() => validateExceptions(document));
});
