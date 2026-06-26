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

    type MemorySignal = "winner" | "underperformer" | "insight" | "avoid";

    type CampaignMemoryStatus = "active" | "archived";

    type LearningEventType =
      | "metric_recorded"
      | "memory_created"
      | "memory_archived"
      | "memory_restored";

    type PostMetric = {
      id: number;
      campaign_id: number;
      approval_id: number;
      publish_attempt_id: number | null;
      platform: "linkedin";
      measured_at: string;
      impressions: number;
      reactions: number;
      comments: number;
      reposts: number;
      profile_visits: number;
      link_clicks: number;
      ctr: number | null;
      notes: string;
      created_at: string;
      updated_at: string;
    };

    type CampaignMemory = {
      id: number;
      campaign_id: number;
      post_metric_id: number | null;
      signal: MemorySignal;
      summary: string;
      evidence: string;
      confidence: number;
      status: CampaignMemoryStatus;
      created_at: string;
      updated_at: string;
    };

    type LearningEvent = {
      id: number;
      campaign_id: number;
      post_metric_id: number | null;
      campaign_memory_id: number | null;
      event_type: LearningEventType;
      summary: string;
      created_at: string;
    };

    type WorkflowRunStatus =
      | "queued"
      | "running"
      | "waiting_approval"
      | "blocked"
      | "completed"
      | "failed"
      | "cancelled";

    type WorkflowStepKey =
      | "research"
      | "score"
      | "draft"
      | "audit"
      | "approve"
      | "schedule"
      | "measure";

    type WorkflowStepStatus =
      | "pending"
      | "running"
      | "waiting_approval"
      | "blocked"
      | "completed"
      | "failed"
      | "skipped";

    type WorkflowEventType =
      | "run_created"
      | "run_started"
      | "step_started"
      | "step_waiting_approval"
      | "step_blocked"
      | "step_completed"
      | "step_failed"
      | "step_skipped"
      | "step_resumed"
      | "run_completed"
      | "run_cancelled"
      | "note_added";

    type WorkflowRun = {
      id: number;
      campaign_id: number;
      workflow_type: "content_pipeline";
      title: string;
      status: WorkflowRunStatus;
      current_step_key: WorkflowStepKey;
      context_summary: string;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type WorkflowStep = {
      id: number;
      workflow_run_id: number;
      step_key: WorkflowStepKey;
      title: string;
      description: string;
      sort_order: number;
      status: WorkflowStepStatus;
      output_summary: string;
      error_message: string;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type WorkflowEvent = {
      id: number;
      workflow_run_id: number;
      workflow_step_id: number | null;
      event_type: WorkflowEventType;
      summary: string;
      created_at: string;
    };

    type AgentRole =
      | "researcher"
      | "scorer"
      | "drafter"
      | "auditor"
      | "scheduler"
      | "analyst";

    type AgentProviderKey =
      | "dry_run"
      | "openai"
      | "anthropic"
      | "google"
      | "custom";

    type AgentRunStatus =
      | "queued"
      | "running"
      | "waiting_approval"
      | "completed"
      | "failed"
      | "cancelled";

    type AgentToolName =
      | "research_posts"
      | "score_relevance"
      | "draft_post"
      | "audit_post"
      | "schedule_post"
      | "collect_metrics";

    type AgentToolCallStatus =
      | "requested"
      | "running"
      | "waiting_approval"
      | "completed"
      | "failed"
      | "rejected";

    type AgentRunEventType =
      | "run_created"
      | "model_started"
      | "model_streamed"
      | "tool_requested"
      | "tool_completed"
      | "tool_failed"
      | "approval_required"
      | "run_completed"
      | "run_failed"
      | "run_cancelled";

    type AgentRun = {
      id: number;
      campaign_id: number;
      workflow_run_id: number | null;
      workflow_step_id: number | null;
      agent_role: AgentRole;
      provider_key: AgentProviderKey;
      model_name: string;
      status: AgentRunStatus;
      input_summary: string;
      output_summary: string;
      error_message: string;
      iteration_count: number;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type AgentToolCall = {
      id: number;
      agent_run_id: number;
      provider_tool_call_id: string;
      tool_name: AgentToolName;
      status: AgentToolCallStatus;
      requires_approval: number;
      input_json: string;
      output_json: string;
      error_message: string;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
    };

    type AgentRunEvent = {
      id: number;
      agent_run_id: number;
      event_type: AgentRunEventType;
      summary: string;
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
      postMetrics: PostMetric[];
      campaignMemory: CampaignMemory[];
      learningEvents: LearningEvent[];
      workflowRuns: WorkflowRun[];
      workflowSteps: WorkflowStep[];
      workflowEvents: WorkflowEvent[];
      agentRuns: AgentRun[];
      agentToolCalls: AgentToolCall[];
      agentRunEvents: AgentRunEvent[];
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
      nextPostMetricId: number;
      nextCampaignMemoryId: number;
      nextLearningEventId: number;
      nextWorkflowRunId: number;
      nextWorkflowStepId: number;
      nextWorkflowEventId: number;
      nextAgentRunId: number;
      nextAgentToolCallId: number;
      nextAgentRunEventId: number;
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
    const postMetrics: PostMetric[] = [];
    const campaignMemory: CampaignMemory[] = [];
    const learningEvents: LearningEvent[] = [];
    const workflowRuns: WorkflowRun[] = [];
    const workflowSteps: WorkflowStep[] = [];
    const workflowEvents: WorkflowEvent[] = [];
    const agentRuns: AgentRun[] = [];
    const agentToolCalls: AgentToolCall[] = [];
    const agentRunEvents: AgentRunEvent[] = [];
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
    let nextPostMetricId = 1;
    let nextCampaignMemoryId = 1;
    let nextLearningEventId = 1;
    let nextWorkflowRunId = 1;
    let nextWorkflowStepId = 1;
    let nextWorkflowEventId = 1;
    let nextAgentRunId = 1;
    let nextAgentToolCallId = 1;
    let nextAgentRunEventId = 1;
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
        postMetrics: cloneRows(postMetrics),
        campaignMemory: cloneRows(campaignMemory),
        learningEvents: cloneRows(learningEvents),
        workflowRuns: cloneRows(workflowRuns),
        workflowSteps: cloneRows(workflowSteps),
        workflowEvents: cloneRows(workflowEvents),
        agentRuns: cloneRows(agentRuns),
        agentToolCalls: cloneRows(agentToolCalls),
        agentRunEvents: cloneRows(agentRunEvents),
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
        nextPostMetricId,
        nextCampaignMemoryId,
        nextLearningEventId,
        nextWorkflowRunId,
        nextWorkflowStepId,
        nextWorkflowEventId,
        nextAgentRunId,
        nextAgentToolCallId,
        nextAgentRunEventId,
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
      restoreRows(postMetrics, snapshot.postMetrics);
      restoreRows(campaignMemory, snapshot.campaignMemory);
      restoreRows(learningEvents, snapshot.learningEvents);
      restoreRows(workflowRuns, snapshot.workflowRuns);
      restoreRows(workflowSteps, snapshot.workflowSteps);
      restoreRows(workflowEvents, snapshot.workflowEvents);
      restoreRows(agentRuns, snapshot.agentRuns);
      restoreRows(agentToolCalls, snapshot.agentToolCalls);
      restoreRows(agentRunEvents, snapshot.agentRunEvents);
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
      nextPostMetricId = snapshot.nextPostMetricId;
      nextCampaignMemoryId = snapshot.nextCampaignMemoryId;
      nextLearningEventId = snapshot.nextLearningEventId;
      nextWorkflowRunId = snapshot.nextWorkflowRunId;
      nextWorkflowStepId = snapshot.nextWorkflowStepId;
      nextWorkflowEventId = snapshot.nextWorkflowEventId;
      nextAgentRunId = snapshot.nextAgentRunId;
      nextAgentToolCallId = snapshot.nextAgentToolCallId;
      nextAgentRunEventId = snapshot.nextAgentRunEventId;
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

    function getLatestSuccessfulPublishAttempt(
      approvalId: number,
    ): PublishAttempt | undefined {
      return publishAttempts
        .filter(
          (attempt) =>
            attempt.approval_id === approvalId && attempt.status === "succeeded",
        )
        .sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        })[0];
    }

    function getMetricJoinBase(
      approval: Approval,
    ): Record<string, unknown> | null {
      const campaign = campaigns.find((row) => row.id === approval.campaign_id);
      const draft = drafts.find((row) => row.id === approval.draft_id);
      const variant = draftVariants.find(
        (row) => row.id === approval.draft_variant_id,
      );
      const candidate = draft
        ? candidatePosts.find((row) => row.id === draft.candidate_post_id)
        : undefined;
      const target = candidate
        ? targetPosts.find((row) => row.id === candidate.target_post_id)
        : undefined;
      if (!campaign || !draft || !variant || !candidate || !target) return null;
      return {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        approval_id: approval.id,
        approval_status: approval.status,
        draft_id: draft.id,
        draft_angle: draft.angle,
        draft_notes: draft.notes,
        variant_id: variant.id,
        variant_number: variant.variant_number,
        variant_hook: variant.hook,
        variant_body: variant.body,
        variant_cta: variant.cta,
        variant_hashtags: variant.hashtags,
        variant_status: variant.status,
        target_author_name: target.author_name,
        target_author_profile_url: target.author_profile_url,
        target_content: target.content,
        target_url: target.url,
      };
    }

    function selectMetricEligibleApprovals(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return approvals
        .filter(
          (approval) =>
            approval.status === "published" &&
            (campaignId === null || approval.campaign_id === campaignId),
        )
        .map((approval) => {
          const base = getMetricJoinBase(approval);
          const campaign = campaigns.find((row) => row.id === approval.campaign_id);
          const publishAttempt = getLatestSuccessfulPublishAttempt(approval.id);
          if (!base || !campaign || campaign.status === "archived" || !publishAttempt) {
            return null;
          }
          return {
            ...base,
            publish_attempt_id: publishAttempt.id,
            publish_external_post_url: publishAttempt.external_post_url,
            publish_platform_post_id: publishAttempt.platform_post_id,
            publish_created_at: publishAttempt.created_at,
          };
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const createdDelta = String(right.publish_created_at).localeCompare(
            String(left.publish_created_at),
          );
          if (createdDelta !== 0) return createdDelta;
          return Number(right.approval_id) - Number(left.approval_id);
        });
    }

    function selectPostMetricJoin(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return postMetrics
        .filter(
          (metric) => campaignId === null || metric.campaign_id === campaignId,
        )
        .map((metric) => {
          const approval = approvals.find((row) => row.id === metric.approval_id);
          const base = approval ? getMetricJoinBase(approval) : null;
          const publishAttempt = metric.publish_attempt_id
            ? publishAttempts.find((row) => row.id === metric.publish_attempt_id)
            : undefined;
          if (!approval || !base) return null;
          return {
            ...metric,
            ...base,
            id: metric.id,
            approval_status: approval.status,
            publish_external_post_url: publishAttempt?.external_post_url ?? null,
            publish_platform_post_id: publishAttempt?.platform_post_id ?? null,
            publish_created_at: publishAttempt?.created_at ?? null,
          };
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const measuredDelta = String(right.measured_at).localeCompare(
            String(left.measured_at),
          );
          if (measuredDelta !== 0) return measuredDelta;
          return Number(right.id) - Number(left.id);
        });
    }

    function selectApprovalMetricValidation(values: unknown[]): unknown[] {
      const approvalId = Number(values[0] ?? 0);
      const approval = approvals.find((row) => row.id === approvalId);
      const campaign = approval
        ? campaigns.find((row) => row.id === approval.campaign_id)
        : undefined;
      if (!approval || !campaign) return [];
      return [
        {
          approval_id: approval.id,
          campaign_id: approval.campaign_id,
          campaign_status: campaign.status,
          status: approval.status,
        },
      ];
    }

    function selectMemoryValidation(values: unknown[]): unknown[] {
      const memoryId = Number(values[0] ?? 0);
      const memory = campaignMemory.find((row) => row.id === memoryId);
      const campaign = memory
        ? campaigns.find((row) => row.id === memory.campaign_id)
        : undefined;
      if (!memory || !campaign) return [];
      return [
        {
          id: memory.id,
          campaign_id: memory.campaign_id,
          status: memory.status,
          campaign_status: campaign.status,
        },
      ];
    }

    function getWorkflowRunJoinRow(
      run: WorkflowRun,
    ): Record<string, unknown> | null {
      const campaign = campaigns.find((row) => row.id === run.campaign_id);
      if (!campaign) return null;
      return {
        ...run,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
      };
    }

    function selectWorkflowRunJoin(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return workflowRuns
        .filter((run) => campaignId === null || run.campaign_id === campaignId)
        .map(getWorkflowRunJoinRow)
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const order: Record<string, number> = {
            running: 1,
            waiting_approval: 2,
            blocked: 3,
            queued: 4,
            failed: 5,
            completed: 6,
            cancelled: 7,
          };
          const statusDelta =
            (order[String(left.status)] ?? 8) - (order[String(right.status)] ?? 8);
          if (statusDelta !== 0) return statusDelta;
          const updatedDelta = String(right.updated_at).localeCompare(
            String(left.updated_at),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.id) - Number(left.id);
        });
    }

    function selectWorkflowRunValidation(values: unknown[]): unknown[] {
      const runId = Number(values[0] ?? 0);
      const run = workflowRuns.find((row) => row.id === runId);
      const campaign = run
        ? campaigns.find((row) => row.id === run.campaign_id)
        : undefined;
      if (!run || !campaign) return [];
      return [{ ...run, campaign_status: campaign.status }];
    }

    function selectWorkflowStepValidation(values: unknown[]): unknown[] {
      const stepId = Number(values[0] ?? 0);
      const step = workflowSteps.find((row) => row.id === stepId);
      const run = step
        ? workflowRuns.find((row) => row.id === step.workflow_run_id)
        : undefined;
      const campaign = run
        ? campaigns.find((row) => row.id === run.campaign_id)
        : undefined;
      if (!step || !run || !campaign) return [];
      return [
        {
          ...step,
          run_status: run.status,
          campaign_id: run.campaign_id,
          campaign_status: campaign.status,
        },
      ];
    }

    function selectWorkflowSteps(values: unknown[]): WorkflowStep[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return workflowSteps
        .filter((step) => ids.has(step.workflow_run_id))
        .sort((left, right) => {
          if (left.workflow_run_id !== right.workflow_run_id) {
            return left.workflow_run_id - right.workflow_run_id;
          }
          return left.sort_order - right.sort_order;
        });
    }

    function selectWorkflowEvents(values: unknown[]): WorkflowEvent[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return workflowEvents
        .filter((event) => ids.has(event.workflow_run_id))
        .sort((left, right) => {
          if (left.workflow_run_id !== right.workflow_run_id) {
            return left.workflow_run_id - right.workflow_run_id;
          }
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        });
    }

    function selectAgentRunJoin(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return agentRuns
        .filter((run) => campaignId === null || run.campaign_id === campaignId)
        .map((run) => {
          const campaign = campaigns.find((row) => row.id === run.campaign_id);
          if (!campaign) return null;
          return {
            ...run,
            campaign_name: campaign.name,
            campaign_status: campaign.status,
          };
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const order: Record<string, number> = {
            running: 1,
            waiting_approval: 2,
            queued: 3,
            failed: 4,
            completed: 5,
            cancelled: 6,
          };
          const statusDelta =
            (order[String(left.status)] ?? 7) - (order[String(right.status)] ?? 7);
          if (statusDelta !== 0) return statusDelta;
          const updatedDelta = String(right.updated_at).localeCompare(
            String(left.updated_at),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.id) - Number(left.id);
        });
    }

    function selectAgentRunValidation(values: unknown[]): unknown[] {
      const runId = Number(values[0] ?? 0);
      const run = agentRuns.find((row) => row.id === runId);
      const campaign = run
        ? campaigns.find((row) => row.id === run.campaign_id)
        : undefined;
      if (!run || !campaign) return [];
      return [{ ...run, campaign_status: campaign.status }];
    }

    function selectAgentToolCalls(values: unknown[]): AgentToolCall[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return agentToolCalls
        .filter((toolCall) => ids.has(toolCall.agent_run_id))
        .sort((left, right) => {
          if (left.agent_run_id !== right.agent_run_id) {
            return left.agent_run_id - right.agent_run_id;
          }
          return left.id - right.id;
        });
    }

    function selectAgentRunEvents(values: unknown[]): AgentRunEvent[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return agentRunEvents
        .filter((event) => ids.has(event.agent_run_id))
        .sort((left, right) => {
          if (left.agent_run_id !== right.agent_run_id) {
            return left.agent_run_id - right.agent_run_id;
          }
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        });
    }

    function selectWorkflowRunById(values: unknown[]): unknown[] {
      const runId = Number(values[0] ?? 0);
      const run = workflowRuns.find((row) => row.id === runId);
      return run ? [{ id: run.id, campaign_id: run.campaign_id }] : [];
    }

    function selectWorkflowStepOwnership(values: unknown[]): unknown[] {
      const stepId = Number(values[0] ?? 0);
      const step = workflowSteps.find((row) => row.id === stepId);
      const run = step
        ? workflowRuns.find((row) => row.id === step.workflow_run_id)
        : undefined;
      if (!step || !run) return [];
      return [
        {
          id: step.id,
          workflow_run_id: step.workflow_run_id,
          campaign_id: run.campaign_id,
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
        query.includes("FROM agent_runs ar") &&
        query.includes("c.name AS campaign_name")
      ) {
        return selectAgentRunJoin(values);
      }
      if (query.includes("FROM agent_runs ar")) {
        return selectAgentRunValidation(values);
      }
      if (query.includes("FROM agent_tool_calls")) {
        return selectAgentToolCalls(values);
      }
      if (query.includes("FROM agent_run_events")) {
        return selectAgentRunEvents(values);
      }
      if (query.includes("FROM workflow_runs WHERE id")) {
        return selectWorkflowRunById(values);
      }
      if (
        query.includes("FROM workflow_steps ws") &&
        query.includes("ws.workflow_run_id") &&
        !query.includes("run_status")
      ) {
        return selectWorkflowStepOwnership(values);
      }
      if (query.includes("FROM workflow_steps ws")) {
        return selectWorkflowStepValidation(values);
      }
      if (
        query.includes("FROM workflow_runs wr") &&
        query.includes("c.name AS campaign_name")
      ) {
        return selectWorkflowRunJoin(values);
      }
      if (query.includes("FROM workflow_runs wr")) {
        return selectWorkflowRunValidation(values);
      }
      if (query.includes("FROM workflow_steps")) {
        return selectWorkflowSteps(values);
      }
      if (query.includes("FROM workflow_events")) {
        return selectWorkflowEvents(values);
      }
      if (query.includes("FROM post_metrics pm")) {
        return selectPostMetricJoin(values);
      }
      if (
        query.includes("FROM approvals a") &&
        query.includes("INNER JOIN publish_attempts pa")
      ) {
        return selectMetricEligibleApprovals(values);
      }
      if (
        query.includes("FROM approvals a") &&
        query.includes("a.id AS approval_id")
      ) {
        return selectApprovalMetricValidation(values);
      }
      if (
        query.includes("FROM campaign_memory cm") &&
        query.includes("INNER JOIN campaigns c")
      ) {
        return selectMemoryValidation(values);
      }
      if (query.includes("FROM campaign_memory cm")) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return campaignMemory
          .filter(
            (memory) => campaignId === null || memory.campaign_id === campaignId,
          )
          .sort((left, right) => {
            const leftArchived = left.status === "archived" ? 1 : 0;
            const rightArchived = right.status === "archived" ? 1 : 0;
            if (leftArchived !== rightArchived)
              return leftArchived - rightArchived;
            const updatedDelta = right.updated_at.localeCompare(left.updated_at);
            if (updatedDelta !== 0) return updatedDelta;
            return right.id - left.id;
          });
      }
      if (query.includes("FROM learning_events le")) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return learningEvents
          .filter(
            (event) => campaignId === null || event.campaign_id === campaignId,
          )
          .sort((left, right) => {
            const createdDelta = right.created_at.localeCompare(left.created_at);
            if (createdDelta !== 0) return createdDelta;
            return right.id - left.id;
          });
      }
      if (query.includes("FROM post_metrics WHERE id")) {
        const id = Number(values[0] ?? 0);
        return postMetrics
          .filter((metric) => metric.id === id)
          .map((metric) => ({ id: metric.id, campaign_id: metric.campaign_id }));
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
        if (query.includes("WHERE id =")) {
          const id = Number(values[0] ?? 0);
          return publishAttempts.filter(
            (attempt) => attempt.id === id && attempt.status === "succeeded",
          );
        }
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return publishAttempts
          .filter((attempt) => ids.has(attempt.approval_id))
          .filter(
            (attempt) =>
              !query.includes("status = 'succeeded'") ||
              attempt.status === "succeeded",
          )
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

      if (query.includes("INSERT INTO post_metrics")) {
        const metric: PostMetric = {
          id: nextPostMetricId,
          campaign_id: Number(values[0] ?? 0),
          approval_id: Number(values[1] ?? 0),
          publish_attempt_id: values[2] === null ? null : Number(values[2] ?? 0),
          platform: "linkedin",
          measured_at: String(values[3] ?? ""),
          impressions: Number(values[4] ?? 0),
          reactions: Number(values[5] ?? 0),
          comments: Number(values[6] ?? 0),
          reposts: Number(values[7] ?? 0),
          profile_visits: Number(values[8] ?? 0),
          link_clicks: Number(values[9] ?? 0),
          ctr: values[10] === null ? null : Number(values[10] ?? 0),
          notes: String(values[11] ?? ""),
          created_at: now,
          updated_at: now,
        };
        postMetrics.push(metric);
        nextPostMetricId += 1;
        return { lastInsertId: metric.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO campaign_memory")) {
        const memory: CampaignMemory = {
          id: nextCampaignMemoryId,
          campaign_id: Number(values[0] ?? 0),
          post_metric_id: values[1] === null ? null : Number(values[1] ?? 0),
          signal: values[2] as MemorySignal,
          summary: String(values[3] ?? ""),
          evidence: String(values[4] ?? ""),
          confidence: Number(values[5] ?? 50),
          status: "active",
          created_at: now,
          updated_at: now,
        };
        campaignMemory.push(memory);
        nextCampaignMemoryId += 1;
        return { lastInsertId: memory.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO learning_events")) {
        const event: LearningEvent = {
          id: nextLearningEventId,
          campaign_id: Number(values[0] ?? 0),
          post_metric_id: values[1] === null ? null : Number(values[1] ?? 0),
          campaign_memory_id:
            values[2] === null ? null : Number(values[2] ?? 0),
          event_type: values[3] as LearningEventType,
          summary: String(values[4] ?? ""),
          created_at: now,
        };
        learningEvents.push(event);
        nextLearningEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO agent_runs")) {
        const run: AgentRun = {
          id: nextAgentRunId,
          campaign_id: Number(values[0] ?? 0),
          workflow_run_id: values[1] === null ? null : Number(values[1] ?? 0),
          workflow_step_id: values[2] === null ? null : Number(values[2] ?? 0),
          agent_role: values[3] as AgentRole,
          provider_key: values[4] as AgentProviderKey,
          model_name: String(values[5] ?? ""),
          status: "queued",
          input_summary: String(values[6] ?? ""),
          output_summary: "",
          error_message: "",
          iteration_count: 0,
          started_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        agentRuns.push(run);
        nextAgentRunId += 1;
        return { lastInsertId: run.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO agent_run_events")) {
        const event: AgentRunEvent = {
          id: nextAgentRunEventId,
          agent_run_id: Number(values[0] ?? 0),
          event_type: values[1] as AgentRunEventType,
          summary: String(values[2] ?? ""),
          created_at: now,
        };
        agentRunEvents.push(event);
        nextAgentRunEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO agent_tool_calls")) {
        const status = values[3] as AgentToolCallStatus;
        const toolCall: AgentToolCall = {
          id: nextAgentToolCallId,
          agent_run_id: Number(values[0] ?? 0),
          provider_tool_call_id: String(values[1] ?? ""),
          tool_name: values[2] as AgentToolName,
          status,
          requires_approval: Number(values[4] ?? 0),
          input_json: String(values[5] ?? "{}"),
          output_json: String(values[6] ?? "{}"),
          error_message: String(values[7] ?? ""),
          started_at: now,
          completed_at: ["completed", "failed", "rejected"].includes(status)
            ? now
            : null,
          created_at: now,
        };
        agentToolCalls.push(toolCall);
        nextAgentToolCallId += 1;
        return { lastInsertId: toolCall.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO workflow_runs")) {
        const run: WorkflowRun = {
          id: nextWorkflowRunId,
          campaign_id: Number(values[0] ?? 0),
          workflow_type: "content_pipeline",
          title: String(values[1] ?? ""),
          status: "queued",
          current_step_key: "research",
          context_summary: String(values[2] ?? ""),
          started_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        workflowRuns.push(run);
        nextWorkflowRunId += 1;
        return { lastInsertId: run.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO workflow_steps")) {
        const step: WorkflowStep = {
          id: nextWorkflowStepId,
          workflow_run_id: Number(values[0] ?? 0),
          step_key: values[1] as WorkflowStepKey,
          title: String(values[2] ?? ""),
          description: String(values[3] ?? ""),
          sort_order: Number(values[4] ?? 1),
          status: "pending",
          output_summary: "",
          error_message: "",
          started_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        workflowSteps.push(step);
        nextWorkflowStepId += 1;
        return { lastInsertId: step.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO workflow_events")) {
        const event: WorkflowEvent = {
          id: nextWorkflowEventId,
          workflow_run_id: Number(values[0] ?? 0),
          workflow_step_id: values[1] === null ? null : Number(values[1] ?? 0),
          event_type: values[2] as WorkflowEventType,
          summary: String(values[3] ?? ""),
          created_at: now,
        };
        workflowEvents.push(event);
        nextWorkflowEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("UPDATE agent_runs")) {
        const literalRunning = query.includes("status = 'running'");
        const literalCancelled = query.includes("status = 'cancelled'");
        const id = literalRunning || literalCancelled
          ? Number(values[0] ?? 0)
          : Number(values[4] ?? 0);
        const run = agentRuns.find((row) => row.id === id);
        if (run) {
          if (literalRunning) {
            if (
              query.includes("status IN ('queued', 'failed')") &&
              !["queued", "failed"].includes(run.status)
            ) {
              return { lastInsertId: id, rowsAffected: 0 };
            }
            run.status = "running";
            run.started_at = run.started_at ?? now;
            run.completed_at = null;
            run.error_message = "";
          } else if (literalCancelled) {
            run.status = "cancelled";
            run.completed_at = now;
          } else {
            run.status = values[0] as AgentRunStatus;
            run.output_summary = String(values[1] ?? "");
            run.error_message = String(values[2] ?? "");
            run.iteration_count = Number(values[3] ?? 0);
            run.completed_at = ["completed", "failed", "cancelled"].includes(
              run.status,
            )
              ? now
              : null;
          }
          run.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE workflow_runs")) {
        const id = query.includes("current_step_key = $2")
          ? Number(values[2] ?? 0)
          : Number(values[0] ?? 0);
        const run = workflowRuns.find((row) => row.id === id);
        if (run) {
          if (query.includes("status = 'running'")) {
            run.status = "running";
            run.started_at = run.started_at ?? now;
          } else if (query.includes("status = 'cancelled'")) {
            run.status = "cancelled";
            run.completed_at = now;
          } else if (query.includes("current_step_key = $2")) {
            run.status = values[0] as WorkflowRunStatus;
            run.current_step_key = values[1] as WorkflowStepKey;
            if (run.status === "running") {
              run.started_at = run.started_at ?? now;
            }
            run.completed_at =
              run.status === "completed" ? (run.completed_at ?? now) : null;
          }
          run.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE workflow_steps")) {
        const literalRunning = query.includes("status = 'running'");
        const id = literalRunning ? Number(values[0] ?? 0) : Number(values[3] ?? 0);
        const step = workflowSteps.find((row) => row.id === id);
        if (step) {
          const status = literalRunning ? "running" : (values[0] as WorkflowStepStatus);
          step.status = status;
          if (!literalRunning) {
            step.output_summary = String(values[1] ?? "");
            step.error_message = String(values[2] ?? "");
          }
          if (status === "running") {
            step.started_at = step.started_at ?? now;
            step.completed_at = null;
          }
          if (status === "completed" || status === "skipped") {
            step.completed_at = now;
          }
          if (["blocked", "failed", "waiting_approval"].includes(status)) {
            step.completed_at = null;
          }
          step.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
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

      if (query.includes("UPDATE campaign_memory")) {
        const status = values[0] as CampaignMemoryStatus;
        const id = Number(values[1] ?? 0);
        const memory = campaignMemory.find((row) => row.id === id);
        if (memory) {
          memory.status = status;
          memory.updated_at = now;
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
        const removedMetricIds = postMetrics
          .filter((metric) => approvalIds.includes(metric.approval_id))
          .map((metric) => metric.id);
        removeRows(postMetrics, (metric) =>
          approvalIds.includes(metric.approval_id),
        );
        for (const memory of campaignMemory) {
          if (
            memory.post_metric_id !== null &&
            removedMetricIds.includes(memory.post_metric_id)
          ) {
            memory.post_metric_id = null;
          }
        }
        for (const event of learningEvents) {
          if (
            event.post_metric_id !== null &&
            removedMetricIds.includes(event.post_metric_id)
          ) {
            event.post_metric_id = null;
          }
        }
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
        removeRows(postMetrics, (metric) => metric.campaign_id === id);
        removeRows(campaignMemory, (memory) => memory.campaign_id === id);
        removeRows(learningEvents, (event) => event.campaign_id === id);
        const removedAgentRunIds = agentRuns
          .filter((run) => run.campaign_id === id)
          .map((run) => run.id);
        removeRows(agentRuns, (run) => run.campaign_id === id);
        removeRows(agentToolCalls, (toolCall) =>
          removedAgentRunIds.includes(toolCall.agent_run_id),
        );
        removeRows(agentRunEvents, (event) =>
          removedAgentRunIds.includes(event.agent_run_id),
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

    w.__LINKGO_SQL_AGENT_TOOL_CALLS__ = () => cloneRows(agentToolCalls);

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
      postMetrics: postMetrics.length,
      campaignMemory: campaignMemory.length,
      learningEvents: learningEvents.length,
      workflowRuns: workflowRuns.length,
      workflowSteps: workflowSteps.length,
      workflowEvents: workflowEvents.length,
      agentRuns: agentRuns.length,
      agentToolCalls: agentToolCalls.length,
      agentRunEvents: agentRunEvents.length,
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
