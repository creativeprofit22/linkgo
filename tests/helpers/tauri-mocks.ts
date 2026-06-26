import type { Page } from "@playwright/test";

export async function setupTauriMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Campaign = {
      id: number;
      name: string;
      product: string;
      audience: string;
      voice: string;
      tone: string;
      auto_pilot: number;
      status: "draft" | "active" | "paused" | "archived";
      daily_post_limit: number;
      daily_comment_limit: number;
      created_at: string;
      updated_at: string;
    };

    type Keyword = {
      id: number;
      campaign_id: number;
      keyword: string;
      source: "manual" | "generated" | "learned";
      created_at: string;
    };

    type TargetPost = {
      id: number;
      platform: "linkedin";
      url: string;
      normalized_url: string;
      author_name: string;
      author_profile_url: string;
      posted_at: string | null;
      content: string;
      content_hash: string;
      created_at: string;
      updated_at: string;
    };

    type CandidateStatus = "new" | "shortlisted" | "rejected" | "drafted";

    type CandidatePost = {
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
    };

    type DedupeKey = {
      id: number;
      campaign_id: number;
      key_type: "normalized_url" | "content_hash";
      key_value: string;
      candidate_post_id: number;
      created_at: string;
    };

    type DraftStatus =
      | "drafting"
      | "needs_revision"
      | "ready_for_review"
      | "archived";

    type DraftVariantStatus = "draft" | "selected" | "rejected";

    type DraftAuditSeverity = "pass" | "warning" | "block";

    type Draft = {
      id: number;
      campaign_id: number;
      candidate_post_id: number;
      angle: string;
      notes: string;
      status: DraftStatus;
      created_at: string;
      updated_at: string;
    };

    type DraftVariant = {
      id: number;
      draft_id: number;
      variant_number: number;
      hook: string;
      body: string;
      cta: string;
      hashtags: string;
      status: DraftVariantStatus;
      created_at: string;
      updated_at: string;
    };

    type DraftAudit = {
      id: number;
      draft_variant_id: number;
      rule_key: string;
      severity: DraftAuditSeverity;
      message: string;
      created_at: string;
    };

    type ApprovalStatus =
      | "needs_review"
      | "changes_requested"
      | "approved"
      | "rejected"
      | "scheduled"
      | "published"
      | "cancelled";

    type ScheduleJobStatus = "scheduled" | "cancelled" | "completed" | "failed";

    type PublishAttemptStatus = "succeeded" | "failed";

    type Approval = {
      id: number;
      campaign_id: number;
      draft_id: number;
      draft_variant_id: number;
      status: ApprovalStatus;
      reviewer_notes: string;
      approved_at: string | null;
      rejected_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type ScheduleJob = {
      id: number;
      approval_id: number;
      platform: "linkedin";
      scheduled_for: string;
      timezone: string;
      status: ScheduleJobStatus;
      idempotency_key: string;
      created_at: string;
      updated_at: string;
    };

    type PublishAttempt = {
      id: number;
      approval_id: number;
      schedule_job_id: number | null;
      platform: "linkedin";
      status: PublishAttemptStatus;
      external_post_url: string;
      platform_post_id: string;
      error_message: string;
      created_at: string;
    };

    type TransactionSnapshot = {
      campaigns: Campaign[];
      keywords: Keyword[];
      targetPosts: TargetPost[];
      candidatePosts: CandidatePost[];
      dedupeKeys: DedupeKey[];
      drafts: Draft[];
      draftVariants: DraftVariant[];
      draftAudits: DraftAudit[];
      approvals: Approval[];
      scheduleJobs: ScheduleJob[];
      publishAttempts: PublishAttempt[];
      nextCampaignId: number;
      nextKeywordId: number;
      nextTargetPostId: number;
      nextCandidatePostId: number;
      nextDedupeKeyId: number;
      nextDraftId: number;
      nextDraftVariantId: number;
      nextDraftAuditId: number;
      nextApprovalId: number;
      nextScheduleJobId: number;
      nextPublishAttemptId: number;
    };

    const w = window as unknown as Record<string, unknown>;
    const campaigns: Campaign[] = [];
    const keywords: Keyword[] = [];
    const targetPosts: TargetPost[] = [];
    const candidatePosts: CandidatePost[] = [];
    const dedupeKeys: DedupeKey[] = [];
    const drafts: Draft[] = [];
    const draftVariants: DraftVariant[] = [];
    const draftAudits: DraftAudit[] = [];
    const approvals: Approval[] = [];
    const scheduleJobs: ScheduleJob[] = [];
    const publishAttempts: PublishAttempt[] = [];
    let nextCampaignId = 1;
    let nextKeywordId = 1;
    let nextTargetPostId = 1;
    let nextCandidatePostId = 1;
    let nextDedupeKeyId = 1;
    let nextDraftId = 1;
    let nextDraftVariantId = 1;
    let nextDraftAuditId = 1;
    let nextApprovalId = 1;
    let nextScheduleJobId = 1;
    let nextPublishAttemptId = 1;
    let transactionSnapshot: TransactionSnapshot | null = null;

    function readSqlArgs(args?: unknown): { query: string; values: unknown[] } {
      const sqlArgs = (args ?? {}) as { query?: string; values?: unknown[] };
      return { query: sqlArgs.query ?? "", values: sqlArgs.values ?? [] };
    }

    function getNow(): string {
      return new Date().toISOString();
    }

    function removeRows<T>(rows: T[], predicate: (row: T) => boolean): number {
      let removed = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row !== undefined && predicate(row)) {
          rows.splice(index, 1);
          removed += 1;
        }
      }
      return removed;
    }

    function cloneRows<T extends object>(rows: T[]): T[] {
      return rows.map((row) => ({ ...row }));
    }

    function createTransactionSnapshot(): TransactionSnapshot {
      return {
        campaigns: cloneRows(campaigns),
        keywords: cloneRows(keywords),
        targetPosts: cloneRows(targetPosts),
        candidatePosts: cloneRows(candidatePosts),
        dedupeKeys: cloneRows(dedupeKeys),
        drafts: cloneRows(drafts),
        draftVariants: cloneRows(draftVariants),
        draftAudits: cloneRows(draftAudits),
        approvals: cloneRows(approvals),
        scheduleJobs: cloneRows(scheduleJobs),
        publishAttempts: cloneRows(publishAttempts),
        nextCampaignId,
        nextKeywordId,
        nextTargetPostId,
        nextCandidatePostId,
        nextDedupeKeyId,
        nextDraftId,
        nextDraftVariantId,
        nextDraftAuditId,
        nextApprovalId,
        nextScheduleJobId,
        nextPublishAttemptId,
      };
    }

    function restoreRows<T extends object>(rows: T[], snapshotRows: T[]): void {
      rows.splice(0, rows.length, ...cloneRows(snapshotRows));
    }

    function restoreTransactionSnapshot(snapshot: TransactionSnapshot): void {
      restoreRows(campaigns, snapshot.campaigns);
      restoreRows(keywords, snapshot.keywords);
      restoreRows(targetPosts, snapshot.targetPosts);
      restoreRows(candidatePosts, snapshot.candidatePosts);
      restoreRows(dedupeKeys, snapshot.dedupeKeys);
      restoreRows(drafts, snapshot.drafts);
      restoreRows(draftVariants, snapshot.draftVariants);
      restoreRows(draftAudits, snapshot.draftAudits);
      restoreRows(approvals, snapshot.approvals);
      restoreRows(scheduleJobs, snapshot.scheduleJobs);
      restoreRows(publishAttempts, snapshot.publishAttempts);
      nextCampaignId = snapshot.nextCampaignId;
      nextKeywordId = snapshot.nextKeywordId;
      nextTargetPostId = snapshot.nextTargetPostId;
      nextCandidatePostId = snapshot.nextCandidatePostId;
      nextDedupeKeyId = snapshot.nextDedupeKeyId;
      nextDraftId = snapshot.nextDraftId;
      nextDraftVariantId = snapshot.nextDraftVariantId;
      nextDraftAuditId = snapshot.nextDraftAuditId;
      nextApprovalId = snapshot.nextApprovalId;
      nextScheduleJobId = snapshot.nextScheduleJobId;
      nextPublishAttemptId = snapshot.nextPublishAttemptId;
    }

    function getCandidateJoinRow(
      candidate: CandidatePost,
    ): Record<string, unknown> | null {
      const target = targetPosts.find(
        (row) => row.id === candidate.target_post_id,
      );
      const campaign = campaigns.find(
        (row) => row.id === candidate.campaign_id,
      );
      if (!target || !campaign) return null;
      return {
        id: candidate.id,
        campaign_id: candidate.campaign_id,
        target_post_id: candidate.target_post_id,
        source_keyword: candidate.source_keyword,
        status: candidate.status,
        relevance_score: candidate.relevance_score,
        score_reason: candidate.score_reason,
        notes: candidate.notes,
        created_at: candidate.created_at,
        updated_at: candidate.updated_at,
        campaign_name: campaign.name,
        target_id: target.id,
        target_platform: target.platform,
        target_url: target.url,
        target_normalized_url: target.normalized_url,
        target_author_name: target.author_name,
        target_author_profile_url: target.author_profile_url,
        target_posted_at: target.posted_at,
        target_content: target.content,
        target_content_hash: target.content_hash,
        target_created_at: target.created_at,
        target_updated_at: target.updated_at,
      };
    }

    function selectCandidateJoin(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return candidatePosts
        .filter(
          (candidate) =>
            campaignId === null || candidate.campaign_id === campaignId,
        )
        .map(getCandidateJoinRow)
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const leftRejected = left.status === "rejected" ? 1 : 0;
          const rightRejected = right.status === "rejected" ? 1 : 0;
          if (leftRejected !== rightRejected)
            return leftRejected - rightRejected;
          const updatedDelta = String(right.updated_at).localeCompare(
            String(left.updated_at),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.id) - Number(left.id);
        });
    }

    function selectDraftCandidate(values: unknown[]): unknown[] {
      const candidateId = Number(values[0] ?? 0);
      const candidate = candidatePosts.find((row) => row.id === candidateId);
      if (!candidate) return [];
      const campaign = campaigns.find(
        (row) => row.id === candidate.campaign_id,
      );
      const target = targetPosts.find(
        (row) => row.id === candidate.target_post_id,
      );
      if (!campaign || !target) return [];
      return [
        {
          candidate_id: candidate.id,
          campaign_id: candidate.campaign_id,
          campaign_status: campaign.status,
          candidate_status: candidate.status,
        },
      ];
    }

    function selectDraftJoin(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      const rows: Array<Record<string, unknown>> = [];

      for (const draft of drafts) {
        if (campaignId !== null && draft.campaign_id !== campaignId) continue;
        const campaign = campaigns.find((row) => row.id === draft.campaign_id);
        const candidate = candidatePosts.find(
          (row) => row.id === draft.candidate_post_id,
        );
        const target = candidate
          ? targetPosts.find((row) => row.id === candidate.target_post_id)
          : undefined;
        if (!campaign || !candidate || !target) continue;
        rows.push({
          id: draft.id,
          campaign_id: draft.campaign_id,
          candidate_post_id: draft.candidate_post_id,
          angle: draft.angle,
          notes: draft.notes,
          status: draft.status,
          created_at: draft.created_at,
          updated_at: draft.updated_at,
          campaign_name: campaign.name,
          candidate_source_keyword: candidate.source_keyword,
          candidate_status: candidate.status,
          candidate_relevance_score: candidate.relevance_score,
          candidate_score_reason: candidate.score_reason,
          candidate_notes: candidate.notes,
          candidate_created_at: candidate.created_at,
          candidate_updated_at: candidate.updated_at,
          target_id: target.id,
          target_platform: target.platform,
          target_url: target.url,
          target_normalized_url: target.normalized_url,
          target_author_name: target.author_name,
          target_author_profile_url: target.author_profile_url,
          target_posted_at: target.posted_at,
          target_content: target.content,
          target_content_hash: target.content_hash,
          target_created_at: target.created_at,
          target_updated_at: target.updated_at,
        });
      }

      return rows.sort((left, right) => {
        const leftArchived = left.status === "archived" ? 1 : 0;
        const rightArchived = right.status === "archived" ? 1 : 0;
        if (leftArchived !== rightArchived) return leftArchived - rightArchived;
        const updatedDelta = String(right.updated_at).localeCompare(
          String(left.updated_at),
        );
        if (updatedDelta !== 0) return updatedDelta;
        return Number(right.id) - Number(left.id);
      });
    }

    function selectDraftVariants(
      query: string,
      values: unknown[],
    ): DraftVariant[] {
      if (query.includes("WHERE id =")) {
        return draftVariants.filter(
          (variant) => variant.id === Number(values[0] ?? 0),
        );
      }

      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return draftVariants
        .filter((variant) => ids.has(variant.draft_id))
        .sort((left, right) => left.variant_number - right.variant_number);
    }

    function selectDraftAudits(values: unknown[]): DraftAudit[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return draftAudits.filter((audit) => ids.has(audit.draft_variant_id));
    }

    function getApprovalDetailRow(
      approval: Approval,
    ): Record<string, unknown> | null {
      const draft = drafts.find((row) => row.id === approval.draft_id);
      const campaign = campaigns.find((row) => row.id === approval.campaign_id);
      const variant = draftVariants.find(
        (row) => row.id === approval.draft_variant_id,
      );
      const candidate = draft
        ? candidatePosts.find((row) => row.id === draft.candidate_post_id)
        : undefined;
      const target = candidate
        ? targetPosts.find((row) => row.id === candidate.target_post_id)
        : undefined;
      if (!draft || !campaign || !variant || !candidate || !target) return null;
      return {
        id: approval.id,
        campaign_id: approval.campaign_id,
        draft_id: approval.draft_id,
        draft_variant_id: approval.draft_variant_id,
        status: approval.status,
        reviewer_notes: approval.reviewer_notes,
        approved_at: approval.approved_at,
        rejected_at: approval.rejected_at,
        created_at: approval.created_at,
        updated_at: approval.updated_at,
        draft_candidate_post_id: draft.candidate_post_id,
        draft_angle: draft.angle,
        draft_notes: draft.notes,
        draft_status: draft.status,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        candidate_source_keyword: candidate.source_keyword,
        target_url: target.url,
        target_author_name: target.author_name,
        target_author_profile_url: target.author_profile_url,
        target_content: target.content,
        variant_number: variant.variant_number,
        variant_hook: variant.hook,
        variant_body: variant.body,
        variant_cta: variant.cta,
        variant_hashtags: variant.hashtags,
        variant_status: variant.status,
      };
    }

    function getEligibleApprovalDraftRow(
      draft: Draft,
    ): Record<string, unknown> | null {
      if (draft.status !== "ready_for_review") return null;
      if (approvals.some((approval) => approval.draft_id === draft.id))
        return null;
      const campaign = campaigns.find((row) => row.id === draft.campaign_id);
      if (!campaign || campaign.status === "archived") return null;
      const selectedVariants = draftVariants.filter(
        (row) => row.draft_id === draft.id && row.status === "selected",
      );
      const variant = selectedVariants[0];
      if (selectedVariants.length !== 1 || !variant) return null;
      if (
        draftAudits.some(
          (audit) =>
            audit.draft_variant_id === variant.id && audit.severity === "block",
        )
      ) {
        return null;
      }
      const candidate = candidatePosts.find(
        (row) => row.id === draft.candidate_post_id,
      );
      const target = candidate
        ? targetPosts.find((row) => row.id === candidate.target_post_id)
        : undefined;
      if (!candidate || !target) return null;
      return {
        id: 0,
        campaign_id: draft.campaign_id,
        draft_id: draft.id,
        draft_variant_id: variant.id,
        status: "needs_review",
        reviewer_notes: "",
        approved_at: null,
        rejected_at: null,
        created_at: draft.created_at,
        updated_at: draft.updated_at,
        draft_candidate_post_id: draft.candidate_post_id,
        draft_angle: draft.angle,
        draft_notes: draft.notes,
        draft_status: draft.status,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        candidate_source_keyword: candidate.source_keyword,
        target_url: target.url,
        target_author_name: target.author_name,
        target_author_profile_url: target.author_profile_url,
        target_content: target.content,
        variant_number: variant.variant_number,
        variant_hook: variant.hook,
        variant_body: variant.body,
        variant_cta: variant.cta,
        variant_hashtags: variant.hashtags,
        variant_status: variant.status,
      };
    }

    function selectApprovalJoin(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return approvals
        .filter(
          (approval) =>
            campaignId === null || approval.campaign_id === campaignId,
        )
        .map(getApprovalDetailRow)
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const leftTerminal = ["published", "cancelled", "rejected"].includes(
            String(left.status),
          )
            ? 1
            : 0;
          const rightTerminal = ["published", "cancelled", "rejected"].includes(
            String(right.status),
          )
            ? 1
            : 0;
          if (leftTerminal !== rightTerminal)
            return leftTerminal - rightTerminal;
          const updatedDelta = String(right.updated_at).localeCompare(
            String(left.updated_at),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.id) - Number(left.id);
        });
    }

    function selectApprovalEligibleDrafts(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return drafts
        .filter(
          (draft) => campaignId === null || draft.campaign_id === campaignId,
        )
        .map(getEligibleApprovalDraftRow)
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const updatedDelta = String(right.updated_at).localeCompare(
            String(left.updated_at),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.draft_id) - Number(left.draft_id);
        });
    }

    function selectApprovalValidation(values: unknown[]): unknown[] {
      const draftId = Number(values[0] ?? 0);
      const draft = drafts.find((row) => row.id === draftId);
      if (!draft) return [];
      const campaign = campaigns.find((row) => row.id === draft.campaign_id);
      if (!campaign) return [];
      const selectedVariants = draftVariants.filter(
        (variant) =>
          variant.draft_id === draft.id && variant.status === "selected",
      );
      const selected = selectedVariants[0];
      return [
        {
          draft_id: draft.id,
          campaign_id: draft.campaign_id,
          campaign_status: campaign.status,
          draft_status: draft.status,
          draft_variant_id: selected?.id ?? null,
          selected_count: selectedVariants.length,
        },
      ];
    }

    function selectApprovalCampaign(values: unknown[]): unknown[] {
      const approvalId = Number(values[0] ?? 0);
      const approval = approvals.find((row) => row.id === approvalId);
      if (!approval) return [];
      const campaign = campaigns.find((row) => row.id === approval.campaign_id);
      if (!campaign) return [];
      return [
        {
          id: approval.id,
          campaign_id: approval.campaign_id,
          campaign_status: campaign.status,
          status: approval.status,
          draft_id: approval.draft_id,
        },
      ];
    }

    function selectScheduleValidation(values: unknown[]): unknown[] {
      const scheduleId = Number(values[0] ?? 0);
      const schedule = scheduleJobs.find((row) => row.id === scheduleId);
      if (!schedule) return [];
      const approval = approvals.find((row) => row.id === schedule.approval_id);
      const campaign = approval
        ? campaigns.find((row) => row.id === approval.campaign_id)
        : undefined;
      if (!approval || !campaign) return [];
      return [
        {
          id: schedule.id,
          approval_id: schedule.approval_id,
          status: schedule.status,
          approval_status: approval.status,
          campaign_id: approval.campaign_id,
          campaign_status: campaign.status,
        },
      ];
    }

    function parseUpdateColumns(query: string, tableName: string): string[] {
      return query
        .slice(
          query.indexOf(`UPDATE ${tableName}`) + `UPDATE ${tableName}`.length,
        )
        .split(", updated_at")[0]
        .replace("SET", "")
        .split(",")
        .map((assignment) => assignment.trim().split(" = ")[0])
        .filter(Boolean);
    }

    function selectSql(args?: unknown): unknown[] {
      const { query, values } = readSqlArgs(args);
      if (query.includes("COUNT(*) AS selected_count")) {
        const draftId = Number(values[0] ?? 0);
        return [
          {
            selected_count: draftVariants.filter(
              (variant) =>
                variant.draft_id === draftId && variant.status === "selected",
            ).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM draft_audits")
      ) {
        const variantId = Number(values[0] ?? 0);
        return [
          {
            count: draftAudits.filter(
              (audit) =>
                audit.draft_variant_id === variantId &&
                audit.severity === "block",
            ).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM approvals")
      ) {
        const draftId = Number(values[0] ?? 0);
        return [
          { count: approvals.filter((row) => row.draft_id === draftId).length },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM schedule_jobs")
      ) {
        const approvalId = Number(values[0] ?? 0);
        return [
          {
            count: scheduleJobs.filter((row) => row.approval_id === approvalId)
              .length,
          },
        ];
      }
      if (
        query.includes("FROM approvals a") &&
        query.includes("INNER JOIN drafts d")
      ) {
        return selectApprovalJoin(values);
      }
      if (
        query.includes("FROM drafts d") &&
        query.includes("LEFT JOIN approvals a")
      ) {
        return selectApprovalEligibleDrafts(values);
      }
      if (
        query.includes("FROM drafts d") &&
        query.includes("LEFT JOIN draft_variants dv")
      ) {
        return selectApprovalValidation(values);
      }
      if (
        query.includes("FROM approvals a") &&
        query.includes("c.status AS campaign_status")
      ) {
        return selectApprovalCampaign(values);
      }
      if (query.includes("FROM schedule_jobs sj")) {
        return selectScheduleValidation(values);
      }
      if (query.includes("FROM schedule_jobs")) {
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return scheduleJobs.filter((job) => ids.has(job.approval_id));
      }
      if (query.includes("FROM publish_attempts")) {
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return publishAttempts
          .filter((attempt) => ids.has(attempt.approval_id))
          .sort((left, right) => {
            const createdDelta = right.created_at.localeCompare(
              left.created_at,
            );
            if (createdDelta !== 0) return createdDelta;
            return right.id - left.id;
          });
      }
      if (query.includes("c.status AS campaign_status")) {
        return selectDraftCandidate(values);
      }
      if (query.includes("FROM drafts d")) return selectDraftJoin(values);
      if (query.includes("FROM draft_variants")) {
        return selectDraftVariants(query, values);
      }
      if (query.includes("FROM draft_audits")) return selectDraftAudits(values);
      if (query.includes("FROM candidate_posts cp"))
        return selectCandidateJoin(values);
      if (query.includes("FROM dedupe_keys")) {
        const campaignId = Number(values[0] ?? 0);
        const normalizedUrl = String(values[1] ?? "");
        const contentHash = String(values[2] ?? "");
        return dedupeKeys.filter(
          (key) =>
            key.campaign_id === campaignId &&
            ((key.key_type === "normalized_url" &&
              key.key_value === normalizedUrl) ||
              (key.key_type === "content_hash" &&
                key.key_value === contentHash)),
        );
      }
      if (query.includes("FROM target_posts")) {
        const normalizedUrl = String(values[0] ?? "");
        const contentHash = String(values[1] ?? "");
        return targetPosts
          .filter(
            (target) =>
              target.platform === "linkedin" &&
              (target.normalized_url === normalizedUrl ||
                target.content_hash === contentHash),
          )
          .slice(0, 1);
      }
      if (query.includes("FROM campaign_keywords")) {
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return keywords.filter((keyword) => ids.has(keyword.campaign_id));
      }
      if (query.includes("FROM campaigns WHERE id")) {
        return campaigns.filter((campaign) => campaign.id === values[0]);
      }
      if (query.includes("FROM campaigns")) {
        return [...campaigns].sort((left, right) => {
          const leftArchived = left.status === "archived" ? 1 : 0;
          const rightArchived = right.status === "archived" ? 1 : 0;
          if (leftArchived !== rightArchived)
            return leftArchived - rightArchived;
          const updatedDelta = right.updated_at.localeCompare(left.updated_at);
          if (updatedDelta !== 0) return updatedDelta;
          return right.id - left.id;
        });
      }
      return [];
    }

    function executeSql(args?: unknown): {
      lastInsertId: number;
      rowsAffected: number;
    } {
      const { query, values } = readSqlArgs(args);
      const calls = (w.__LINKGO_SQL_EXECUTE_CALLS__ ?? []) as Array<{
        query: string;
        values: unknown[];
      }>;
      calls.push({ query, values });
      w.__LINKGO_SQL_EXECUTE_CALLS__ = calls;
      const now = getNow();
      const normalizedQuery = query.trim().toLocaleUpperCase();

      if (normalizedQuery === "BEGIN TRANSACTION") {
        transactionSnapshot = createTransactionSnapshot();
        return { lastInsertId: 0, rowsAffected: 0 };
      }

      if (normalizedQuery === "COMMIT") {
        transactionSnapshot = null;
        return { lastInsertId: 0, rowsAffected: 0 };
      }

      if (normalizedQuery === "ROLLBACK") {
        if (transactionSnapshot !== null) {
          restoreTransactionSnapshot(transactionSnapshot);
          transactionSnapshot = null;
        }
        return { lastInsertId: 0, rowsAffected: 0 };
      }

      if (query.includes("INSERT INTO campaigns")) {
        const campaign: Campaign = {
          id: nextCampaignId,
          name: String(values[0] ?? ""),
          product: String(values[1] ?? ""),
          audience: String(values[2] ?? ""),
          voice: String(values[3] ?? ""),
          tone: String(values[4] ?? ""),
          auto_pilot: Number(values[5] ?? 0),
          status: "draft",
          daily_post_limit: Number(values[6] ?? 1),
          daily_comment_limit: Number(values[7] ?? 5),
          created_at: now,
          updated_at: now,
        };
        campaigns.push(campaign);
        nextCampaignId += 1;
        return { lastInsertId: campaign.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT OR IGNORE INTO campaign_keywords")) {
        const campaignId = Number(values[0] ?? 0);
        const keyword = String(values[1] ?? "");
        if (
          !keywords.some(
            (row) => row.campaign_id === campaignId && row.keyword === keyword,
          )
        ) {
          keywords.push({
            id: nextKeywordId,
            campaign_id: campaignId,
            keyword,
            source: "manual",
            created_at: now,
          });
          nextKeywordId += 1;
        }
        return { lastInsertId: nextKeywordId - 1, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO target_posts")) {
        const targetPost: TargetPost = {
          id: nextTargetPostId,
          platform: "linkedin",
          url: String(values[0] ?? ""),
          normalized_url: String(values[1] ?? ""),
          author_name: String(values[2] ?? ""),
          author_profile_url: String(values[3] ?? ""),
          posted_at: values[4] === null ? null : String(values[4] ?? ""),
          content: String(values[5] ?? ""),
          content_hash: String(values[6] ?? ""),
          created_at: now,
          updated_at: now,
        };
        targetPosts.push(targetPost);
        nextTargetPostId += 1;
        return { lastInsertId: targetPost.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO candidate_posts")) {
        const candidatePost: CandidatePost = {
          id: nextCandidatePostId,
          campaign_id: Number(values[0] ?? 0),
          target_post_id: Number(values[1] ?? 0),
          source_keyword: String(values[2] ?? ""),
          status: "new",
          relevance_score: values[3] === null ? null : Number(values[3] ?? 0),
          score_reason: String(values[4] ?? ""),
          notes: String(values[5] ?? ""),
          created_at: now,
          updated_at: now,
        };
        candidatePosts.push(candidatePost);
        nextCandidatePostId += 1;
        return { lastInsertId: candidatePost.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO dedupe_keys")) {
        const keyType = query.includes("'normalized_url'")
          ? "normalized_url"
          : "content_hash";
        if (w.__LINKGO_FAIL_DEDUPE_KEY_TYPE__ === keyType) {
          w.__LINKGO_FAIL_DEDUPE_KEY_TYPE__ = undefined;
          throw new Error("Injected dedupe insert failure");
        }
        const dedupeKey: DedupeKey = {
          id: nextDedupeKeyId,
          campaign_id: Number(values[0] ?? 0),
          key_type: keyType,
          key_value: String(values[1] ?? ""),
          candidate_post_id: Number(values[2] ?? 0),
          created_at: now,
        };
        dedupeKeys.push(dedupeKey);
        nextDedupeKeyId += 1;
        return { lastInsertId: dedupeKey.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO drafts")) {
        const candidatePostId = Number(values[1] ?? 0);
        if (drafts.some((row) => row.candidate_post_id === candidatePostId)) {
          throw new Error("UNIQUE constraint failed: drafts.candidate_post_id");
        }

        const draft: Draft = {
          id: nextDraftId,
          campaign_id: Number(values[0] ?? 0),
          candidate_post_id: candidatePostId,
          angle: String(values[2] ?? ""),
          notes: String(values[3] ?? ""),
          status: "drafting",
          created_at: now,
          updated_at: now,
        };
        drafts.push(draft);
        nextDraftId += 1;
        return { lastInsertId: draft.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO draft_variants")) {
        const variant: DraftVariant = {
          id: nextDraftVariantId,
          draft_id: Number(values[0] ?? 0),
          variant_number: Number(values[1] ?? 1),
          hook: String(values[2] ?? ""),
          body: String(values[3] ?? ""),
          cta: String(values[4] ?? ""),
          hashtags: String(values[5] ?? ""),
          status: "draft",
          created_at: now,
          updated_at: now,
        };
        draftVariants.push(variant);
        nextDraftVariantId += 1;
        return { lastInsertId: variant.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO draft_audits")) {
        const audit: DraftAudit = {
          id: nextDraftAuditId,
          draft_variant_id: Number(values[0] ?? 0),
          rule_key: String(values[1] ?? ""),
          severity: values[2] as DraftAuditSeverity,
          message: String(values[3] ?? ""),
          created_at: now,
        };
        draftAudits.push(audit);
        nextDraftAuditId += 1;
        return { lastInsertId: audit.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO approvals")) {
        const draftId = Number(values[1] ?? 0);
        const variantId = Number(values[2] ?? 0);
        if (approvals.some((row) => row.draft_id === draftId)) {
          throw new Error("UNIQUE constraint failed: approvals.draft_id");
        }
        if (approvals.some((row) => row.draft_variant_id === variantId)) {
          throw new Error(
            "UNIQUE constraint failed: approvals.draft_variant_id",
          );
        }
        const approval: Approval = {
          id: nextApprovalId,
          campaign_id: Number(values[0] ?? 0),
          draft_id: draftId,
          draft_variant_id: variantId,
          status: "needs_review",
          reviewer_notes: String(values[3] ?? ""),
          approved_at: null,
          rejected_at: null,
          created_at: now,
          updated_at: now,
        };
        approvals.push(approval);
        nextApprovalId += 1;
        return { lastInsertId: approval.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO schedule_jobs")) {
        const approvalId = Number(values[0] ?? 0);
        if (scheduleJobs.some((row) => row.approval_id === approvalId)) {
          throw new Error(
            "UNIQUE constraint failed: schedule_jobs.approval_id",
          );
        }
        const idempotencyKey = String(values[3] ?? "");
        if (
          scheduleJobs.some((row) => row.idempotency_key === idempotencyKey)
        ) {
          throw new Error(
            "UNIQUE constraint failed: schedule_jobs.idempotency_key",
          );
        }
        const scheduleJob: ScheduleJob = {
          id: nextScheduleJobId,
          approval_id: approvalId,
          platform: "linkedin",
          scheduled_for: String(values[1] ?? ""),
          timezone: String(values[2] ?? "local"),
          status: "scheduled",
          idempotency_key: idempotencyKey,
          created_at: now,
          updated_at: now,
        };
        scheduleJobs.push(scheduleJob);
        nextScheduleJobId += 1;
        return { lastInsertId: scheduleJob.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO publish_attempts")) {
        const publishAttempt: PublishAttempt = {
          id: nextPublishAttemptId,
          approval_id: Number(values[0] ?? 0),
          schedule_job_id: values[1] === null ? null : Number(values[1] ?? 0),
          platform: "linkedin",
          status: values[2] as PublishAttemptStatus,
          external_post_url: String(values[3] ?? ""),
          platform_post_id: String(values[4] ?? ""),
          error_message: String(values[5] ?? ""),
          created_at: now,
        };
        publishAttempts.push(publishAttempt);
        nextPublishAttemptId += 1;
        return { lastInsertId: publishAttempt.id, rowsAffected: 1 };
      }

      if (query.includes("UPDATE approvals")) {
        const literalStatus = query.includes("status = 'scheduled'")
          ? "scheduled"
          : query.includes("status = 'published'")
            ? "published"
            : query.includes("status = 'approved'")
              ? "approved"
              : null;
        const id =
          literalStatus === null
            ? Number(values.at(-1) ?? 0)
            : Number(values[0] ?? 0);
        const approval = approvals.find((row) => row.id === id);
        if (approval) {
          approval.status = (literalStatus ?? values[0]) as ApprovalStatus;
          if (query.includes("reviewer_notes")) {
            approval.reviewer_notes = String(values[1] ?? "");
          }
          if (query.includes("approved_at = datetime('now')")) {
            approval.approved_at = now;
            approval.rejected_at = null;
          }
          if (query.includes("rejected_at = datetime('now')")) {
            approval.rejected_at = now;
          }
          approval.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE schedule_jobs")) {
        const status = query.includes("status = 'cancelled'")
          ? "cancelled"
          : query.includes("status = 'completed'")
            ? "completed"
            : query.includes("status = 'failed'")
              ? "failed"
              : "scheduled";
        const id = query.includes("scheduled_for = $1")
          ? Number(values[3] ?? 0)
          : Number(values[0] ?? 0);
        const scheduleJob = scheduleJobs.find((row) => row.id === id);
        if (scheduleJob) {
          const nextIdempotencyKey = query.includes("idempotency_key = $3")
            ? String(values[2] ?? "")
            : scheduleJob.idempotency_key;
          if (
            scheduleJobs.some(
              (row) =>
                row.id !== id && row.idempotency_key === nextIdempotencyKey,
            )
          ) {
            throw new Error(
              "UNIQUE constraint failed: schedule_jobs.idempotency_key",
            );
          }
          scheduleJob.status = status;
          if (query.includes("scheduled_for = $1")) {
            scheduleJob.scheduled_for = String(values[0] ?? "");
            scheduleJob.timezone = String(values[1] ?? "local");
            scheduleJob.idempotency_key = nextIdempotencyKey;
          }
          scheduleJob.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE campaigns SET status")) {
        const status = values[0] as Campaign["status"];
        const id = Number(values[1] ?? 0);
        const campaign = campaigns.find((row) => row.id === id);
        if (campaign) {
          campaign.status = status;
          campaign.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE campaigns SET")) {
        const id = Number(values.at(-1) ?? 0);
        const campaign = campaigns.find((row) => row.id === id);
        const columns = parseUpdateColumns(query, "campaigns");

        if (campaign) {
          columns.forEach((column, index) => {
            const value = values[index];
            if (column === "name")
              campaign.name = String(value ?? campaign.name);
            if (column === "product") {
              campaign.product = String(value ?? campaign.product);
            }
            if (column === "audience") {
              campaign.audience = String(value ?? campaign.audience);
            }
            if (column === "voice")
              campaign.voice = String(value ?? campaign.voice);
            if (column === "tone")
              campaign.tone = String(value ?? campaign.tone);
            if (column === "auto_pilot") {
              campaign.auto_pilot = Number(value ?? campaign.auto_pilot);
            }
            if (column === "status")
              campaign.status = value as Campaign["status"];
            if (column === "daily_post_limit") {
              campaign.daily_post_limit = Number(
                value ?? campaign.daily_post_limit,
              );
            }
            if (column === "daily_comment_limit") {
              campaign.daily_comment_limit = Number(
                value ?? campaign.daily_comment_limit,
              );
            }
          });
          campaign.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE candidate_posts")) {
        const id = Number(values.at(-1) ?? 0);
        const candidate = candidatePosts.find((row) => row.id === id);
        if (candidate) {
          if (query.includes("status = 'drafted'")) {
            candidate.status = "drafted";
          } else {
            const columns = parseUpdateColumns(query, "candidate_posts");
            columns.forEach((column, index) => {
              const value = values[index];
              if (column === "status")
                candidate.status = value as CandidateStatus;
              if (column === "relevance_score") {
                candidate.relevance_score =
                  value === null ? null : Number(value ?? 0);
              }
              if (column === "score_reason") {
                candidate.score_reason = String(value ?? "");
              }
              if (column === "notes") candidate.notes = String(value ?? "");
            });
          }
          candidate.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE drafts")) {
        const id = Number(values.at(-1) ?? 0);
        const draft = drafts.find((row) => row.id === id);
        if (draft) {
          if (query.includes("status = 'ready_for_review'")) {
            draft.status = "ready_for_review";
          } else if (query.includes("status = 'needs_revision'")) {
            draft.status = "needs_revision";
          } else {
            const columns = parseUpdateColumns(query, "drafts");
            columns.forEach((column, index) => {
              const value = values[index];
              if (column === "angle") draft.angle = String(value ?? "");
              if (column === "notes") draft.notes = String(value ?? "");
              if (column === "status") draft.status = value as DraftStatus;
            });
          }
          draft.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE draft_variants")) {
        if (query.includes("WHERE draft_id = $1 AND id <> $2")) {
          const draftId = Number(values[0] ?? 0);
          const excludedId = Number(values[1] ?? 0);
          let rowsAffected = 0;
          for (const variant of draftVariants) {
            if (variant.draft_id === draftId && variant.id !== excludedId) {
              variant.status = "draft";
              variant.updated_at = now;
              rowsAffected += 1;
            }
          }
          return { lastInsertId: 0, rowsAffected };
        }

        const id = Number(values.at(-1) ?? 0);
        const variant = draftVariants.find((row) => row.id === id);
        if (variant) {
          if (query.includes("status = 'selected'")) {
            variant.status = "selected";
          } else {
            const columns = parseUpdateColumns(query, "draft_variants");
            columns.forEach((column, index) => {
              const value = values[index];
              if (column === "hook") variant.hook = String(value ?? "");
              if (column === "body") variant.body = String(value ?? "");
              if (column === "cta") variant.cta = String(value ?? "");
              if (column === "hashtags") variant.hashtags = String(value ?? "");
              if (column === "status") {
                variant.status = value as DraftVariantStatus;
              }
            });
          }
          variant.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("DELETE FROM draft_audits")) {
        const variantId = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          draftAudits,
          (audit) => audit.draft_variant_id === variantId,
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM dedupe_keys")) {
        const candidatePostId = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          dedupeKeys,
          (row) => row.candidate_post_id === candidatePostId,
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM candidate_posts")) {
        const id = Number(values[0] ?? 0);
        const rowsAffected = removeRows(candidatePosts, (row) => row.id === id);
        const draftIds = drafts
          .filter((draft) => draft.candidate_post_id === id)
          .map((draft) => draft.id);
        const approvalIds = approvals
          .filter((approval) => draftIds.includes(approval.draft_id))
          .map((approval) => approval.id);
        removeRows(drafts, (draft) => draft.candidate_post_id === id);
        removeRows(draftVariants, (variant) =>
          draftIds.includes(variant.draft_id),
        );
        removeRows(approvals, (approval) =>
          draftIds.includes(approval.draft_id),
        );
        removeRows(scheduleJobs, (job) =>
          approvalIds.includes(job.approval_id),
        );
        removeRows(publishAttempts, (attempt) =>
          approvalIds.includes(attempt.approval_id),
        );
        removeRows(
          draftAudits,
          (audit) =>
            !draftVariants.some(
              (variant) => variant.id === audit.draft_variant_id,
            ),
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM campaign_keywords")) {
        const campaignId = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          keywords,
          (row) => row.campaign_id === campaignId,
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM campaigns")) {
        const id = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          campaigns,
          (campaign) => campaign.id === id,
        );
        const removedDraftIds = drafts
          .filter((draft) => draft.campaign_id === id)
          .map((draft) => draft.id);
        const removedApprovalIds = approvals
          .filter((approval) => approval.campaign_id === id)
          .map((approval) => approval.id);
        removeRows(keywords, (keyword) => keyword.campaign_id === id);
        removeRows(candidatePosts, (candidate) => candidate.campaign_id === id);
        removeRows(dedupeKeys, (key) => key.campaign_id === id);
        removeRows(drafts, (draft) => draft.campaign_id === id);
        removeRows(draftVariants, (variant) =>
          removedDraftIds.includes(variant.draft_id),
        );
        removeRows(approvals, (approval) => approval.campaign_id === id);
        removeRows(scheduleJobs, (job) =>
          removedApprovalIds.includes(job.approval_id),
        );
        removeRows(publishAttempts, (attempt) =>
          removedApprovalIds.includes(attempt.approval_id),
        );
        removeRows(
          draftAudits,
          (audit) =>
            !draftVariants.some(
              (variant) => variant.id === audit.draft_variant_id,
            ),
        );
        return { lastInsertId: 0, rowsAffected };
      }

      return { lastInsertId: 0, rowsAffected: 1 };
    }

    w.__LINKGO_SQL_STATE_COUNTS__ = () => ({
      campaigns: campaigns.length,
      keywords: keywords.length,
      targetPosts: targetPosts.length,
      candidatePosts: candidatePosts.length,
      dedupeKeys: dedupeKeys.length,
      drafts: drafts.length,
      draftVariants: draftVariants.length,
      draftAudits: draftAudits.length,
      approvals: approvals.length,
      scheduleJobs: scheduleJobs.length,
      publishAttempts: publishAttempts.length,
    });

    const mockWindow = {
      show: () => Promise.resolve(),
      hide: () => Promise.resolve(),
      close: () => Promise.resolve(),
      setFocus: () => Promise.resolve(),
      isMaximized: () => Promise.resolve(false),
      isMinimized: () => Promise.resolve(false),
      isVisible: () => Promise.resolve(true),
      isFocused: () => Promise.resolve(true),
      onResized: () => Promise.resolve(() => {}),
      startDragging: () => Promise.resolve(),
      toggleMaximize: () => Promise.resolve(),
      minimize: () => Promise.resolve(),
      unminimize: () => Promise.resolve(),
      maximize: () => Promise.resolve(),
      unmaximize: () => Promise.resolve(),
      center: () => Promise.resolve(),
      outerPosition: () => Promise.resolve({ x: 0, y: 0 }),
      outerSize: () => Promise.resolve({ width: 1180, height: 780 }),
      scaleFactor: () => Promise.resolve(1),
      setPosition: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      label: "main",
    };

    w.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown) => {
        if (cmd === "plugin:sql|select")
          return Promise.resolve(selectSql(args));
        if (cmd === "plugin:sql|execute")
          return Promise.resolve(executeSql(args));
        if (cmd === "plugin:sql|close") return Promise.resolve(true);
        if (cmd === "plugin:sql|load") return Promise.resolve("");
        if (cmd === "update_tray_menu") return Promise.resolve(null);
        return Promise.resolve(null);
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
      transformCallback: (cb: unknown) => {
        const id = Math.random();
        w[`_${id}`] = cb;
        return id;
      },
      convertFileSrc: (path: string) => path,
    };

    Object.defineProperty(window, "__TAURI_MOCK_WINDOW__", {
      value: mockWindow,
    });
  });
}
