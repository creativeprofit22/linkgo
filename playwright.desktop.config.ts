import { defineConfig } from "@playwright/test";
import { SCENARIOS, scenario } from "./tests-desktop/rc-app";

/**
 * Real-boundary desktop harness. It attaches over CDP to an already running,
 * installed `Linkgo RC Test` build (see docs/verification) and drives real
 * IPC, ACL, SQLite and native scheduler code. It is deliberately excluded from
 * `bun run check` because it needs an installed native app; run it with
 * `bun run test:desktop`.
 *
 * Every spec is scenario-gated, so an unset scenario would skip everything
 * and exit green having verified nothing. Fail at config load instead.
 */
if (scenario() === undefined) {
  throw new Error(
    `LINKGO_DESKTOP_SCENARIO must be one of ${SCENARIOS.join("|")} (got ${JSON.stringify(process.env.LINKGO_DESKTOP_SCENARIO ?? null)}). See "Rerunning the desktop harness" in docs/verification/2026-09-27-desktop-release-candidate.md.`,
  );
}

export default defineConfig({
  testDir: "./tests-desktop",
  testMatch: /.*\.desktop\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
});
