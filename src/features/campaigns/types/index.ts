export type CampaignStatus = "draft" | "active" | "paused" | "archived";

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export type CampaignKeywordSource = "manual" | "generated" | "learned";

export interface Campaign {
  id: number;
  name: string;
  product: string;
  audience: string;
  voice: string;
  tone: string;
  auto_pilot: number;
  status: CampaignStatus;
  daily_post_limit: number;
  daily_comment_limit: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignKeyword {
  id: number;
  campaign_id: number;
  keyword: string;
  source: CampaignKeywordSource;
  created_at: string;
}

export interface CampaignWithKeywords extends Campaign {
  keywords: CampaignKeyword[];
}

export interface CreateCampaignInput {
  name: string;
  product?: string;
  audience?: string;
  voice?: string;
  tone?: string;
  autoPilot?: boolean;
  dailyPostLimit?: number;
  dailyCommentLimit?: number;
  keywords?: string[];
}

export interface UpdateCampaignInput {
  id: number;
  name?: string;
  product?: string;
  audience?: string;
  voice?: string;
  tone?: string;
  autoPilot?: boolean;
  status?: CampaignStatus;
  dailyPostLimit?: number;
  dailyCommentLimit?: number;
  keywords?: string[];
}

/** Link params for Campaigns; `new=1` opens New campaign pre-filled. */
export type CampaignsRouteParams = {
  new?: "1" | undefined;
};
