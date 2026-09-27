/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { chromium, type Page } from "@playwright/test";
import { call, expect, invoke, scenario, test } from "./rc-app";

/**
 * Launch-on-login through the real settings window and autostart plugin, and
 * the main window's close-to-tray behavior. Only the RC Run-key entry may
 * change; the production entry must stay exactly as it was.
 */

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

function runEntries(): string[] {
  let output = "";
  try {
    output = execFileSync("reg", ["query", RUN_KEY], { encoding: "latin1" });
  } catch {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().includes("linkgo"));
}

async function settingsPage(): Promise<Page> {
  const port = process.env.LINKGO_CDP_PORT ?? "9222";
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((p) => p.url().includes("settings"));
      if (page !== undefined) return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Settings window did not open");
}

test.describe.configure({ mode: "serial" });
test.skip(scenario() !== "fresh", "lifecycle runs on the fresh profile");

test("launch-on-login adds and removes only the RC Run entry", async ({
  app,
}) => {
  const productionBefore = runEntries().filter((line) =>
    /^linkgo\s/i.test(line),
  );
  expect(runEntries().some((line) => /rc ?test/i.test(line))).toBe(false);

  // The main window cannot touch autostart directly.
  expect((await invoke(app, "plugin:autostart|enable")).ok).toBe(false);

  await call(app, "linkgo_window_open_settings");
  const settings = await settingsPage();
  const toggle = settings.getByRole("switch", {
    name: "Launch Linkgo at login",
  });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => runEntries().filter((line) => /rc ?test/i.test(line)).length)
    .toBe(1);
  const rcEntry = runEntries().find((line) => /rc ?test/i.test(line)) ?? "";
  expect(rcEntry.toLowerCase()).toContain("linkgo-rctest.exe");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() => runEntries().filter((line) => /rc ?test/i.test(line)).length)
    .toBe(0);
  expect(runEntries().filter((line) => /^linkgo\s/i.test(line))).toEqual(
    productionBefore,
  );
  await settings.close();
});
