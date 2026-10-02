import { z } from "zod";

export const DEFAULT_MAX_POST_AGE_DAYS = 30;
export const MIN_MAX_POST_AGE_DAYS = 1;
export const MAX_MAX_POST_AGE_DAYS = 365;
export const MAX_BANNED_TOPICS = 25;
export const MAX_BANNED_TOPIC_LENGTH = 80;

export function normalizeBannedTopic(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
}

export const candidatePolicyRuleKeySchema = z.enum([
  "source",
  "age",
  "banned_topic",
  "already_contacted",
]);

export const bannedTopicSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(
    z
      .string()
      .min(1, "Remove the empty lines from blocked topics")
      .max(
        MAX_BANNED_TOPIC_LENGTH,
        `Each blocked topic can be up to ${MAX_BANNED_TOPIC_LENGTH} characters`,
      ),
  );

export const candidateIntakePolicyCampaignIdSchema = z
  .number()
  .int()
  .positive();

/** Native result of `linkgo_candidate_policy_update`. */
export const candidateIntakePolicyResultSchema = z
  .object({
    campaign_id: candidateIntakePolicyCampaignIdSchema,
    max_post_age_days: z
      .number()
      .int()
      .min(MIN_MAX_POST_AGE_DAYS)
      .max(MAX_MAX_POST_AGE_DAYS),
    banned_topics: z.array(z.string()).max(MAX_BANNED_TOPICS),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .strict();

export const updateCandidateIntakePolicySchema = z
  .object({
    campaignId: candidateIntakePolicyCampaignIdSchema,
    maxPostAgeDays: z
      .number()
      .int("Use a whole number of days")
      .min(
        MIN_MAX_POST_AGE_DAYS,
        `Choose at least ${MIN_MAX_POST_AGE_DAYS} day`,
      )
      .max(
        MAX_MAX_POST_AGE_DAYS,
        `Choose ${MAX_MAX_POST_AGE_DAYS} days or fewer`,
      ),
    bannedTopics: z
      .array(bannedTopicSchema)
      .max(
        MAX_BANNED_TOPICS,
        `Add no more than ${MAX_BANNED_TOPICS} blocked topics`,
      ),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.bannedTopics.forEach((topic, index) => {
      const normalized = normalizeBannedTopic(topic);
      if (seen.has(normalized)) {
        context.addIssue({
          code: "custom",
          path: ["bannedTopics", index],
          message: `This topic is listed twice: ${topic}`,
        });
      }
      seen.add(normalized);
    });
  });
