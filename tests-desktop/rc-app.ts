/// <reference types="node" />
import { execFileSync } from "node:child_process";
import {
  type Browser,
  chromium,
  expect,
  type Page,
  test as base,
} from "@playwright/test";

/** Image name of the isolated release-candidate test build. */
const RC_IMAGE = "linkgo-rctest.exe";
/** Image name of the production build, which the harness must never drive. */
const PRODUCTION_IMAGE = "linkgo.exe";

/** Valid values of `LINKGO_DESKTOP_SCENARIO`, one per prepared RC profile. */
export const SCENARIOS = ["fresh", "upgraded", "recovery"] as const;

export type Scenario = (typeof SCENARIOS)[number];

export function scenario(): Scenario | undefined {
  const value = process.env.LINKGO_DESKTOP_SCENARIO;
  return SCENARIOS.find((candidate) => candidate === value);
}

function isRunning(image: string): boolean {
  const output = execFileSync(
    "tasklist",
    ["/FI", `IMAGENAME eq ${image}`, "/FO", "CSV", "/NH"],
    { encoding: "utf8" },
  );
  return output.toLowerCase().includes(`"${image}"`);
}

/**
 * Fails closed unless exactly the RC test identity is running, so the CDP
 * port can only belong to the isolated build and never to the real app.
 */
export function assertOnlyRcAppRunning(): void {
  if (process.platform !== "win32") {
    throw new Error("The desktop harness targets Windows WebView2 only");
  }
  if (isRunning(PRODUCTION_IMAGE)) {
    throw new Error(
      `${PRODUCTION_IMAGE} is running; quit the real Linkgo app before running the desktop harness`,
    );
  }
  if (!isRunning(RC_IMAGE)) {
    throw new Error(
      `${RC_IMAGE} is not running; start the RC test build with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`,
    );
  }
}

async function mainPage(browser: Browser): Promise<Page> {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const url = page.url();
      if (
        (url.startsWith("http://tauri.localhost") ||
          url.startsWith("tauri://localhost")) &&
        !url.includes("settings")
      ) {
        return page;
      }
    }
  }
  throw new Error("No Linkgo main window found over CDP");
}

export type InvokeResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Calls a real Tauri command from the main window through IPC and ACL. */
export async function invoke(
  page: Page,
  command: string,
  args?: Record<string, unknown>,
): Promise<InvokeResult> {
  return page.evaluate(
    async ({ command, args }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (command: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      try {
        return {
          ok: true as const,
          value: await internals.invoke(command, args),
        };
      } catch (caught) {
        return { ok: false as const, error: String(caught) };
      }
    },
    { command, args },
  );
}

/** Like `invoke`, but fails the test when the command is rejected. */
export async function call<T>(
  page: Page,
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await invoke(page, command, args);
  if (!result.ok) {
    throw new Error(`${command} failed: ${result.error}`);
  }
  return result.value as T;
}

/** Opens a main-window section from the sidebar and waits for it. */
export async function openScreen(page: Page, label: string): Promise<void> {
  const button = page
    .getByRole("navigation", { name: "Linkgo sections" })
    .getByRole("button", { name: new RegExp(`^${label}`) });
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "page");
}

export const test = base.extend<{ app: Page }>({
  app: async ({}, use) => {
    assertOnlyRcAppRunning();
    const port = process.env.LINKGO_CDP_PORT ?? "9222";
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    try {
      const page = await mainPage(browser);
      await page.bringToFront();
      await use(page);
    } finally {
      // Detaches only; closing a CDP-connected browser does not quit the app.
      await browser.close();
    }
  },
});

export { expect };
