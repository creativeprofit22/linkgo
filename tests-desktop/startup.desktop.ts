import {
  call,
  expect,
  invoke,
  MENU_SCREENS,
  openScreen,
  scenario,
  test,
} from "./rc-app";

test.skip(scenario() === undefined, "set LINKGO_DESKTOP_SCENARIO");

test("every screen loads over real IPC without an error state", async ({
  app,
}) => {
  const errors: string[] = [];
  app.on("pageerror", (error) => errors.push(error.message));
  for (const screen of MENU_SCREENS) {
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
  // The in-app Settings screen reads autostart from the main window. Only the
  // read-only check runs here; enable would add a Run entry (see lifecycle).
  expect((await invoke(app, "plugin:autostart|is_enabled")).ok).toBe(true);
  // The Settings window is gone, so its opener must not be callable (mirrors
  // main_window_grants_startup_controls in command_registry_tests.rs).
  expect((await invoke(app, "linkgo_window_open_settings")).ok).toBe(false);
});

test("safety settings are readable through the typed command API", async ({
  app,
}) => {
  const dashboard = await call<{
    settings: { global_kill_switch: number };
  }>(app, "linkgo_safety_dashboard_get", { input: {} });
  expect([0, 1]).toContain(dashboard.settings.global_kill_switch);
});
