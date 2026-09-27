import { call, expect, invoke, openScreen, scenario, test } from "./rc-app";

const SCREENS = [
  "Campaigns",
  "Autopilot",
  "Backlog",
  "Queue",
  "Drafts",
  "Approvals",
  "Calendar",
  "Scheduler",
  "Comments",
  "Metrics",
  "Workflows",
  "Agent Runtime",
  "Playbooks",
  "Integrations",
  "Safety",
] as const;

test.skip(scenario() === undefined, "set LINKGO_DESKTOP_SCENARIO");

test("every screen loads over real IPC without an error state", async ({
  app,
}) => {
  const errors: string[] = [];
  app.on("pageerror", (error) => errors.push(error.message));
  for (const screen of SCREENS) {
    await openScreen(app, screen);
    await app.waitForLoadState("networkidle");
    await expect(app.getByText(/Could not load|Failed to load/i)).toHaveCount(
      0,
    );
  }
  expect(errors).toEqual([]);
});

test("ACL rejects raw SQL and unknown commands from the main window", async ({
  app,
}) => {
  for (const command of [
    "plugin:sql|load",
    "plugin:sql|execute",
    "plugin:sql|select",
    "linkgo_not_a_command",
  ]) {
    const result = await invoke(app, command, {
      db: "sqlite:linkgo.db",
      query: "SELECT 1",
      values: [],
    });
    expect(result.ok, command).toBe(false);
  }
  // Settings-only commands stay off the main window.
  expect((await invoke(app, "plugin:autostart|enable")).ok).toBe(false);
});

test("safety settings are readable through the typed command API", async ({
  app,
}) => {
  const dashboard = await call<{
    settings: { global_kill_switch: number };
  }>(app, "linkgo_safety_dashboard_get", { input: {} });
  expect([0, 1]).toContain(dashboard.settings.global_kill_switch);
});
