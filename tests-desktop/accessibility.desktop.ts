import AxeBuilder from "@axe-core/playwright";
import { expect, openScreen, scenario, test } from "./rc-app";

/**
 * axe-core scan of every main-window screen inside the real WebView2 app,
 * with real data from the current RC profile. Serious and critical WCAG A/AA
 * violations fail; moderate and minor ones are reported for the release
 * review.
 */

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

test("every screen has no serious or critical WCAG A/AA violations", async ({
  app,
}) => {
  const blocking: string[] = [];
  for (const screen of SCREENS) {
    await openScreen(app, screen);
    await app.waitForLoadState("networkidle");
    const scan = await new AxeBuilder({ page: app })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const violation of scan.violations) {
      const line = `${screen}: [${violation.impact ?? "unknown"}] ${violation.id} (${violation.nodes.length} nodes)`;
      console.log(line);
      if (violation.impact === "serious" || violation.impact === "critical") {
        blocking.push(line);
      }
    }
  }
  expect(blocking).toEqual([]);
});
