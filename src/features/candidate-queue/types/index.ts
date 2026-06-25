export type CandidateStatus = "new" | "shortlisted" | "rejected" | "drafted";

export type CandidatePlatform = "linkedin";

export type DedupeKeyType = "normalized_url" | "content_hash";

export interface TargetPost {
  id: number;
  platform: CandidatePlatform;
  url: string;
  normalized_url: string;
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

export interface CreateCandidateInput {
  campaignId: number;
  url: string;
  content: string;
  authorName?: string;
  authorProfileUrl?: string;
  postedAt?: string | null;
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
