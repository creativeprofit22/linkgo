import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  candidateIntakePolicyCampaignIdSchema,
  DEFAULT_MAX_POST_AGE_DAYS,
  normalizeBannedTopic,
  updateCandidateIntakePolicySchema,
} from "@/features/candidate-policy/schemas";
import type {
  CandidateIntakePolicy,
  CandidatePolicyDecision,
  CandidatePolicyFinding,
  CandidatePolicySubject,
  UpdateCandidateIntakePolicyInput,
} from "@/features/candidate-policy/types";

interface PolicyRow {
  campaign_id: number;
  max_post_age_days: number;
  created_at: string;
  updated_at: string;
}

interface TopicRow {
  topic: string;
  normalized_topic: string;
}

interface CampaignMutationRow {
  status: "draft" | "active" | "paused" | "archived";
}

interface SuccessfulContactRow {
  normalized_url: string;
  platform_resource_urn: string;
  author_profile_url: string;
}

const MAX_FINDING_MESSAGE_LENGTH = 300;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const ABSOLUTE_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/u;

function boundedFinding(
  ruleKey: CandidatePolicyFinding["ruleKey"],
  message: string,
): CandidatePolicyFinding {
  return { ruleKey, message: message.slice(0, MAX_FINDING_MESSAGE_LENGTH) };
}

async function loadPolicy(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<CandidateIntakePolicy> {
  const rows = await db.select<PolicyRow[]>(
    `SELECT * FROM candidate_intake_policies WHERE campaign_id = $1 LIMIT 1`,
    [campaignId],
  );
  const topicRows = await db.select<TopicRow[]>(
    `SELECT topic, normalized_topic FROM candidate_policy_banned_topics
     WHERE campaign_id = $1 ORDER BY id ASC`,
    [campaignId],
  );
  const policy = rows[0];
  return {
    campaign_id: campaignId,
    max_post_age_days: policy?.max_post_age_days ?? DEFAULT_MAX_POST_AGE_DAYS,
    banned_topics: topicRows.map((row) => row.topic),
    created_at: policy?.created_at ?? null,
    updated_at: policy?.updated_at ?? null,
  };
}

export async function getCandidateIntakePolicy(
  campaignId: number,
): Promise<CandidateIntakePolicy> {
  const parsedCampaignId =
    candidateIntakePolicyCampaignIdSchema.parse(campaignId);
  const db = await getDb();
  return loadPolicy(db, parsedCampaignId);
}

async function rollbackTransaction(db: LinkgoDatabase): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original mutation failure.
  }
}

export async function updateCandidateIntakePolicy(
  input: UpdateCandidateIntakePolicyInput,
): Promise<CandidateIntakePolicy> {
  const parsed = updateCandidateIntakePolicySchema.parse(input);
  const db = await getDb();
  await db.execute("BEGIN TRANSACTION");
  try {
    const campaigns = await db.select<CampaignMutationRow[]>(
      `SELECT status FROM campaigns WHERE id = $1 LIMIT 1`,
      [parsed.campaignId],
    );
    const campaign = campaigns[0];
    if (campaign === undefined) throw new Error("Campaign was not found");
    if (campaign.status === "archived") throw new Error("Campaign is archived");

    await db.execute(
      `INSERT INTO candidate_intake_policies
       (campaign_id, max_post_age_days, updated_at)
       VALUES ($1, $2, datetime('now'))
       ON CONFLICT(campaign_id) DO UPDATE SET
         max_post_age_days = excluded.max_post_age_days,
         updated_at = datetime('now')`,
      [parsed.campaignId, parsed.maxPostAgeDays],
    );
    await db.execute(
      `DELETE FROM candidate_policy_banned_topics WHERE campaign_id = $1`,
      [parsed.campaignId],
    );
    for (const topic of parsed.bannedTopics) {
      await db.execute(
        `INSERT INTO candidate_policy_banned_topics
         (campaign_id, topic, normalized_topic) VALUES ($1, $2, $3)`,
        [parsed.campaignId, topic, normalizeBannedTopic(topic)],
      );
    }
    const savedPolicy = await loadPolicy(db, parsed.campaignId);
    await db.execute("COMMIT");
    return savedPolicy;
  } catch (error) {
    await rollbackTransaction(db);
    throw error;
  }
}

function isAllowedLinkedInUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com"))
    );
  } catch {
    return false;
  }
}

function parseAbsoluteTimestamp(value: string | null | undefined): Date | null {
  const trimmed = value?.trim() ?? "";
  const match = ABSOLUTE_TIMESTAMP_PATTERN.exec(trimmed);
  if (match === null) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    daysInMonth === undefined ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const timestamp = new Date(trimmed);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function containsNormalizedTopic(text: string, topic: string): boolean {
  const normalizedText = text.normalize("NFKC").toLocaleLowerCase();
  const normalizedTopic = normalizeBannedTopic(topic);
  if (!normalizedTopic) return false;
  const phrasePattern = escapeRegularExpression(normalizedTopic).replace(
    /\s+/gu,
    "\\s+",
  );
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${phrasePattern}(?=$|[^\\p{L}\\p{N}])`,
    "u",
  ).test(normalizedText);
}

function normalizeProfileUrl(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol.toLocaleLowerCase();
    url.hostname = url.hostname.toLocaleLowerCase();
    url.hash = "";
    url.search = "";
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/u, "");
    }
    return url.toString();
  } catch {
    return trimmed.toLocaleLowerCase();
  }
}

async function wasAlreadyContacted(
  db: LinkgoDatabase,
  subject: CandidatePolicySubject,
): Promise<boolean> {
  const normalizedProfile = normalizeProfileUrl(
    subject.authorProfileUrl ?? subject.normalizedAuthorProfileUrl,
  );
  const platformUrn = subject.platformResourceUrn?.trim() ?? "";
  const contacts = await db.select<SuccessfulContactRow[]>(
    `SELECT tp.normalized_url, tp.platform_resource_urn, tp.author_profile_url
     FROM comment_attempts ca
     INNER JOIN comment_threads ct ON ct.id = ca.comment_thread_id
     INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
     INNER JOIN target_posts tp ON tp.id = cp.target_post_id
     WHERE ca.status = 'succeeded'
       AND (
         tp.normalized_url = $1
         OR ($2 <> '' AND tp.platform_resource_urn = $2)
         OR ($3 <> '' AND TRIM(tp.author_profile_url) <> '')
       )`,
    [subject.normalizedUrl, platformUrn, normalizedProfile],
  );
  return contacts.some(
    (contact) =>
      contact.normalized_url === subject.normalizedUrl ||
      (platformUrn !== "" && contact.platform_resource_urn === platformUrn) ||
      (normalizedProfile !== "" &&
        normalizeProfileUrl(contact.author_profile_url) === normalizedProfile),
  );
}

export async function evaluateCandidateIntakePolicy(
  db: LinkgoDatabase,
  subject: CandidatePolicySubject,
  now = new Date(),
): Promise<CandidatePolicyDecision> {
  const policy = await loadPolicy(db, subject.campaignId);
  const findings: CandidatePolicyFinding[] = [];

  if (!isAllowedLinkedInUrl(subject.url)) {
    findings.push(
      boundedFinding(
        "source",
        "Source must be an HTTPS linkedin.com URL or LinkedIn subdomain.",
      ),
    );
  }

  const postedAt = parseAbsoluteTimestamp(subject.postedAt);
  if (postedAt === null) {
    findings.push(
      boundedFinding(
        "age",
        "Post timestamp must be an absolute ISO-8601 value with a timezone.",
      ),
    );
  } else {
    const ageMs = now.getTime() - postedAt.getTime();
    if (ageMs < -FUTURE_TOLERANCE_MS) {
      findings.push(
        boundedFinding("age", "Post timestamp is materially in the future."),
      );
    } else if (ageMs > policy.max_post_age_days * 24 * 60 * 60 * 1000) {
      findings.push(
        boundedFinding(
          "age",
          `Post is older than the ${policy.max_post_age_days}-day campaign limit.`,
        ),
      );
    }
  }

  const searchableText = [subject.content, subject.sourceKeyword ?? ""].join(
    "\n",
  );
  const matchedTopics = policy.banned_topics.filter((topic) =>
    containsNormalizedTopic(searchableText, topic),
  );
  if (matchedTopics.length > 0) {
    findings.push(
      boundedFinding(
        "banned_topic",
        `Post matches banned topic: ${matchedTopics.join(", ")}.`,
      ),
    );
  }

  if (await wasAlreadyContacted(db, subject)) {
    findings.push(
      boundedFinding(
        "already_contacted",
        "A successful Linkgo comment already contacted this target or author profile.",
      ),
    );
  }

  return {
    accepted: findings.length === 0,
    primaryRuleKey: findings[0]?.ruleKey ?? null,
    findings,
  };
}
