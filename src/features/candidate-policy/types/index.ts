export type CandidatePolicyRuleKey =
  | "source"
  | "age"
  | "banned_topic"
  | "already_contacted";

export interface CandidateIntakePolicy {
  campaign_id: number;
  max_post_age_days: number;
  banned_topics: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface UpdateCandidateIntakePolicyInput {
  campaignId: number;
  maxPostAgeDays: number;
  bannedTopics: string[];
}
