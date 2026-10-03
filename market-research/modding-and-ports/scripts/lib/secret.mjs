// Bridge to the Bright Data API key stored by the Linkgo app in Windows
// Credential Manager. The key is held in memory only; never log it.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const KEY_SCRIPT = fileURLToPath(
  new URL("../bd-key.ps1", import.meta.url),
);

const EXIT_CLASSES = { 2: "credential missing", 3: "credential malformed" };

export function keyBridgeArgs(scriptPath = KEY_SCRIPT) {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ];
}

export async function loadApiKey({ spawnImpl = spawn, scriptPath } = {}) {
  const output = await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl("powershell.exe", keyBridgeArgs(scriptPath), {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      reject(new Error("key bridge failed to start"));
      return;
    }
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    // stderr is drained but discarded: the bridge only writes generic text,
    // and nothing it emits should be echoed by callers.
    child.stderr?.on("data", () => {});
    child.on("error", () => reject(new Error("key bridge failed to start")));
    child.on("close", (code) => {
      if (code !== 0) {
        const label = EXIT_CLASSES[code] ?? "key bridge failed";
        reject(new Error(`${label} (exit ${code})`));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
  if (!output || !/^\S+$/.test(output)) {
    throw new Error("credential malformed (bridge output invalid)");
  }
  return output;
}

export function containsSecret(text, key) {
  if (!key || text == null) return false;
  return String(text).includes(key);
}

export function redact(text, key) {
  if (text == null) return text;
  const value = String(text);
  if (!key) return value;
  return value
    .split(`Bearer ${key}`)
    .join("[redacted]")
    .split(key)
    .join("[redacted]");
}
