/**
 * Pure result-pattern analysis: which openings, formats, days and times did
 * better, computed only from the user's own recorded results. No I/O, no UI,
 * no agent imports; Playwright specs import this file directly.
 *
 * Metric: average reactions + comments + reposts per post, using each post's
 * latest result (works for LinkedIn snapshots, which carry no impressions).
 */
import type {
  ResultPattern,
  ResultPatternDimension,
  ResultPatternGroup,
  ResultPatternsReport,
} from "./types";

/** Fewest measured posts before any pattern is claimed. */
export const PATTERN_MIN_POSTS = 5;
/** Fewest posts a group needs to be compared at all. */
export const PATTERN_MIN_GROUP_POSTS = 2;
/** The best group must beat the runner-up by this factor. */
export const PATTERN_MIN_LIFT = 1.2;

const DIMENSIONS: readonly ResultPatternDimension[] = [
  "opening",
  "format",
  "weekday",
  "timeOfDay",
];

/** The fields pattern analysis reads; `PostMetricWithDetails` satisfies it. */
export interface PatternMetricInput {
  id: number;
  approval_id: number;
  measured_at: string;
  reactions: number;
  comments: number;
  reposts: number;
  variant: { hook: string; body: string };
  latestPublishAttempt: { created_at: string } | null;
}

export type OpeningKind =
  | "question"
  | "number"
  | "how-to"
  | "personal"
  | "statement";
export type FormatKind = "list" | "short" | "longer";
export type TimeOfDay =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

const OPENING_LABELS: Record<OpeningKind, string> = {
  question: "Opens with a question",
  number: "Opens with a number",
  "how-to": "Opens with a how-to",
  personal: "Opens with a personal line",
  statement: "Opens with a plain statement",
};
const OPENING_LESSONS: Record<OpeningKind, string> = {
  question: "Open with a question",
  number: "Open with a number",
  "how-to": "Open with a how-to",
  personal: "Open with a personal line",
  statement: "Open with a plain statement",
};
const FORMAT_LABELS: Record<FormatKind, string> = {
  list: "List posts",
  short: "Short posts",
  longer: "Longer posts",
};
const FORMAT_LESSONS: Record<FormatKind, string> = {
  list: "Use a short list",
  short: "Keep posts short",
  longer: "Write longer posts",
};
const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: "Morning (5–11)",
  midday: "Midday (11–14)",
  afternoon: "Afternoon (14–17)",
  evening: "Evening (17–22)",
  night: "Night (22–5)",
};
const TIME_LESSONS: Record<TimeOfDay, string> = {
  morning: "Post in the morning",
  midday: "Post around midday",
  afternoon: "Post in the afternoon",
  evening: "Post in the evening",
  night: "Post at night",
};
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const SHORT_POST_MAX_WORDS = 120;
const LIST_MIN_LINES = 3;
const LIST_LINE = /^\s*(?:[-*•–]|\d+[.)])\s+\S/;

/** Checked in order: question → number → how-to → personal → statement. */
export function classifyOpening(hook: string): OpeningKind {
  const text = hook.trim();
  if (text.includes("?")) return "question";
  if (/\d/.test(text)) return "number";
  if (/^how\b/i.test(text)) return "how-to";
  if (/^(?:i|my|we)\b/i.test(text)) return "personal";
  return "statement";
}

export function classifyFormat(body: string): FormatKind {
  const lines = body.split(/\r?\n/);
  if (lines.filter((line) => LIST_LINE.test(line)).length >= LIST_MIN_LINES) {
    return "list";
  }
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return words <= SHORT_POST_MAX_WORDS ? "short" : "longer";
}

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** SQLite `datetime('now')` text is UTC without a zone marker. */
export function parseStoredUtc(value: string): Date | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  const time = Date.parse(zoned);
  return Number.isNaN(time) ? null : new Date(time);
}

function localParts(
  date: Date,
  timeZone: string,
): { weekday: string; hour: number } | null {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      hour: "numeric",
      hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "long",
      hour: "numeric",
      hourCycle: "h23",
    });
  }
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  if (weekday === undefined || !Number.isInteger(hour)) return null;
  return { weekday, hour: hour % 24 };
}

function measuredTime(metric: PatternMetricInput): number {
  return (
    parseStoredUtc(metric.measured_at)?.getTime() ?? Number.NEGATIVE_INFINITY
  );
}

/** Keeps each post's latest result (newest `measured_at`, then highest id). */
export function latestResultPerPost<T extends PatternMetricInput>(
  metrics: readonly T[],
): T[] {
  const latest = new Map<number, T>();
  for (const metric of metrics) {
    const current = latest.get(metric.approval_id);
    if (
      current === undefined ||
      measuredTime(metric) > measuredTime(current) ||
      (measuredTime(metric) === measuredTime(current) && metric.id > current.id)
    ) {
      latest.set(metric.approval_id, metric);
    }
  }
  return [...latest.values()].sort((a, b) => a.approval_id - b.approval_id);
}

interface Bucketed {
  key: string;
  label: string;
  engagement: number;
}

function bucket(
  dimension: ResultPatternDimension,
  metric: PatternMetricInput,
  timeZone: string,
): Bucketed | null {
  const engagement = metric.reactions + metric.comments + metric.reposts;
  switch (dimension) {
    case "opening": {
      const firstBodyLine =
        metric.variant.body.split(/\r?\n/).find((line) => line.trim() !== "") ??
        "";
      const hook =
        metric.variant.hook.trim() === "" ? firstBodyLine : metric.variant.hook;
      const key = classifyOpening(hook);
      return { key, label: OPENING_LABELS[key], engagement };
    }
    case "format": {
      const key = classifyFormat(metric.variant.body);
      return { key, label: FORMAT_LABELS[key], engagement };
    }
    case "weekday":
    case "timeOfDay": {
      const published = metric.latestPublishAttempt
        ? parseStoredUtc(metric.latestPublishAttempt.created_at)
        : null;
      if (published === null) return null;
      const parts = localParts(published, timeZone);
      if (parts === null) return null;
      if (dimension === "weekday") {
        return { key: parts.weekday, label: parts.weekday, engagement };
      }
      const key = timeOfDay(parts.hour);
      return { key, label: TIME_LABELS[key], engagement };
    }
  }
}

function compareGroups(a: ResultPatternGroup, b: ResultPatternGroup): number {
  if (b.averageEngagement !== a.averageEngagement) {
    return b.averageEngagement - a.averageEngagement;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function patternFor(
  dimension: ResultPatternDimension,
  posts: readonly PatternMetricInput[],
  timeZone: string,
): ResultPattern {
  const buckets = posts
    .map((post) => bucket(dimension, post, timeZone))
    .filter((value): value is Bucketed => value !== null);
  const sampleSize = buckets.length;
  if (sampleSize < PATTERN_MIN_POSTS) {
    return {
      kind: "thin",
      dimension,
      sampleSize,
      neededPosts: PATTERN_MIN_POSTS,
      reason: "few-posts",
    };
  }
  const totals = new Map<
    string,
    { label: string; count: number; sum: number }
  >();
  for (const item of buckets) {
    const total = totals.get(item.key) ?? {
      label: item.label,
      count: 0,
      sum: 0,
    };
    total.count += 1;
    total.sum += item.engagement;
    totals.set(item.key, total);
  }
  const groups = [...totals.entries()]
    .map(([key, total]) => ({
      key,
      label: total.label,
      postCount: total.count,
      averageEngagement: total.sum / total.count,
    }))
    .filter((group) => group.postCount >= PATTERN_MIN_GROUP_POSTS)
    .sort(compareGroups);
  const [best, runnerUp] = groups;
  if (best === undefined || runnerUp === undefined) {
    return {
      kind: "thin",
      dimension,
      sampleSize,
      neededPosts: PATTERN_MIN_POSTS,
      reason: "one-kind",
    };
  }
  const clearlyBetter =
    best.averageEngagement > 0 &&
    best.averageEngagement >= runnerUp.averageEngagement * PATTERN_MIN_LIFT;
  return clearlyBetter
    ? { kind: "found", dimension, sampleSize, best, runnerUp, groups }
    : { kind: "no-difference", dimension, sampleSize, groups };
}

/**
 * Compares the user's measured posts by opening, format, weekday and time of
 * day. Publish times are stored in UTC and bucketed in `timeZone`.
 */
export function computeResultPatterns(
  metrics: readonly PatternMetricInput[],
  options: { timeZone: string },
): ResultPatternsReport {
  const posts = latestResultPerPost(metrics);
  return {
    sampleSize: posts.length,
    patterns: DIMENSIONS.map((dimension) =>
      patternFor(dimension, posts, options.timeZone),
    ),
  };
}

function lookup(
  labels: Readonly<Record<string, string>>,
  key: string,
  fallback: string,
): string {
  return Object.prototype.hasOwnProperty.call(labels, key)
    ? (labels[key] ?? fallback)
    : fallback;
}

/** Plain lesson wording for a found pattern, e.g. "Open with a question". */
export function patternLessonSummary(
  pattern: Extract<ResultPattern, { kind: "found" }>,
): string {
  const { key, label } = pattern.best;
  switch (pattern.dimension) {
    case "opening":
      return lookup(OPENING_LESSONS, key, label);
    case "format":
      return lookup(FORMAT_LESSONS, key, label);
    case "weekday":
      return WEEKDAYS.some((day) => day === key) ? `Post on ${key}s` : label;
    case "timeOfDay":
      return lookup(TIME_LESSONS, key, label);
  }
}

export function formatAverage(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** Evidence text saved with a lesson so it can be traced to the numbers. */
export function patternLessonEvidence(
  pattern: Extract<ResultPattern, { kind: "found" }>,
): string {
  const { best, runnerUp, sampleSize } = pattern;
  return `${best.label}: ${formatAverage(best.averageEngagement)} average reactions, comments and reposts (${best.postCount} posts) vs ${formatAverage(runnerUp.averageEngagement)} for ${runnerUp.label.toLowerCase()} (${runnerUp.postCount} posts). Based on ${sampleSize} measured posts.`;
}
