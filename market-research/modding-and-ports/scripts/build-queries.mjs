#!/usr/bin/env node
// Expands config/query-matrix.json into config/query-list.json
// (deterministic order, canonical JSON) and prints count + SHA-256.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./lib/paths.mjs";

export function expandMatrix(matrix) {
  const { template, platforms, themes, intents, disconfirmation = [] } = matrix;
  if (typeof template !== "string") throw new Error("matrix.template required");
  const list = [];
  for (const platform of platforms) {
    for (const theme of themes) {
      for (const intent of intents) {
        list.push({
          id: `m-${platform.id}-${theme.id}-${intent.id}`,
          kind: "matrix",
          platform: platform.id,
          theme: theme.id,
          intent: intent.id,
          query: template
            .replaceAll("{host}", platform.host)
            .replaceAll("{phrase}", theme.phrase)
            .replaceAll("{intent}", intent.word),
        });
      }
    }
  }
  for (const item of disconfirmation) {
    list.push({
      id: `d-${item.id}`,
      kind: "disconfirmation",
      hypothesis: item.hypothesis,
      query: item.query,
    });
  }
  const ids = new Set();
  for (const entry of list) {
    if (ids.has(entry.id)) throw new Error(`duplicate query id ${entry.id}`);
    ids.add(entry.id);
  }
  return list;
}

export function canonicalJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function main({
  matrixPath = path.join(CONFIG_DIR, "query-matrix.json"),
  outPath = path.join(CONFIG_DIR, "query-list.json"),
} = {}) {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  const text = canonicalJson(expandMatrix(matrix));
  fs.writeFileSync(outPath, text, "utf8");
  const bytes = fs.readFileSync(outPath);
  const count = JSON.parse(bytes.toString("utf8")).length;
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(
    `queries: ${count}\nsha256: ${digest}\nfile: ${outPath}\n`,
  );
  return { count, digest };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
