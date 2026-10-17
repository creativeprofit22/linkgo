import { expect, test } from "@playwright/test";

import {
  PATTERN_MIN_POSTS,
  classifyFormat,
  classifyOpening,
  computeResultPatterns,
  latestResultPerPost,
  patternLessonEvidence,
  patternLessonSummary,
  timeOfDay,
  type PatternMetricInput,
} from "../src/features/metrics/patterns";
import type {
  ResultPattern,
  ResultPatternDimension,
} from "../src/features/metrics/types";

const UTC = { timeZone: "UTC" };

interface PostSpec {
  approval: number;
  engagement: number;
  hook?: string;
  body?: string;
  /** SQLite UTC text, e.g. "2026-09-01 09:00:00" (a Tuesday). */
  publishedAt?: string | null;
  measuredAt?: string;
  id?: number;
}

function post(spec: PostSpec): PatternMetricInput {
  return {
    id: spec.id ?? spec.approval,
    approval_id: spec.approval,
    measured_at: spec.measuredAt ?? "2026-09-10T09:00",
    reactions: spec.engagement,
    comments: 0,
    reposts: 0,
    variant: {
      hook: spec.hook ?? "A plain statement",
      body: spec.body ?? "Short body.",
    },
    latestPublishAttempt:
      spec.publishedAt === null
        ? null
        : { created_at: spec.publishedAt ?? "2026-09-01 09:00:00" },
  };
}

function patternOf(
  metrics: PatternMetricInput[],
  dimension: ResultPatternDimension,
  timeZone = "UTC",
): ResultPattern {
  const found = computeResultPatterns(metrics, { timeZone }).patterns.find(
    (pattern) => pattern.dimension === dimension,
  );
  if (!found) throw new Error(`missing ${dimension}`);
  return found;
}

test.describe("classifiers", () => {
  const openings: Array<[string, string]> = [
    ["Why do launches stall?", "question"],
    ["3 ways to cut onboarding", "number"],
    ["How we shipped in a week", "how-to"],
    ["I learned this the hard way", "personal"],
    ["We cut churn", "personal"],
    ["Pricing is a product decision", "statement"],
    ["", "statement"],
    // Order matters: a question with a number is still a question.
    ["Is 2026 the year?", "question"],
  ];
  for (const [hook, expected] of openings) {
    test(`opening "${hook}" → ${expected}`, () => {
      expect(classifyOpening(hook)).toBe(expected);
    });
  }

  test("format: list, short, longer", () => {
    expect(classifyFormat("Intro\n- one\n- two\n- three")).toBe("list");
    expect(classifyFormat("1. a\n2) b\n3. c")).toBe("list");
    expect(classifyFormat("- one\n- two")).toBe("short");
    expect(classifyFormat("word ".repeat(120))).toBe("short");
    expect(classifyFormat("word ".repeat(121))).toBe("longer");
  });

  const hours: Array<[number, string]> = [
    [4, "night"],
    [5, "morning"],
    [10, "morning"],
    [11, "midday"],
    [14, "afternoon"],
    [17, "evening"],
    [21, "evening"],
    [22, "night"],
  ];
  for (const [hour, expected] of hours) {
    test(`hour ${hour} → ${expected}`, () => {
      expect(timeOfDay(hour)).toBe(expected);
    });
  }
});

test("thin data makes no claim and reports the sample size", () => {
  const metrics = [
    post({ approval: 1, engagement: 50, hook: "Why?" }),
    post({ approval: 2, engagement: 40, hook: "Why not?" }),
    post({ approval: 3, engagement: 1 }),
  ];
  const report = computeResultPatterns(metrics, UTC);
  expect(report.sampleSize).toBe(3);
  for (const pattern of report.patterns) {
    expect(pattern).toMatchObject({
      kind: "thin",
      reason: "few-posts",
      sampleSize: 3,
      neededPosts: PATTERN_MIN_POSTS,
    });
  }
});

test("questions clearly beat statements → found, with lesson wording", () => {
  const metrics = [
    post({ approval: 1, engagement: 30, hook: "Why?" }),
    post({ approval: 2, engagement: 20, hook: "What now?" }),
    post({ approval: 3, engagement: 10 }),
    post({ approval: 4, engagement: 10 }),
    post({ approval: 5, engagement: 10 }),
  ];
  const pattern = patternOf(metrics, "opening");
  expect(pattern.kind).toBe("found");
  if (pattern.kind !== "found") return;
  expect(pattern.best).toEqual({
    key: "question",
    label: "Opens with a question",
    postCount: 2,
    averageEngagement: 25,
  });
  expect(pattern.runnerUp.key).toBe("statement");
  expect(pattern.sampleSize).toBe(5);
  expect(patternLessonSummary(pattern)).toBe("Open with a question");
  expect(patternLessonEvidence(pattern)).toContain("Based on 5 measured posts");
});

test("a lift under 1.2× is no difference", () => {
  const metrics = [
    post({ approval: 1, engagement: 11, hook: "Why?" }),
    post({ approval: 2, engagement: 11, hook: "What?" }),
    post({ approval: 3, engagement: 10 }),
    post({ approval: 4, engagement: 10 }),
    post({ approval: 5, engagement: 10 }),
  ];
  expect(patternOf(metrics, "opening").kind).toBe("no-difference");
});

test("single-post groups are ignored", () => {
  // One huge question post cannot make a pattern on its own.
  const metrics = [
    post({ approval: 1, engagement: 500, hook: "Why?" }),
    post({ approval: 2, engagement: 10 }),
    post({ approval: 3, engagement: 10 }),
    post({ approval: 4, engagement: 10 }),
    post({ approval: 5, engagement: 10 }),
  ];
  expect(patternOf(metrics, "opening")).toMatchObject({
    kind: "thin",
    reason: "one-kind",
    sampleSize: 5,
  });
});

test("each post counts once, using its latest result", () => {
  const metrics = [
    post({
      approval: 1,
      engagement: 1,
      hook: "Why?",
      measuredAt: "2026-09-02T09:00",
      id: 10,
    }),
    post({
      approval: 1,
      engagement: 40,
      hook: "Why?",
      measuredAt: "2026-09-05T09:00",
      id: 11,
    }),
    post({ approval: 2, engagement: 40, hook: "How?" }),
    post({ approval: 3, engagement: 10 }),
    post({ approval: 4, engagement: 10 }),
    post({ approval: 5, engagement: 10 }),
  ];
  expect(latestResultPerPost(metrics).map((metric) => metric.id)).toEqual([
    11, 2, 3, 4, 5,
  ]);
  const report = computeResultPatterns(metrics, UTC);
  expect(report.sampleSize).toBe(5);
  const opening = report.patterns.find((p) => p.dimension === "opening");
  expect(opening).toMatchObject({
    kind: "found",
    best: { averageEngagement: 40 },
  });
});

test("weekday and time of day are bucketed in the given time zone", () => {
  // 2026-09-01 is a Tuesday; 01:00 UTC is 21:00 Monday in New York (EDT).
  const metrics = [
    post({ approval: 1, engagement: 30, publishedAt: "2026-09-01 01:00:00" }),
    post({ approval: 2, engagement: 30, publishedAt: "2026-09-08 01:30:00" }),
    post({ approval: 3, engagement: 5, publishedAt: "2026-09-03 15:00:00" }),
    post({ approval: 4, engagement: 5, publishedAt: "2026-09-10 15:00:00" }),
    post({ approval: 5, engagement: 5, publishedAt: "2026-09-17 15:00:00" }),
  ];
  const utc = patternOf(metrics, "weekday", "UTC");
  const newYork = patternOf(metrics, "weekday", "America/New_York");
  expect(utc).toMatchObject({ kind: "found", best: { key: "Tuesday" } });
  expect(newYork).toMatchObject({ kind: "found", best: { key: "Monday" } });
  if (newYork.kind === "found") {
    expect(patternLessonSummary(newYork)).toBe("Post on Mondays");
  }
  expect(patternOf(metrics, "timeOfDay", "UTC")).toMatchObject({
    kind: "found",
    best: { key: "night" },
  });
  expect(patternOf(metrics, "timeOfDay", "America/New_York")).toMatchObject({
    kind: "found",
    best: { key: "evening" },
  });
});

test("posts without a publish time are left out of day/time only", () => {
  const metrics = [1, 2, 3, 4, 5].map((approval) =>
    post({
      approval,
      engagement: 10,
      ...(approval === 5 ? { publishedAt: null } : {}),
    }),
  );
  expect(patternOf(metrics, "weekday").sampleSize).toBe(4);
  expect(patternOf(metrics, "format").sampleSize).toBe(5);
});

test("results are deterministic regardless of input order", () => {
  const metrics = [
    post({ approval: 1, engagement: 30, hook: "Why?" }),
    post({ approval: 2, engagement: 20, hook: "What now?" }),
    post({ approval: 3, engagement: 10 }),
    post({ approval: 4, engagement: 10 }),
    post({ approval: 5, engagement: 10 }),
  ];
  expect(computeResultPatterns([...metrics].reverse(), UTC)).toEqual(
    computeResultPatterns(metrics, UTC),
  );
});
