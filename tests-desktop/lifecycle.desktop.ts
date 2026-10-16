/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { expect, scenario, test } from "./rc-app";

/**
 * Launch-on-login through the in-app Settings screen (`#/settings` in the main
 * window) and the real autostart plugin. Only the RC Run-key entry may change;
 * the production entry must stay exactly as it was.
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

test.describe.configure({ mode: "serial" });
test.skip(scenario() !== "fresh", "lifecycle runs on the fresh profile");

test("launch-on-login adds and removes only the RC Run entry", async ({
  app,
}) => {
  const productionBefore = runEntries().filter((line) =>
    /^linkgo\s/i.test(line),
  );
  expect(runEntries().some((line) => /rc ?test/i.test(line))).toBe(false);

  await app.evaluate(() => {
    location.hash = "#/settings";
  });
  const toggle = app.getByRole("switch", {
    name: "Open Linkgo when I sign in",
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
  await app.evaluate(() => {
    location.hash = "#/today";
  });
});
