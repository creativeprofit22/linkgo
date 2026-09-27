/// <reference types="node" />
import { call, expect, invoke, openScreen, scenario, test } from "./rc-app";

/**
 * Runs after the recovery fixture was installed as the RC profile, the
 * scheduler was started, and the RC process was hard-killed and relaunched.
 * Startup recovery must have released the stale `reserved` execution and
 * marked the stale `in_flight` one `outcome_unknown` without retrying it.
 */

type Open = {
  id: number;
  subjectId: number;
  status: string;
  fence: number;
  campaignName: string;
};
type SchedulerStatus = { enabled: boolean; running: boolean };

test.describe.configure({ mode: "serial" });
test.skip(scenario() !== "recovery", "needs the recovery fixture profile");

test("scheduler is enabled but not running after a hard kill and relaunch", async ({
  app,
}) => {
  const status = await call<SchedulerStatus>(app, "linkgo_scheduler_status");
  expect(status.running).toBe(false);
  if (process.env.LINKGO_EXPECT_SCHEDULER_ENABLED === "1") {
    expect(status.enabled).toBe(true);
  }
});

test("startup sweep leaves only the ambiguous execution for the operator", async ({
  app,
}) => {
  const open = await call<Open[]>(app, "linkgo_publish_execution_list_open");
  const fixture = open.filter((e) => e.campaignName.startsWith("RC fixture"));
  expect(fixture).toHaveLength(1);
  expect(fixture[0]?.status).toBe("outcome_unknown");
});

test("an outcome_unknown execution is never retried by a tick", async ({
  app,
}) => {
  const before = await call<Open[]>(app, "linkgo_publish_execution_list_open");
  const tick = await call<{ published: number }>(app, "linkgo_scheduler_tick");
  expect(tick.published).toBe(0);
  const after = await call<Open[]>(app, "linkgo_publish_execution_list_open");
  const ambiguous = before.find((e) => e.status === "outcome_unknown");
  expect(after.find((e) => e.id === ambiguous?.id)).toMatchObject({
    status: "outcome_unknown",
    fence: ambiguous?.fence,
  });
});

test("operator reconciles the ambiguous execution from Safety", async ({
  app,
}) => {
  const open = await call<Open[]>(app, "linkgo_publish_execution_list_open");
  const ambiguous = open.find((e) => e.status === "outcome_unknown");
  expect(ambiguous).toBeDefined();

  const wrong = await invoke(app, "linkgo_publish_execution_reconcile", {
    input: {
      executionId: ambiguous?.id,
      fence: ambiguous?.fence,
      resolution: "not_posted",
      note: "checked",
      confirmation: "yes",
    },
  });
  expect(wrong.ok).toBe(false);

  await openScreen(app, "Safety");
  const card = app.getByLabel(`Post execution ${ambiguous?.id}`);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Reconcile" }).click();
  const dialog = app.getByRole("dialog");
  await dialog.getByLabel("Not posted").check();
  await dialog
    .getByLabel(/Note/)
    .fill("RC verification: checked LinkedIn manually, nothing posted");
  const submit = dialog.getByRole("button", { name: "Reconcile" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill("RECONCILE");
  await submit.click();
  await expect(dialog).toBeHidden();
  const after = await call<Open[]>(app, "linkgo_publish_execution_list_open");
  expect(after.find((e) => e.id === ambiguous?.id)).toBeUndefined();
});
