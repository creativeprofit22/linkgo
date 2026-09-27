import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Compares fresh `bun audit` / `cargo audit` findings with reviewed, time-bounded exceptions.
// Needs network access for the advisory databases, so it is not part of the offline `check`.

export const MAX_EXCEPTION_DAYS = 90;
const DAY_MS = 86_400_000;
const ECOSYSTEMS = ["bun", "cargo"];
const EXCEPTION_KEYS = [
  "ecosystem",
  "id",
  "package",
  "version",
  "kind",
  "severity",
  "reachability",
  "rationale",
  "owner",
  "reviewed",
  "expires",
];
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (values) => [...values].sort(compare);

function fail(message) {
  throw new Error(message);
}

export const findingKey = (item) =>
  `${item.ecosystem}:${item.id}:${item.package}@${item.version}`;

function parseDay(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(`Malformed ${label}: expected YYYY-MM-DD`);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value)
    fail(`Malformed ${label}: invalid date`);
  return time;
}

export function validateExceptions(document) {
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    sorted(Object.keys(document)).join() !== "exceptions,version"
  )
    fail("Malformed exception file");
  if (document.version !== 1) fail("Unsupported exception file version");
  if (!Array.isArray(document.exceptions))
    fail("Malformed exception file: exceptions must be an array");
  const seen = new Set();
  return document.exceptions.map((entry, index) => {
    const label = `exception #${index + 1}`;
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      sorted(Object.keys(entry)).join() !== sorted(EXCEPTION_KEYS).join()
    )
      fail(`Malformed ${label}: expected keys ${EXCEPTION_KEYS.join(", ")}`);
    for (const field of EXCEPTION_KEYS) {
      if (typeof entry[field] !== "string" || !entry[field].trim())
        fail(`Malformed ${label}: ${field} must be a non-empty string`);
    }
    if (!ECOSYSTEMS.includes(entry.ecosystem))
      fail(`Malformed ${label}: unknown ecosystem`);
    if (/[*?]/.test(`${entry.id}${entry.package}${entry.version}`))
      fail(`Malformed ${label}: wildcards are not allowed`);
    const reviewed = parseDay(entry.reviewed, `${label} reviewed`);
    const expires = parseDay(entry.expires, `${label} expires`);
    if (expires <= reviewed)
      fail(`Malformed ${label}: expires must be after reviewed`);
    if (expires - reviewed > MAX_EXCEPTION_DAYS * DAY_MS)
      fail(
        `Malformed ${label}: expiry exceeds ${MAX_EXCEPTION_DAYS} days after review`,
      );
    const key = findingKey(entry);
    if (seen.has(key)) fail(`Duplicate exception ${key}`);
    seen.add(key);
    return { ...entry, key, expiresAt: expires };
  });
}

// bun.lock is JSON with trailing commas; collect every locked version per package name.
export function lockedBunVersions(lockText) {
  const versions = new Map();
  const pattern = /^\s+"[^"]+": \["((?:@[^"/]+\/)?[^"@]+)@([^"]+)"/gm;
  for (const match of lockText.matchAll(pattern)) {
    const [, name, version] = match;
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(version);
  }
  return versions;
}

// Verified shape for Bun 1.3.14 and 1.4.2 (identical output): `{}` when clean, otherwise
// `{ [lockedPackageName]: [{ id, url, title, severity, vulnerable_versions, cwe, cvss }] }`.
// Anything else fails closed: a wrapper key such as `{ vulnerabilities: [] }` is rejected
// because it is not a locked package and its advisory list is empty.
export function parseBunAudit(report, lockText) {
  if (!report || typeof report !== "object" || Array.isArray(report))
    fail("Unexpected bun audit output");
  const locked = lockedBunVersions(lockText);
  const findings = [];
  for (const [name, advisories] of Object.entries(report)) {
    if (!Array.isArray(advisories) || !advisories.length)
      fail("Unexpected bun audit output");
    const lockedVersions = locked.get(name);
    if (!lockedVersions)
      fail("Unexpected bun audit output: package not found in bun.lock");
    // bun audit only reports `vulnerable_versions` ranges, not which locked copy is affected, so
    // the finding pins every locked copy; any copy changing version makes the exception stale.
    const versions = sorted(lockedVersions).join("|");
    for (const advisory of advisories) {
      if (!advisory || typeof advisory !== "object" || Array.isArray(advisory))
        fail("Unexpected bun audit output: advisory is not an object");
      const id = String(advisory.url ?? advisory.id ?? "")
        .split("/")
        .pop();
      if (!id) fail("Unexpected bun audit output: advisory without id");
      findings.push({
        ecosystem: "bun",
        id,
        package: name,
        version: versions,
        kind: "vulnerability",
        severity: String(advisory.severity ?? "unknown"),
      });
    }
  }
  return findings;
}

export function parseCargoAudit(report) {
  const list = report?.vulnerabilities?.list;
  if (!Array.isArray(list)) fail("Unexpected cargo audit output");
  const findings = list.map((item) => ({
    ecosystem: "cargo",
    id: item.advisory.id,
    package: item.package.name,
    version: item.package.version,
    kind: "vulnerability",
    severity: item.advisory.cvss ? String(item.advisory.cvss) : "unrated",
  }));
  for (const [kind, warnings] of Object.entries(report.warnings ?? {})) {
    if (!Array.isArray(warnings)) fail("Unexpected cargo audit output");
    for (const warning of warnings) {
      findings.push({
        ecosystem: "cargo",
        id: warning.advisory?.id ?? kind,
        package: warning.package.name,
        version: warning.package.version,
        kind,
        severity: "informational",
      });
    }
  }
  return findings;
}

export function evaluateFindings(findings, exceptions, today) {
  const now = parseDay(today, "today");
  const byKey = new Map(exceptions.map((entry) => [entry.key, entry]));
  const kindsByKey = new Map();
  for (const finding of findings) {
    const key = findingKey(finding);
    if (!kindsByKey.has(key)) kindsByKey.set(key, new Set());
    kindsByKey.get(key).add(finding.kind);
  }
  const findingKeys = new Set(kindsByKey.keys());
  const unexcepted = [];
  const kindMismatch = [];
  const expired = [];
  const excepted = [];
  for (const key of sorted(findingKeys)) {
    const exception = byKey.get(key);
    const kinds = sorted(kindsByKey.get(key));
    if (!exception) unexcepted.push(key);
    else if (kinds.some((kind) => kind !== exception.kind))
      kindMismatch.push(
        `${key} (exception kind ${exception.kind}, finding kind ${kinds.join("|")})`,
      );
    else if (exception.expiresAt < now) expired.push(key);
    else excepted.push(key);
  }
  const stale = sorted(
    exceptions.filter((entry) => !findingKeys.has(entry.key)).map((e) => e.key),
  );
  return {
    ok:
      !unexcepted.length &&
      !kindMismatch.length &&
      !expired.length &&
      !stale.length,
    unexcepted,
    kindMismatch,
    expired,
    stale,
    excepted,
  };
}

export function formatResult(findingCount, result) {
  const lines = [
    `Dependency audit: ${findingCount} finding(s), ${result.excepted.length} covered by active exceptions.`,
  ];
  const section = (title, keys) => {
    if (keys.length) lines.push(title, ...keys.map((key) => `  - ${key}`));
  };
  section("Findings without a reviewed exception:", result.unexcepted);
  section(
    "Exceptions whose kind does not match the finding (re-review):",
    result.kindMismatch,
  );
  section("Expired exceptions (re-review or remediate):", result.expired);
  section(
    "Stale exceptions matching no current finding (prune them):",
    result.stale,
  );
  if (!result.ok)
    lines.push(
      "Remediate, or record an exact exception with owner and expiry in docs/security/dependency-exceptions.json.",
    );
  return lines.join("\n");
}

// Runs an audit tool and returns parsed JSON. Tool stderr/stdout is never echoed so that
// environment-derived values cannot leak into logs.
export function runAuditJson(label, command, args, options = {}) {
  const run = options.spawn ?? spawnSync;
  const result = run(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.error) fail(`${label} could not start`);
  // Both tools exit 1 when they report findings; anything else is a tool failure.
  if (result.status !== 0 && result.status !== 1)
    fail(`${label} failed with exit status ${result.status}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`${label} did not return JSON (exit status ${result.status})`);
  }
}

export function today(clock = () => new Date()) {
  return clock().toISOString().slice(0, 10);
}

async function main() {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const exceptions = validateExceptions(
    JSON.parse(
      fs.readFileSync(
        path.join(root, "docs/security/dependency-exceptions.json"),
        "utf8",
      ),
    ),
  );
  const lockText = fs.readFileSync(path.join(root, "bun.lock"), "utf8");
  const bunReport = runAuditJson("bun audit", "bun", ["audit", "--json"], {
    cwd: root,
  });
  const cargoReport = runAuditJson(
    "cargo audit",
    "cargo",
    ["audit", "--json", "--file", path.join("src-tauri", "Cargo.lock")],
    { cwd: root },
  );
  const findings = [
    ...parseBunAudit(bunReport, lockText),
    ...parseCargoAudit(cargoReport),
  ];
  const result = evaluateFindings(findings, exceptions, today());
  console[result.ok ? "log" : "error"](formatResult(findings.length, result));
  if (!result.ok) process.exitCode = 1;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error) => {
    console.error(`Dependency audit check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
