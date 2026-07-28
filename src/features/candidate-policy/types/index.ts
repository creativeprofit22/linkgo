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

export interface CandidatePolicyFinding {
  ruleKey: CandidatePolicyRuleKey;
  message: string;
}

export interface CandidatePolicyDecision {
  accepted: boolean;
  primaryRuleKey: CandidatePolicyRuleKey | null;
  findings: CandidatePolicyFinding[];
}

export interface CandidatePolicySubject {
  campaignId: number;
  url: string;
  normalizedUrl: string;
  authorProfileUrl?: string;
  normalizedAuthorProfileUrl?: string;
  platformResourceUrn?: string;
  postedAt?: string | null;
  content: string;
  sourceKeyword?: string;
}

export interface UpdateCandidateIntakePolicyInput {
  campaignId: number;
  maxPostAgeDays: number;
  bannedTopics: string[];
}
