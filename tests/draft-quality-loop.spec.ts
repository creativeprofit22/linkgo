/// <reference types="node" />
import { expect, test } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";
import { readFileSync } from "node:fs";
import { createServer, type ViteDevServer } from "vite";
let componentServer: ViteDevServer;
test.beforeAll(async () => {
  componentServer = await createServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await componentServer.listen();
});
test.afterAll(async () => {
  await componentServer?.close();
});
const settlement = JSON.parse(
  readFileSync(
    new URL("./fixtures/draft-quality-settlement.json", import.meta.url),
    "utf8",
  ),
);

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Drafts" }).click();
});

const deterministicFixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/draft-deterministic-audits.json", import.meta.url),
    "utf8",
  ),
) as {
  messages: Record<string, Record<string, string>>;
  cases: Array<{
    name: string;
    checkerOnly?: boolean;
    bodyRepeat?: number;
    rewrite: { hook: string; body: string; cta: string; hashtags: string };
    expected: Array<[string, string]>;
  }>;
};

for (const fixture of deterministicFixtures.cases) {
  test(`deterministic rewrite parity and rendered checks: ${fixture.name}`, async ({
    page,
  }) => {
    const renderErrors: string[] = [];
    page.on("pageerror", (error) => renderErrors.push(error.message));
    await page.goto(componentServer.resolvedUrls!.local[0]);
    const rewrite = {
      ...fixture.rewrite,
      body: fixture.rewrite.body.repeat(fixture.bodyRepeat ?? 1),
    };
    const expected = fixture.expected.map(([rule_key, severity]) => ({
      rule_key,
      severity,
      message: deterministicFixtures.messages[rule_key][severity],
    }));
    const result = await page.evaluate(
      async ({ rewrite, checkerOnly, categoryScores }) => {
        const dataPath = "/src/features/drafts/data.ts";
        const { auditDraftVariant, mapDraftVariant, setDraftVariantStatus } =
          await import(dataPath);
        const tsFindings = auditDraftVariant(rewrite);
        if (checkerOnly) return { tsFindings };
        type Finding = {
          rule_key: string;
          severity: string;
          message: string;
          content_revision: number;
          draft_variant_id: number;
        };
        const w = window as unknown as {
          __LINKGO_SQL_SEED_QUALITY_RECOVERY__: (
            status: string,
            attempt: number,
            stale: boolean,
          ) => Promise<{ qualityRunId: number; draftVariantId: number }>;
          __LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__: () => {
            draftAudits: Finding[];
            draftVariants: Array<{
              id: number;
              content_revision: number;
              hook: string;
              body: string;
              cta: string;
              hashtags: string;
            }>;
          };
          __TAURI_INTERNALS__: {
            invoke: (
              command: string,
              args: unknown,
            ) => Promise<Record<string, number>>;
          };
        };
        const scope = await w.__LINKGO_SQL_SEED_QUALITY_RECOVERY__(
          "failed",
          1,
          false,
        );
        const claim = await w.__TAURI_INTERNALS__.invoke(
          "linkgo_draft_quality_resume",
          { input: scope },
        );
        // Test-only fixture seeding; the renderer itself has no SQL access.
        await w.__TAURI_INTERNALS__.invoke("__linkgo_test_sql|execute", {
          query:
            "INSERT INTO draft_audits (draft_variant_id, rule_key, severity, message) VALUES ($1, $2, $3, $4)",
          values: [scope.draftVariantId, "old", "block", "Old finding"],
        });
        const input = {
          ...scope,
          attemptId: claim.attemptId,
          agentRunId: claim.agentRunId,
          contentRevision: 1,
          categoryScores,
          rewrite,
          summary: "Fixture rewrite",
        };
        await w.__TAURI_INTERNALS__.invoke("linkgo_draft_quality_apply_score", {
          input,
        });
        const snapshot = w.__LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__();
        const audits = snapshot.draftAudits.filter(
          (row) => row.draft_variant_id === scope.draftVariantId,
        );
        const row = snapshot.draftVariants.find(
          (row) => row.id === scope.draftVariantId,
        )!;
        const rank: Record<string, number> = { block: 0, warning: 1, pass: 2 };
        audits.sort(
          (a, b) =>
            rank[a.severity] - rank[b.severity] ||
            a.rule_key.localeCompare(b.rule_key),
        );
        let selectionError = "";
        try {
          await setDraftVariantStatus({ id: row.id, status: "selected" });
        } catch (error) {
          selectionError = String(error);
        }
        const reactPath = "/node_modules/.vite/deps/react.js";
        const domPath = "/node_modules/.vite/deps/react-dom_client.js";
        const cardPath =
          "/src/features/drafts/components/draft-variant-card.tsx";
        const { default: React } = await import(reactPath);
        const {
          default: { createRoot },
        } = await import(domPath);
        const { DraftVariantCard } = await import(cardPath);
        const host = document.createElement("div");
        host.id = "rewrite-fixture";
        document.body.append(host);
        createRoot(host).render(
          React.createElement(DraftVariantCard, {
            variant: mapDraftVariant(row, audits),
            qualityPending: false,
            onUpdateVariant: async () => {},
            onSetVariantStatus: async () => {},
            onRunAiAudit: async () => {},
            onRunQuality: async () => {},
            onResumeQuality: async () => {},
          }),
        );
        return {
          tsFindings,
          persisted: audits.map(({ rule_key, severity, message }) => ({
            rule_key,
            severity,
            message,
          })),
          revisions: audits.map((row) => row.content_revision),
          row,
          selectionError,
        };
      },
      {
        rewrite,
        checkerOnly: fixture.checkerOnly,
        categoryScores: settlement.categoryScores.map(
          (score: Record<string, unknown>) => ({ ...score, score: 50 }),
        ),
      },
    );
    expect(result.tsFindings).toEqual(expected);
    if (fixture.checkerOnly) return;
    expect(result.persisted).toEqual(expected);
    expect(result.revisions).toEqual(expected.map(() => 2));
    expect(result.row).toMatchObject({ ...rewrite, content_revision: 2 });
    const blocked = expected.some((finding) => finding.severity === "block");
    if (blocked)
      expect(result.selectionError).toContain(
        "Blocked variants cannot be selected",
      );
    else expect(result.selectionError).toBe("");
    await expect
      .poll(() =>
        page
          .locator("#rewrite-fixture")
          .innerText()
          .then((text) =>
            renderErrors.length ? renderErrors.join("; ") : text,
          ),
      )
      .toContain("Deterministic checks");
    const checks = page
      .locator("#rewrite-fixture")
      .getByRole("region", { name: /Deterministic checks/ });
    for (const finding of expected)
      await expect(
        checks.getByText(`: ${finding.message}`, { exact: true }),
      ).toBeVisible();
    await expect(
      checks.getByText(
        "Machine rewrite applied; deterministic checks regenerated.",
      ),
    ).toHaveCount(0);
  });
}

test("quality mock rejects native DTO extra and missing fields before settlement", async ({
  page,
}) => {
  const malformed: Record<string, unknown>[] = [];
  for (const key of [
    "campaignId",
    "hook",
    "body",
    "cta",
    "hashtags",
    "threshold",
    "rewriteAllowed",
    "priorCategoryFeedback",
  ]) {
    malformed.push({ ...settlement, [key]: null });
  }
  for (const key of Object.keys(settlement)) {
    const missing = { ...settlement };
    delete missing[key];
    malformed.push(missing);
  }
  malformed.push({
    ...settlement,
    categoryScores: [{ ...settlement.categoryScores[0], extra: true }],
  });
  malformed.push({
    ...settlement,
    rewrite: { hook: "Hook", body: "Body", cta: "", hashtags: "", extra: true },
  });
  const errors = await page.evaluate(async (inputs) => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string, args: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__.invoke;
    return Promise.all(
      inputs.map(async (input) => {
        try {
          await invoke("linkgo_draft_quality_apply_score", { input });
          return "accepted";
        } catch (error) {
          return String(error);
        }
      }),
    );
  }, malformed);
  for (const error of errors)
    expect(error).toContain("Invalid quality settlement DTO");
});

for (const scenario of [
  {
    name: "failed recoverable",
    status: "failed",
    attempt: 1,
    revision: 1,
    resume: true,
  },
  {
    name: "failed final retry",
    status: "failed",
    attempt: 2,
    revision: 1,
    resume: true,
  },
  {
    name: "failed exhausted",
    status: "failed",
    attempt: 3,
    revision: 1,
    resume: false,
  },
  {
    name: "needs revision",
    status: "needs_revision",
    attempt: 1,
    revision: 1,
    resume: false,
  },
  {
    name: "stale revision",
    status: "failed",
    attempt: 1,
    revision: 2,
    resume: false,
  },
]) {
  test(`quality mock recovery parity: ${scenario.name}`, async ({ page }) => {
    const outcome = await page.evaluate(async (state) => {
      const w = window as unknown as {
        __LINKGO_SQL_SEED_QUALITY_RECOVERY__: (
          status: string,
          attempt: number,
          stale: boolean,
        ) => Promise<{ qualityRunId: number; draftVariantId: number }>;
        __LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__: () => {
          draftQualityAttempts: { attempt_number: number }[];
          draftQualityRuns: { status: string }[];
        };
        __TAURI_INTERNALS__: {
          invoke: (command: string, args: unknown) => Promise<unknown>;
        };
      };
      const input = await w.__LINKGO_SQL_SEED_QUALITY_RECOVERY__(
        state.status,
        state.attempt,
        state.revision !== 1,
      );
      const before = JSON.stringify(
        w.__LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__(),
      );
      try {
        await w.__TAURI_INTERNALS__.invoke("linkgo_draft_quality_resume", {
          input,
        });
        const after = w.__LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__();
        return {
          accepted: true,
          attempt: after.draftQualityAttempts.at(-1)?.attempt_number,
          status: after.draftQualityRuns.at(-1)?.status,
        };
      } catch (error) {
        return {
          accepted: false,
          error: String(error),
          unchanged:
            before ===
            JSON.stringify(w.__LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__()),
        };
      }
    }, scenario);
    expect(outcome.accepted).toBe(scenario.resume);
    if (scenario.resume) {
      expect(outcome.attempt).toBe(scenario.attempt + 1);
      expect(outcome.status).toBe("running");
    } else {
      expect(outcome.unchanged).toBe(true);
      expect(outcome.error).toContain(
        scenario.revision !== 1
          ? "Draft changed"
          : scenario.attempt === 3
            ? "exhausted"
            : "Recoverable failed",
      );
    }
  });
  test(`quality recovery controls: ${scenario.name}`, async ({ page }) => {
    await page.goto(componentServer.resolvedUrls!.local[0]);
    // Mount the real component through Vite, independently of read-model filtering.
    await page.evaluate(async (state) => {
      const reactPath = "/node_modules/.vite/deps/react.js";
      const domPath = "/node_modules/.vite/deps/react-dom_client.js";
      const panelPath =
        "/src/features/drafts/components/quality-scorecard-panel.tsx";
      const { default: React } = await import(reactPath);
      const {
        default: { createRoot },
      } = await import(domPath);
      const { QualityScorecardPanel } = await import(panelPath);
      const host = document.createElement("div");
      host.id = "recovery-fixture";
      document.body.append(host);
      createRoot(host).render(
        React.createElement(QualityScorecardPanel, {
          variant: {
            id: 1,
            content_revision: state.revision,
            aiAudit: {
              status: "completed",
              findings: [
                "hook",
                "specificity",
                "generic_language",
                "authenticity",
                "clarity",
                "safety",
              ].map((rule_key) => ({ rule_key, severity: "pass" })),
            },
            qualityScorecard: {
              run: {
                id: 7,
                draft_variant_id: 1,
                status: state.status,
                current_content_revision: 1,
                applied_rewrite_count: 0,
              },
              attempts: [{ attempt_number: state.attempt, categoryScores: [] }],
            },
          },
          pending: false,
          onResume: async (id: number) => {
            host.dataset.resumed = String(id);
          },
          onRun: async () => {
            host.dataset.started = "true";
          },
        }),
      );
    }, scenario);
    const panel = page.locator("#recovery-fixture");
    const resume = panel.getByRole("button", { name: "Resume quality loop" });
    if (scenario.resume) {
      await expect(resume).toBeEnabled();
      await resume.click();
      await expect(panel).toHaveAttribute("data-resumed", "7");
    } else {
      await expect(resume).toHaveCount(0);
      await expect(panel.getByText(/re-audit.*re-score/i)).toBeVisible();
      await panel
        .getByRole("button", { name: "Run quality loop", exact: true })
        .click();
      await panel.getByRole("button", { name: "Confirm and run" }).click();
      await expect(panel).toHaveAttribute("data-started", "true");
      await expect(panel).not.toHaveAttribute("data-resumed");
    }
  });
}

test("scored attempt renders native-shaped category scores in the scorecard", async ({
  page,
}) => {
  const variantId = await page.evaluate(
    async (categoryScores) => {
      const w = window as unknown as {
        __LINKGO_SQL_SEED_QUALITY_RECOVERY__: (
          status: string,
          attempt: number,
          stale: boolean,
        ) => Promise<{ qualityRunId: number; draftVariantId: number }>;
        __TAURI_INTERNALS__: {
          invoke: (
            command: string,
            args: unknown,
          ) => Promise<Record<string, number>>;
        };
      };
      const scope = await w.__LINKGO_SQL_SEED_QUALITY_RECOVERY__(
        "failed",
        1,
        false,
      );
      const claim = await w.__TAURI_INTERNALS__.invoke(
        "linkgo_draft_quality_resume",
        { input: scope },
      );
      await w.__TAURI_INTERNALS__.invoke("linkgo_draft_quality_apply_score", {
        input: {
          ...scope,
          attemptId: claim.attemptId,
          agentRunId: claim.agentRunId,
          contentRevision: 1,
          categoryScores,
          summary: "Scored for the scorecard breakdown.",
        },
      });
      return scope.draftVariantId;
    },
    settlement.categoryScores.map(
      (score: Record<string, unknown>, index: number) => ({
        ...score,
        score: 70 + index * 5,
      }),
    ),
  );

  await page.getByRole("button", { name: "Campaigns" }).click();
  await page.getByRole("button", { name: "Drafts" }).click();
  const panel = page.getByRole("region", { name: "Draft quality" }).filter({
    has: page.locator(`#quality-${variantId}-title`),
  });
  await expect(panel.getByText("Passed", { exact: true })).toBeVisible();
  const expected = [
    ["Hook strength", "70", "The hook is concrete."],
    ["Authenticity", "75", "The voice matches the supplied draft."],
    ["LinkedIn fit", "80", "The format fits the audience."],
    ["Specificity", "85", "The example is specific."],
    ["Narrative structure", "90", "The argument has a clear progression."],
  ] as const;
  const items = panel.getByRole("listitem");
  await expect(items).toHaveCount(expected.length);
  for (const [label, score, feedback] of expected) {
    const item = items.filter({ hasText: label });
    await expect(item).toContainText(score);
    await expect(item).toContainText(feedback);
  }
  // Native ORDER BY category_key ASC: authenticity, hook_strength, ...
  await expect(items.first()).toContainText("Authenticity");
});

test("quality panel stacks at 320px without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});
