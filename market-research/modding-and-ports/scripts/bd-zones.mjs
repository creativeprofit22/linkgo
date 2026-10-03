// Creates the Bright Data zones this study needs, mirroring the payloads used
// by @brightdata/cli 0.3.7 `login` (ensure_zones, cli_unlocker) and the
// official brightdata-sdk ZoneManager (SERP zone). Zone creation is free.
//
// The CLI's only zone-creation path is `brightdata login`, which writes the key
// to a plaintext credentials.json, so this script calls the same endpoints
// directly with the key from the Credential Manager bridge. The key is held in
// memory only; every response is redacted before it is printed or logged.
//
// Usage: node bd-zones.mjs ensure [--phase 01-protocol]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadApiKey, redact } from "./lib/secret.mjs";
import { createRunLog } from "./lib/run-log.mjs";
import { DEFAULT_PHASE, assertSafeName, rawDir } from "./lib/paths.mjs";

export const API_BASE = "https://api.brightdata.com";

/** Zones the study needs. Names match the CLI convention (`cli_*`). */
export const REQUIRED_ZONES = [
  {
    name: "cli_unlocker",
    role: "unlocker",
    // @brightdata/cli dist/commands/login.js ensure_zones
    body: {
      zone: { name: "cli_unlocker", type: "unblocker" },
      plan: { type: "unblocker" },
    },
  },
  {
    name: "cli_serp",
    role: "serp",
    // brightdata/sdk-js src/api/zones.ts createZone({type:"serp"}): an
    // unblocker zone with plan.serp=true. (The sdk-python shape with
    // zone.type "serp" returned HTTP 403 on 2026-10-02.)
    body: {
      zone: { name: "cli_serp", type: "unblocker" },
      plan: { type: "unblocker", serp: true },
    },
  },
];

/** Which required zones are missing from a `get_active_zones` response. */
export function missingZones(activeZones, required = REQUIRED_ZONES) {
  const names = new Set(
    (Array.isArray(activeZones) ? activeZones : []).map((z) => z?.name),
  );
  return required.filter((zone) => !names.has(zone.name));
}

/** Map an HTTP status to a run-log status. 409 = zone already exists. */
export function classifyCreate(status) {
  if (status === 200 || status === 201 || status === 409) return "ok";
  if (status === 401 || status === 403) return "blocked";
  return "http_error";
}

/**
 * Zone responses carry proxy passwords (a second secret). Replace every
 * `password` / `passwords` value with "[redacted]" before anything is shown
 * or written.
 */
export function stripZoneSecrets(value) {
  if (Array.isArray(value)) return value.map(stripZoneSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = /^passwords?$/i.test(k) ? "[redacted]" : stripZoneSecrets(v);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.replace(
      /("passwords?"\s*:\s*)(\[[^\]]*\]|"[^"]*")/gi,
      '$1"[redacted]"',
    );
  }
  return value;
}

async function call(fetchImpl, key, method, endpoint, body) {
  const res = await fetchImpl(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "User-Agent": "brightdata-cli",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: res.status,
    brdError:
      res.headers.get("x-brd-error") ??
      res.headers.get("x-luminati-error") ??
      null,
    data: stripZoneSecrets(data),
  };
}

export async function ensureZones({
  phase = DEFAULT_PHASE,
  fetchImpl = fetch,
  loadKey = loadApiKey,
  now = () => new Date(),
  print = (line) => process.stdout.write(line + "\n"),
} = {}) {
  assertSafeName(phase, "phase");
  const key = await loadKey();
  const dir = path.join(rawDir(phase), "zones");
  fs.mkdirSync(dir, { recursive: true });
  const log = createRunLog({
    path: path.join(rawDir(phase), "run-log.jsonl"),
    key,
    now,
  });
  const stamp = now().toISOString().replace(/[-:]/g, "").slice(0, 15);

  const record = (id, kind, args, startedAt, result, status) => {
    const outFile = path.join(dir, `${id}.json`);
    const safe = redact(JSON.stringify(result, null, 2), key);
    fs.writeFileSync(outFile, safe + "\n", "utf8");
    log.append({
      id,
      phase,
      kind,
      input: null,
      args,
      startedAt,
      status,
      exitCode: null,
      recordCount: Array.isArray(result.data) ? result.data.length : null,
      requestCount: 1,
      outputPath: path.relative(rawDir(phase), outFile).replace(/\\/g, "/"),
      errorClass:
        status === "ok"
          ? null
          : `http_${result.status}${result.brdError ? "_brd" : ""}`,
    });
  };

  const listStart = now().toISOString();
  const list = await call(fetchImpl, key, "GET", "/zone/get_active_zones");
  const listStatus = list.status === 200 ? "ok" : classifyCreate(list.status);
  record(
    `zones-list-${stamp}`,
    "zones",
    ["GET", "/zone/get_active_zones"],
    listStart,
    list,
    listStatus,
  );
  if (listStatus !== "ok") {
    print(redact(`zone list failed: HTTP ${list.status}`, key));
    return { ok: false, created: [], results: [list] };
  }

  const todo = missingZones(list.data);
  print(
    `active zones before: ${(list.data ?? []).map((z) => z.name).join(", ") || "(none)"}`,
  );
  const results = [];
  for (const zone of todo) {
    const startedAt = now().toISOString();
    // No retry: a repeated POST could double-create; 409 is handled as exists.
    const res = await call(fetchImpl, key, "POST", "/zone", zone.body);
    const status = classifyCreate(res.status);
    record(
      `zone-create-${zone.name}-${stamp}`,
      "zone_create",
      ["POST", "/zone", zone.name, zone.body.zone.type],
      startedAt,
      res,
      status,
    );
    const detail =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    print(
      redact(
        `create ${zone.name} (${zone.role}): HTTP ${res.status}${res.brdError ? ` x-brd-error=${res.brdError}` : ""} ${String(detail).slice(0, 300)}`,
        key,
      ),
    );
    results.push({ zone: zone.name, status: res.status, outcome: status });
  }
  return {
    ok: results.every((r) => r.outcome === "ok"),
    created: results.filter((r) => r.outcome === "ok").map((r) => r.zone),
    results,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const phaseIndex = rest.indexOf("--phase");
  const phase = phaseIndex >= 0 ? rest[phaseIndex + 1] : DEFAULT_PHASE;
  if (command !== "ensure") {
    process.stderr.write("Usage: node bd-zones.mjs ensure [--phase <id>]\n");
    process.exit(2);
  }
  ensureZones({ phase })
    .then((summary) => process.exit(summary.ok ? 0 : 1))
    .catch((error) => {
      process.stderr.write(`bd-zones failed: ${error.message}\n`);
      process.exit(1);
    });
}
