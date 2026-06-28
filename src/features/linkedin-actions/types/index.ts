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
