import { call, expect, invoke, openScreen, scenario, test } from "./rc-app";

/**
 * Campaign → candidate → manual draft → deterministic checks → dry-run AI
 * audit → dry-run quality loop → approval → schedule → scheduler, all through
 * the installed app's real IPC, ACL, SQLite and native scheduler. The RC
 * identity has no LinkedIn credential, so every publish attempt is rejected
 * locally before any network request.
 */

type Row = Record<string, unknown>;
type DraftSnapshot = { drafts: Row[]; variants: Row[]; audits: Row[] };
type SchedulerStatus = { enabled: boolean; running: boolean };
type Tick = {
  claimed: number;
  published: number;
  retryScheduled: number;
  failed: number;
  blocked: number;
};
type Dashboard = {
  dueJobs: Row[];
  recentEvents: Row[];
  recentAttempts: Row[];
  globalKillSwitchEnabled: boolean;
};

test.describe.configure({ mode: "serial" });
test.skip(
  scenario() !== "fresh" && scenario() !== "upgraded",
  "workflow runs on the fresh or upgraded profile",
);

const stamp = Date.now();
const state: { campaignId?: number; approvalId?: number; jobId?: number } = {};

test("campaign to approved, scheduled post over real IPC", async ({ app }) => {
  // Existing profiles may carry an enabled kill switch; clearing it is an
  // explicit operator action recorded in the safety audit log.
  const safety = await call<{ settings: { global_kill_switch: number } }>(
    app,
    "linkgo_safety_dashboard_get",
    { input: {} },
  );
  if (safety.settings.global_kill_switch === 1) {
    await call(app, "linkgo_safety_set_global_kill_switch", {
      input: { enabled: false, reason: "RC verification" },
    });
  }
  const campaignId = await call<number>(app, "linkgo_campaign_create", {
    input: {
      name: `RC workflow ${stamp}`,
      product: "Linkgo RC",
      audience: "Release testers",
      keywords: ["release"],
    },
  });
  await call(app, "linkgo_campaign_status_set", {
    input: { id: campaignId, status: "active" },
  });
  const candidate = await call<{ id: number }>(app, "linkgo_candidate_create", {
    input: {
      campaignId,
      url: `https://example.com/rc/${stamp}`,
      content: "A source post about shipping a desktop release candidate.",
      sourceKeyword: "release",
    },
  });
  const draft = await call<{ id: number }>(app, "linkgo_draft_create", {
    input: {
      candidateId: candidate.id,
      angle: "Release discipline",
      variants: [
        {
          hook: "We verified 12 release checks on real hardware before shipping",
          body: "Our team installed the build, broke it on purpose and recovered it.",
          cta: "What do you check before a release?",
          hashtags: "#Release",
        },
      ],
    },
  });

  const snapshot = await call<DraftSnapshot>(app, "linkgo_draft_list", {
    input: { campaignId },
  });
  const variant = snapshot.variants.find((v) => v.draft_id === draft.id);
  expect(variant).toBeDefined();
  const variantId = Number(variant?.id);
  // Deterministic checks are written natively with the draft.
  expect(
    snapshot.audits.filter((a) => a.draft_variant_id === variantId).length,
  ).toBeGreaterThan(0);
  await call(app, "linkgo_draft_variant_set_status", {
    input: { id: variantId, status: "selected" },
  });

  // Dry-run AI audit and quality loop through the real UI (no provider call).
  await openScreen(app, "Campaigns");
  await openScreen(app, "Drafts");
  const audit = app.locator(
    `section[aria-labelledby="variant-${variantId}-ai-audit-title"]`,
  );
  await audit.getByRole("button", { name: "Run AI audit" }).click();
  await expect(audit.getByText("Completed", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  const quality = app.getByRole("region", { name: "Draft quality" }).filter({
    has: app.locator(`#quality-${variantId}-title`),
  });
  await quality
    .getByRole("button", { name: "Run quality loop", exact: true })
    .click();
  await quality.getByRole("button", { name: "Confirm and run" }).click();
  await expect(quality.getByText("Passed", { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const approvalId = await call<number>(app, "linkgo_approval_create", {
    input: { draftId: draft.id },
  });
  const revision = await call<DraftSnapshot>(app, "linkgo_draft_list", {
    input: { campaignId },
  });
  const current = revision.variants.find((v) => v.id === variantId);
  await call(app, "linkgo_approval_set_status", {
    input: {
      id: approvalId,
      status: "approved",
      contentRevision: Number(current?.content_revision),
    },
  });
  // Due immediately so the scheduler can claim it.
  await call(app, "linkgo_approval_schedule", {
    input: {
      approvalId,
      scheduledFor: "2020-01-01T09:00:00Z",
      timezone: "UTC",
    },
  });
  const dashboard = await call<Dashboard>(
    app,
    "linkgo_scheduler_dashboard_get",
    {
      input: { campaignId },
    },
  );
  const job = dashboard.dueJobs.find((j) => j.approval_id === approvalId);
  expect(job?.status).toBe("scheduled");
  Object.assign(state, { campaignId, approvalId, jobId: Number(job?.id) });
});

test("kill switch blocks scheduler start and due jobs", async ({ app }) => {
  expect(state.campaignId).toBeDefined();
  await call(app, "linkgo_safety_set_global_kill_switch", {
    input: { enabled: true, reason: "RC verification" },
  });
  try {
    const start = await invoke(app, "linkgo_scheduler_start");
    expect(start.ok).toBe(false);
    const tick = await call<Tick>(app, "linkgo_scheduler_tick");
    expect(tick.claimed).toBe(0);
    expect(tick.blocked).toBeGreaterThanOrEqual(1);
  } finally {
    await call(app, "linkgo_safety_set_global_kill_switch", {
      input: { enabled: false, reason: "" },
    });
  }
});

test("scheduler tick without a LinkedIn credential rejects locally and backs off", async ({
  app,
}) => {
  const tick = await call<Tick>(app, "linkgo_scheduler_tick");
  expect(tick.published).toBe(0);
  expect(tick.claimed).toBeGreaterThanOrEqual(1);
  expect(tick.retryScheduled + tick.failed).toBeGreaterThanOrEqual(1);

  const dashboard = await call<Dashboard>(
    app,
    "linkgo_scheduler_dashboard_get",
    {
      input: { campaignId: state.campaignId },
    },
  );
  const job = dashboard.dueJobs.find((j) => j.id === state.jobId);
  // Definite local rejection: one attempt used, retry backed off to later.
  expect(job).toMatchObject({
    status: "scheduled",
    attempt_count: 1,
    last_error: "LinkedIn is not connected",
  });
  expect(
    Date.parse(`${String(job?.next_attempt_at).replace(" ", "T")}Z`),
  ).toBeGreaterThan(
    Date.parse(`${String(job?.last_attempted_at).replace(" ", "T")}Z`),
  );
  const attempt = dashboard.recentAttempts.find(
    (a) => a.approval_id === state.approvalId,
  );
  expect(attempt).toBeDefined();
  expect(String(attempt?.status)).not.toBe("published");

  const open = await call<Row[]>(app, "linkgo_publish_execution_list_open");
  // A definite local rejection never leaves an ambiguous execution behind.
  expect(open.filter((e) => e.subjectId === state.approvalId)).toEqual([]);
});

test("scheduler start and stop persist the enabled flag", async ({ app }) => {
  const started = await call<SchedulerStatus>(app, "linkgo_scheduler_start");
  expect(started).toMatchObject({ enabled: true, running: true });
  const stopped = await call<SchedulerStatus>(app, "linkgo_scheduler_stop");
  expect(stopped).toMatchObject({ enabled: false, running: false });
});
