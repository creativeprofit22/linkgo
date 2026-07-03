export interface LinkedInPublishPostInput {
  approvalId: number;
  scheduleJobId?: number | undefined;
  commentary: string;
  idempotencyKey: string;
}

export interface LinkedInPublishPostResult {
  platformPostId: string;
  externalPostUrl: string;
}

export interface LinkedInPublishCommentInput {
  commentThreadId: number;
  commentary: string;
  targetUrn: string;
  idempotencyKey: string;
}

export interface LinkedInPublishCommentResult {
  platformCommentId: string;
  platformCommentUrn: string;
  externalCommentUrl: string;
}
