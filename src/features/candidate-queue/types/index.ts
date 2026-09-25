import type { z } from "zod";
import type { AgentPlaybookKey } from "@/agent/playbooks";
import type { relevanceScoringContextSchema } from "@/features/candidate-queue/schemas";
import type { AgentProviderKey } from "@/agent/provider-catalog";

export type CandidateStatus = "new" | "shortlisted" | "rejected" | "drafted";
export type RelevanceScoringContext = z.infer<
  typeof relevanceScoringContextSchema
>;

export type CandidatePlatform = "linkedin";

/** Native pre-run context: seed keywords and default scoring candidates. */
export interface CandidateAgentRunContext {
  seedKeywords: string[];
  scoringCandidateIds: number[];
}

export type DedupeKeyType = "normalized_url" | "content_hash";

export interface TargetPost {
  id: number;
  platform: CandidatePlatform;
  url: string;
  normalized_url: string;
  platform_resource_urn: string;
  author_name: string;
  author_profile_url: string;
  posted_at: string | null;
  content: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CandidatePost {
  id: number;
  campaign_id: number;
  target_post_id: number;
  source_keyword: string;
  status: CandidateStatus;
  relevance_score: number | null;
  score_reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DedupeKey {
  id: number;
  campaign_id: number;
  key_type: DedupeKeyType;
  key_value: string;
  candidate_post_id: number;
  created_at: string;
}

export type CandidateWithTarget = CandidatePost & {
  target: TargetPost;
  campaign_name: string;
};

/** A capped candidate list; `totalCount` counts every match before the cap. */
export interface CandidateListPage {
  items: CandidateWithTarget[];
  totalCount: number;
}

export interface CreateCandidateInput {
  campaignId: number;
  url: string;
  content: string;
  authorName?: string;
  authorProfileUrl?: string;
  postedAt?: string | null;
  platformResourceUrn?: string;
  sourceKeyword?: string;
  relevanceScore?: number | null;
  scoreReason?: string;
  notes?: string;
}

export interface UpdateCandidateInput {
  id: number;
  status?: CandidateStatus;
  relevanceScore?: number | null;
  scoreReason?: string;
  notes?: string;
}

export type CandidateDiscoveryKind = "keyword" | "trend" | "source_prompt";

export type CandidateDiscoveryStatus = "suggested" | "promoted" | "dismissed";

export interface CandidateDiscoveryItem {
  id: number;
  campaign_id: number;
  agent_run_id: number | null;
  workflow_run_id: number | null;
  kind: CandidateDiscoveryKind;
  title: string;
  keyword: string;
  rationale: string;
  source_keyword: string;
  confidence_score: number | null;
  status: CandidateDiscoveryStatus;
  created_at: string;
  updated_at: string;
}

export interface RunCandidateDiscoveryInput {
  campaignId: number;
  seedKeywords?: string[];
  notes?: string;
  providerKey?: AgentProviderKey;
  modelName?: string;
  playbookKey?: AgentPlaybookKey | "";
}

export interface ScoreCandidatesInput {
  campaignId: number;
  candidatePostIds?: number[];
  minimumScore?: number;
  autoRejectBelowMinimum?: boolean;
  providerKey?: AgentProviderKey;
  modelName?: string;
  playbookKey?: AgentPlaybookKey | "";
}

export interface PromoteDiscoveryItemInput {
  id: number;
  campaignId: number;
}

export interface DismissDiscoveryItemInput {
  id: number;
  campaignId: number;
}
