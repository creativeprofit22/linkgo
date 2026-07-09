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
      platform_resource_urn: string;
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

    type CandidateDiscoveryItem = {
      id: number;
      campaign_id: number;
      agent_run_id: number | null;
      workflow_run_id: number | null;
      kind: "keyword" | "trend" | "source_prompt";
      title: string;
      keyword: string;
      rationale: string;
      source_keyword: string;
      confidence_score: number | null;
      status: "suggested" | "promoted" | "dismissed";
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

    type DraftGenerationRequest = {
      id: number;
      campaign_id: number;
      candidate_post_id: number;
      agent_run_id: number | null;
      provider_key: AgentProviderKey;
      model_name: string;
      playbook_key: AgentPlaybookKey | "";
      variant_count: number;
      angle: string;
      voice_notes: string;
      status: "pending" | "generated" | "saved" | "failed" | "dismissed";
      summary: string;
      generated_variants_json: string;
      error_message: string;
      created_draft_id: number | null;
      created_at: string;
      updated_at: string;
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
      attempt_count: number;
      max_attempts: number;
      next_attempt_at: string | null;
      last_attempted_at: string | null;
      last_error: string;
      locked_at: string | null;
      locked_by: string | null;
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

    type ContentCalendarPurpose =
      | "reach"
      | "trust"
      | "proof"
      | "conversion"
      | "community";
    type ContentCalendarFormat =
      | "text"
      | "image"
      | "carousel"
      | "document"
      | "video"
      | "poll"
      | "event";
    type ContentCalendarSlotStatus = "planned" | "archived";

    type ContentCalendarSlot = {
      id: number;
      campaign_id: number;
      approval_id: number;
      purpose: ContentCalendarPurpose;
      slot_for: string;
      timezone: string;
      format: ContentCalendarFormat;
      angle: string;
      visual_direction: string;
      cta: string;
      notes: string;
      status: ContentCalendarSlotStatus;
      created_at: string;
      updated_at: string;
    };

    type CommentThreadStatus =
      | "drafting"
      | "needs_review"
      | "changes_requested"
      | "approved"
      | "rejected"
      | "posted"
      | "cancelled";
    type CommentVariantStatus = "draft" | "selected" | "rejected";
    type CommentAuditSeverity = "pass" | "warning" | "block";
    type CommentAttemptStatus = "succeeded" | "failed";

    type CommentThread = {
      id: number;
      campaign_id: number;
      candidate_post_id: number;
      status: CommentThreadStatus;
      operator_notes: string;
      reviewer_notes: string;
      approved_at: string | null;
      rejected_at: string | null;
      posted_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type CommentVariant = {
      id: number;
      comment_thread_id: number;
      variant_number: number;
      body: string;
      status: CommentVariantStatus;
      created_at: string;
      updated_at: string;
    };

    type CommentAudit = {
      id: number;
      comment_variant_id: number;
      rule_key: string;
      severity: CommentAuditSeverity;
      message: string;
      created_at: string;
    };

    type CommentAttempt = {
      id: number;
      comment_thread_id: number;
      platform: "linkedin";
      status: CommentAttemptStatus;
      external_comment_url: string;
      platform_comment_id: string;
      idempotency_key: string;
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
      collection_source: "manual" | "linkedin_social_metadata";
      raw_payload_json: string;
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

    type MetricRefreshJob = {
      id: number;
      campaign_id: number;
      approval_id: number;
      publish_attempt_id: number | null;
      platform: "linkedin";
      target_urn: string;
      status: "active" | "paused" | "unavailable" | "failed";
      next_refresh_at: string;
      last_refreshed_at: string | null;
      last_attempted_at: string | null;
      attempt_count: number;
      max_attempts: number;
      failure_count: number;
      last_error: string;
      locked_at: string | null;
      locked_by: string | null;
      created_at: string;
      updated_at: string;
    };

    type MetricRefreshEvent = {
      id: number;
      campaign_id: number | null;
      approval_id: number | null;
      metric_refresh_job_id: number | null;
      post_metric_id: number | null;
      event_type:
        | "refresh_started"
        | "refresh_completed"
        | "refresh_retry_scheduled"
        | "refresh_unavailable"
        | "refresh_failed"
        | "refresh_blocked"
        | "worker_started"
        | "worker_stopped"
        | "tick_started"
        | "tick_completed";
      severity: "info" | "warning" | "error";
      summary: string;
      metadata_json: string;
      created_at: string;
    };

    type MetricRefreshSettings = {
      id: 1;
      enabled: number;
      poll_interval_minutes: number;
      max_jobs_per_tick: number;
      refresh_interval_hours: number;
      retry_backoff_minutes: number;
      updated_at: string;
    };

    type AppSettings = {
      id: 1;
      launch_on_login_enabled: number;
      launch_on_login_last_synced_at: string | null;
      launch_on_login_last_error: string;
      created_at: string;
      updated_at: string;
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

    type WorkflowArtifact = {
      id: number;
      workflow_run_id: number;
      workflow_step_id: number | null;
      artifact_type: "agent_run";
      artifact_id: number;
      summary: string;
      created_at: string;
      updated_at: string;
    };

    type AgentRole =
      | "researcher"
      | "scorer"
      | "drafter"
      | "auditor"
      | "scheduler"
      | "analyst";

    type AgentPlaybookKey =
      | "linkedin_writer"
      | "linkedin_humanizer"
      | "content_calendar"
      | "linkedin_commenter"
      | "campaign_analyst";

    type AgentProviderKey =
      | "dry_run"
      | "anthropic"
      | "xiaomi"
      | "openai"
      | "gemini"
      | "glm"
      | "moonshot"
      | "deepseek"
      | "openrouter"
      | "sakana"
      | "minimax"
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
      playbook_key: AgentPlaybookKey | "";
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

    type AgentPlaybookOverride = {
      playbook_key: AgentPlaybookKey;
      enabled: number;
      custom_instructions: string;
      updated_at: string;
    };

    type SafetyAuditSubjectType =
      | "campaign"
      | "approval"
      | "schedule_job"
      | "publish_attempt"
      | "agent_run"
      | "workflow_run"
      | "error_queue_item"
      | "safety_settings";

    type SafetyAuditEventType =
      | "kill_switch_enabled"
      | "kill_switch_disabled"
      | "schedule_allowed"
      | "schedule_blocked"
      | "schedule_cancelled"
      | "publish_succeeded"
      | "publish_failed"
      | "approval_rejected"
      | "agent_run_started"
      | "agent_run_failed"
      | "error_item_created"
      | "error_item_updated";

    type SafetyAuditSeverity = "info" | "warning" | "block";
    type RateLimitAction =
      | "schedule_post"
      | "publish_post"
      | "comment"
      | "agent_run";
    type RateLimitDecision = "allowed" | "blocked";
    type ErrorQueueSourceType =
      | "approval"
      | "publish_attempt"
      | "schedule_job"
      | "agent_run"
      | "workflow_run"
      | "manual";
    type ErrorQueueSeverity = "warning" | "error" | "critical";
    type ErrorQueueStatus =
      | "open"
      | "in_progress"
      | "awaiting_review"
      | "resolved"
      | "failed";

    type SchedulerEventType =
      | "scheduler_started"
      | "scheduler_stopped"
      | "tick_started"
      | "tick_completed"
      | "job_claimed"
      | "job_blocked"
      | "job_published"
      | "job_retry_scheduled"
      | "job_failed";
    type SchedulerEventSeverity = "info" | "warning" | "error";

    type SchedulerSettings = {
      id: 1;
      enabled: number;
      poll_interval_seconds: number;
      max_jobs_per_tick: number;
      retry_backoff_minutes: number;
      updated_at: string;
    };

    type SchedulerEvent = {
      id: number;
      campaign_id: number | null;
      approval_id: number | null;
      schedule_job_id: number | null;
      event_type: SchedulerEventType;
      severity: SchedulerEventSeverity;
      summary: string;
      metadata_json: string;
      created_at: string;
    };

    type SafetySettings = {
      id: 1;
      global_kill_switch: number;
      kill_switch_reason: string;
      updated_at: string;
    };

    type SafetyAuditEvent = {
      id: number;
      campaign_id: number | null;
      subject_type: SafetyAuditSubjectType;
      subject_id: number | null;
      event_type: SafetyAuditEventType;
      severity: SafetyAuditSeverity;
      summary: string;
      metadata_json: string;
      created_at: string;
    };

    type RateLimitEvent = {
      id: number;
      campaign_id: number;
      action: RateLimitAction;
      window_key: string;
      limit_value: number;
      current_count: number;
      decision: RateLimitDecision;
      summary: string;
      created_at: string;
    };

    type ErrorQueueItem = {
      id: number;
      campaign_id: number | null;
      source_type: ErrorQueueSourceType;
      source_id: number | null;
      title: string;
      detail: string;
      severity: ErrorQueueSeverity;
      status: ErrorQueueStatus;
      resolution_notes: string;
      created_at: string;
      updated_at: string;
    };

    type TransactionSnapshot = {
      campaigns: Campaign[];
      keywords: Keyword[];
      targetPosts: TargetPost[];
      candidatePosts: CandidatePost[];
      dedupeKeys: DedupeKey[];
      candidateDiscoveryItems: CandidateDiscoveryItem[];
      drafts: Draft[];
      draftVariants: DraftVariant[];
      draftAudits: DraftAudit[];
      approvals: Approval[];
      scheduleJobs: ScheduleJob[];
      publishAttempts: PublishAttempt[];
      contentCalendarSlots: ContentCalendarSlot[];
      commentThreads: CommentThread[];
      commentVariants: CommentVariant[];
      commentAudits: CommentAudit[];
      commentAttempts: CommentAttempt[];
      postMetrics: PostMetric[];
      campaignMemory: CampaignMemory[];
      learningEvents: LearningEvent[];
      metricRefreshJobs: MetricRefreshJob[];
      metricRefreshEvents: MetricRefreshEvent[];
      metricRefreshSettings: MetricRefreshSettings;
      appSettings: AppSettings;
      workflowRuns: WorkflowRun[];
      workflowSteps: WorkflowStep[];
      workflowEvents: WorkflowEvent[];
      workflowArtifacts: WorkflowArtifact[];
      agentRuns: AgentRun[];
      agentToolCalls: AgentToolCall[];
      agentRunEvents: AgentRunEvent[];
      agentPlaybookOverrides: AgentPlaybookOverride[];
      safetySettings: SafetySettings;
      safetyAuditEvents: SafetyAuditEvent[];
      rateLimitEvents: RateLimitEvent[];
      errorQueueItems: ErrorQueueItem[];
      schedulerSettings: SchedulerSettings;
      schedulerEvents: SchedulerEvent[];
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
      nextContentCalendarSlotId: number;
      nextCommentThreadId: number;
      nextCommentVariantId: number;
      nextCommentAuditId: number;
      nextCommentAttemptId: number;
      nextPostMetricId: number;
      nextCampaignMemoryId: number;
      nextLearningEventId: number;
      nextMetricRefreshJobId: number;
      nextMetricRefreshEventId: number;
      nextWorkflowRunId: number;
      nextWorkflowStepId: number;
      nextWorkflowEventId: number;
      nextWorkflowArtifactId: number;
      nextAgentRunId: number;
      nextAgentToolCallId: number;
      nextAgentRunEventId: number;
      nextSafetyAuditEventId: number;
      nextRateLimitEventId: number;
      nextErrorQueueItemId: number;
      nextSchedulerEventId: number;
    };

    const w = window as unknown as Record<string, unknown>;
    const campaigns: Campaign[] = [];
    const keywords: Keyword[] = [];
    const targetPosts: TargetPost[] = [];
    const candidatePosts: CandidatePost[] = [];
    const dedupeKeys: DedupeKey[] = [];
    const candidateDiscoveryItems: CandidateDiscoveryItem[] = [];
    const drafts: Draft[] = [];
    const draftVariants: DraftVariant[] = [];
    const draftAudits: DraftAudit[] = [];
    const draftGenerationRequests: DraftGenerationRequest[] = [];
    const approvals: Approval[] = [];
    const scheduleJobs: ScheduleJob[] = [];
    const publishAttempts: PublishAttempt[] = [];
    const contentCalendarSlots: ContentCalendarSlot[] = [];
    const commentThreads: CommentThread[] = [];
    const commentVariants: CommentVariant[] = [];
    const commentAudits: CommentAudit[] = [];
    const commentAttempts: CommentAttempt[] = [];
    const postMetrics: PostMetric[] = [];
    const campaignMemory: CampaignMemory[] = [];
    const learningEvents: LearningEvent[] = [];
    const metricRefreshJobs: MetricRefreshJob[] = [];
    const metricRefreshEvents: MetricRefreshEvent[] = [];
    const metricRefreshSettings: MetricRefreshSettings = {
      id: 1,
      enabled: 0,
      poll_interval_minutes: 360,
      max_jobs_per_tick: 3,
      refresh_interval_hours: 6,
      retry_backoff_minutes: 60,
      updated_at: new Date().toISOString(),
    };
    const appSettings: AppSettings = {
      id: 1,
      launch_on_login_enabled: 0,
      launch_on_login_last_synced_at: null,
      launch_on_login_last_error: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const workflowRuns: WorkflowRun[] = [];
    const workflowSteps: WorkflowStep[] = [];
    const workflowEvents: WorkflowEvent[] = [];
    const workflowArtifacts: WorkflowArtifact[] = [];
    const agentRuns: AgentRun[] = [];
    const agentToolCalls: AgentToolCall[] = [];
    const agentRunEvents: AgentRunEvent[] = [];
    const agentPlaybookOverrides: AgentPlaybookOverride[] = [];
    const safetySettings: SafetySettings = {
      id: 1,
      global_kill_switch: 0,
      kill_switch_reason: "",
      updated_at: new Date().toISOString(),
    };
    const safetyAuditEvents: SafetyAuditEvent[] = [];
    const rateLimitEvents: RateLimitEvent[] = [];
    const errorQueueItems: ErrorQueueItem[] = [];
    const schedulerSettings: SchedulerSettings = {
      id: 1,
      enabled: 0,
      poll_interval_seconds: 60,
      max_jobs_per_tick: 1,
      retry_backoff_minutes: 15,
      updated_at: new Date().toISOString(),
    };
    const schedulerEvents: SchedulerEvent[] = [];
    let schedulerRunning = false;
    let metricRefreshRunning = false;
    let nextCampaignId = 1;
    let nextKeywordId = 1;
    let nextTargetPostId = 1;
    let nextCandidatePostId = 1;
    let nextDedupeKeyId = 1;
    let nextCandidateDiscoveryItemId = 1;
    let nextDraftId = 1;
    let nextDraftVariantId = 1;
    let nextDraftAuditId = 1;
    let nextDraftGenerationRequestId = 1;
    let nextApprovalId = 1;
    let nextScheduleJobId = 1;
    let nextPublishAttemptId = 1;
    let nextContentCalendarSlotId = 1;
    let nextCommentThreadId = 1;
    let nextCommentVariantId = 1;
    let nextCommentAuditId = 1;
    let nextCommentAttemptId = 1;
    let nextPostMetricId = 1;
    let nextCampaignMemoryId = 1;
    let nextLearningEventId = 1;
    let nextMetricRefreshJobId = 1;
    let nextMetricRefreshEventId = 1;
    let nextWorkflowRunId = 1;
    let nextWorkflowStepId = 1;
    let nextWorkflowEventId = 1;
    let nextWorkflowArtifactId = 1;
    let nextAgentRunId = 1;
    let nextAgentToolCallId = 1;
    let nextAgentRunEventId = 1;
    let nextSafetyAuditEventId = 1;
    let nextRateLimitEventId = 1;
    let nextErrorQueueItemId = 1;
    let nextSchedulerEventId = 1;
    let transactionSnapshot: TransactionSnapshot | null = null;
    let autostartMutationCount = 0;

    function readSqlArgs(args?: unknown): { query: string; values: unknown[] } {
      const sqlArgs = (args ?? {}) as { query?: string; values?: unknown[] };
      return { query: sqlArgs.query ?? "", values: sqlArgs.values ?? [] };
    }

    function getNow(): string {
      return new Date().toISOString();
    }

    const VALID_AGENT_PLAYBOOK_KEYS: AgentPlaybookKey[] = [
      "linkedin_writer",
      "linkedin_humanizer",
      "content_calendar",
      "linkedin_commenter",
      "campaign_analyst",
    ];

    function assertValidAgentPlaybookKey(
      key: string,
    ): asserts key is AgentPlaybookKey {
      if (!VALID_AGENT_PLAYBOOK_KEYS.includes(key as AgentPlaybookKey)) {
        throw new Error("CHECK constraint failed: playbook_key");
      }
    }

    function assertValidAgentRunPlaybookKey(
      key: string,
    ): asserts key is AgentPlaybookKey | "" {
      if (key === "") return;
      assertValidAgentPlaybookKey(key);
    }

    function assertValidCustomInstructions(customInstructions: string): void {
      if (customInstructions.length > 2000) {
        throw new Error(
          "CHECK constraint failed: length(custom_instructions) <= 2000",
        );
      }
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
        candidateDiscoveryItems: cloneRows(candidateDiscoveryItems),
        drafts: cloneRows(drafts),
        draftVariants: cloneRows(draftVariants),
        draftAudits: cloneRows(draftAudits),
        approvals: cloneRows(approvals),
        scheduleJobs: cloneRows(scheduleJobs),
        publishAttempts: cloneRows(publishAttempts),
        contentCalendarSlots: cloneRows(contentCalendarSlots),
        commentThreads: cloneRows(commentThreads),
        commentVariants: cloneRows(commentVariants),
        commentAudits: cloneRows(commentAudits),
        commentAttempts: cloneRows(commentAttempts),
        postMetrics: cloneRows(postMetrics),
        campaignMemory: cloneRows(campaignMemory),
        learningEvents: cloneRows(learningEvents),
        metricRefreshJobs: cloneRows(metricRefreshJobs),
        metricRefreshEvents: cloneRows(metricRefreshEvents),
        metricRefreshSettings: { ...metricRefreshSettings },
        appSettings: { ...appSettings },
        workflowRuns: cloneRows(workflowRuns),
        workflowSteps: cloneRows(workflowSteps),
        workflowEvents: cloneRows(workflowEvents),
        workflowArtifacts: cloneRows(workflowArtifacts),
        agentRuns: cloneRows(agentRuns),
        agentToolCalls: cloneRows(agentToolCalls),
        agentRunEvents: cloneRows(agentRunEvents),
        agentPlaybookOverrides: cloneRows(agentPlaybookOverrides),
        safetySettings: { ...safetySettings },
        safetyAuditEvents: cloneRows(safetyAuditEvents),
        rateLimitEvents: cloneRows(rateLimitEvents),
        errorQueueItems: cloneRows(errorQueueItems),
        schedulerSettings: { ...schedulerSettings },
        schedulerEvents: cloneRows(schedulerEvents),
        nextCampaignId,
        nextKeywordId,
        nextTargetPostId,
        nextCandidatePostId,
        nextDedupeKeyId,
        nextCandidateDiscoveryItemId,
        nextDraftId,
        nextDraftVariantId,
        nextDraftAuditId,
        nextApprovalId,
        nextScheduleJobId,
        nextPublishAttemptId,
        nextContentCalendarSlotId,
        nextCommentThreadId,
        nextCommentVariantId,
        nextCommentAuditId,
        nextCommentAttemptId,
        nextPostMetricId,
        nextCampaignMemoryId,
        nextLearningEventId,
        nextMetricRefreshJobId,
        nextMetricRefreshEventId,
        nextWorkflowRunId,
        nextWorkflowStepId,
        nextWorkflowEventId,
        nextWorkflowArtifactId,
        nextAgentRunId,
        nextAgentToolCallId,
        nextAgentRunEventId,
        nextSafetyAuditEventId,
        nextRateLimitEventId,
        nextErrorQueueItemId,
        nextSchedulerEventId,
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
      restoreRows(candidateDiscoveryItems, snapshot.candidateDiscoveryItems);
      restoreRows(drafts, snapshot.drafts);
      restoreRows(draftVariants, snapshot.draftVariants);
      restoreRows(draftAudits, snapshot.draftAudits);
      restoreRows(approvals, snapshot.approvals);
      restoreRows(scheduleJobs, snapshot.scheduleJobs);
      restoreRows(publishAttempts, snapshot.publishAttempts);
      restoreRows(contentCalendarSlots, snapshot.contentCalendarSlots);
      restoreRows(commentThreads, snapshot.commentThreads);
      restoreRows(commentVariants, snapshot.commentVariants);
      restoreRows(commentAudits, snapshot.commentAudits);
      restoreRows(commentAttempts, snapshot.commentAttempts);
      restoreRows(postMetrics, snapshot.postMetrics);
      restoreRows(campaignMemory, snapshot.campaignMemory);
      restoreRows(learningEvents, snapshot.learningEvents);
      restoreRows(metricRefreshJobs, snapshot.metricRefreshJobs);
      restoreRows(metricRefreshEvents, snapshot.metricRefreshEvents);
      Object.assign(metricRefreshSettings, snapshot.metricRefreshSettings);
      Object.assign(appSettings, snapshot.appSettings);
      restoreRows(workflowRuns, snapshot.workflowRuns);
      restoreRows(workflowSteps, snapshot.workflowSteps);
      restoreRows(workflowEvents, snapshot.workflowEvents);
      restoreRows(workflowArtifacts, snapshot.workflowArtifacts);
      restoreRows(agentRuns, snapshot.agentRuns);
      restoreRows(agentToolCalls, snapshot.agentToolCalls);
      restoreRows(agentRunEvents, snapshot.agentRunEvents);
      restoreRows(agentPlaybookOverrides, snapshot.agentPlaybookOverrides);
      safetySettings.global_kill_switch =
        snapshot.safetySettings.global_kill_switch;
      safetySettings.kill_switch_reason =
        snapshot.safetySettings.kill_switch_reason;
      safetySettings.updated_at = snapshot.safetySettings.updated_at;
      restoreRows(safetyAuditEvents, snapshot.safetyAuditEvents);
      restoreRows(rateLimitEvents, snapshot.rateLimitEvents);
      restoreRows(errorQueueItems, snapshot.errorQueueItems);
      schedulerSettings.enabled = snapshot.schedulerSettings.enabled;
      schedulerSettings.poll_interval_seconds =
        snapshot.schedulerSettings.poll_interval_seconds;
      schedulerSettings.max_jobs_per_tick =
        snapshot.schedulerSettings.max_jobs_per_tick;
      schedulerSettings.retry_backoff_minutes =
        snapshot.schedulerSettings.retry_backoff_minutes;
      schedulerSettings.updated_at = snapshot.schedulerSettings.updated_at;
      restoreRows(schedulerEvents, snapshot.schedulerEvents);
      nextCampaignId = snapshot.nextCampaignId;
      nextKeywordId = snapshot.nextKeywordId;
      nextTargetPostId = snapshot.nextTargetPostId;
      nextCandidatePostId = snapshot.nextCandidatePostId;
      nextDedupeKeyId = snapshot.nextDedupeKeyId;
      nextCandidateDiscoveryItemId = snapshot.nextCandidateDiscoveryItemId;
      nextDraftId = snapshot.nextDraftId;
      nextDraftVariantId = snapshot.nextDraftVariantId;
      nextDraftAuditId = snapshot.nextDraftAuditId;
      nextApprovalId = snapshot.nextApprovalId;
      nextScheduleJobId = snapshot.nextScheduleJobId;
      nextPublishAttemptId = snapshot.nextPublishAttemptId;
      nextContentCalendarSlotId = snapshot.nextContentCalendarSlotId;
      nextCommentThreadId = snapshot.nextCommentThreadId;
      nextCommentVariantId = snapshot.nextCommentVariantId;
      nextCommentAuditId = snapshot.nextCommentAuditId;
      nextCommentAttemptId = snapshot.nextCommentAttemptId;
      nextPostMetricId = snapshot.nextPostMetricId;
      nextCampaignMemoryId = snapshot.nextCampaignMemoryId;
      nextLearningEventId = snapshot.nextLearningEventId;
      nextMetricRefreshJobId = snapshot.nextMetricRefreshJobId;
      nextMetricRefreshEventId = snapshot.nextMetricRefreshEventId;
      nextWorkflowRunId = snapshot.nextWorkflowRunId;
      nextWorkflowStepId = snapshot.nextWorkflowStepId;
      nextWorkflowEventId = snapshot.nextWorkflowEventId;
      nextWorkflowArtifactId = snapshot.nextWorkflowArtifactId;
      nextAgentRunId = snapshot.nextAgentRunId;
      nextAgentToolCallId = snapshot.nextAgentToolCallId;
      nextAgentRunEventId = snapshot.nextAgentRunEventId;
      nextSafetyAuditEventId = snapshot.nextSafetyAuditEventId;
      nextRateLimitEventId = snapshot.nextRateLimitEventId;
      nextErrorQueueItemId = snapshot.nextErrorQueueItemId;
      nextSchedulerEventId = snapshot.nextSchedulerEventId;
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
        target_platform_resource_urn: target.platform_resource_urn,
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
          campaign_name: campaign.name,
          candidate_source_keyword: candidate.source_keyword,
          candidate_score_reason: candidate.score_reason,
          candidate_notes: candidate.notes,
          target_author_name: target.author_name,
          target_content: target.content,
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

    function selectDraftGenerationRequestJoin(
      query: string,
      values: unknown[],
    ): unknown[] {
      const requestId = query.includes("WHERE dgr.id")
        ? Number(values[0] ?? 0)
        : null;
      const campaignId = query.includes("WHERE dgr.campaign_id")
        ? Number(values[0] ?? 0)
        : null;
      const rows: Array<Record<string, unknown>> = [];

      for (const request of draftGenerationRequests) {
        if (campaignId !== null && request.campaign_id !== campaignId) continue;
        if (requestId !== null && request.id !== requestId) continue;
        const campaign = campaigns.find(
          (row) => row.id === request.campaign_id,
        );
        const candidate = candidatePosts.find(
          (row) => row.id === request.candidate_post_id,
        );
        const target = candidate
          ? targetPosts.find((row) => row.id === candidate.target_post_id)
          : undefined;
        if (!campaign || !candidate || !target) continue;
        rows.push({
          ...request,
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
          target_platform_resource_urn: target.platform_resource_urn,
          target_author_name: target.author_name,
          target_author_profile_url: target.author_profile_url,
          target_posted_at: target.posted_at,
          target_content: target.content,
          target_content_hash: target.content_hash,
          target_created_at: target.created_at,
          target_updated_at: target.updated_at,
        });
      }
      return rows.sort((left, right) => Number(right.id) - Number(left.id));
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
        target_platform_resource_urn: target.platform_resource_urn,
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
        target_platform_resource_urn: target.platform_resource_urn,
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
          daily_post_limit: campaign.daily_post_limit,
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
          daily_post_limit: campaign.daily_post_limit,
          status: approval.status,
          draft_id: approval.draft_id,
          successful_publish_attempt_count: publishAttempts.filter(
            (attempt) =>
              attempt.approval_id === approval.id &&
              attempt.status === "succeeded",
          ).length,
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
            attempt.approval_id === approvalId &&
            attempt.status === "succeeded",
        )
        .sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        })[0];
    }

    function getLatestScheduleJob(approvalId: number): ScheduleJob | undefined {
      return scheduleJobs
        .filter((job) => job.approval_id === approvalId)
        .sort((left, right) => {
          const updatedDelta = right.updated_at.localeCompare(left.updated_at);
          if (updatedDelta !== 0) return updatedDelta;
          return right.id - left.id;
        })[0];
    }

    function getContentCalendarBaseRow(
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

      const scheduleJob = getLatestScheduleJob(approval.id);
      return {
        approval_id: approval.id,
        campaign_id: approval.campaign_id,
        approval_status: approval.status,
        approval_reviewer_notes: approval.reviewer_notes,
        approval_approved_at: approval.approved_at,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        draft_id: draft.id,
        draft_angle: draft.angle,
        draft_notes: draft.notes,
        candidate_post_id: draft.candidate_post_id,
        candidate_source_keyword: candidate.source_keyword,
        target_url: target.url,
        target_author_name: target.author_name,
        target_author_profile_url: target.author_profile_url,
        target_content: target.content,
        variant_id: variant.id,
        variant_number: variant.variant_number,
        variant_hook: variant.hook,
        variant_body: variant.body,
        variant_cta: variant.cta,
        variant_hashtags: variant.hashtags,
        schedule_job_id: scheduleJob?.id ?? null,
        schedule_scheduled_for: scheduleJob?.scheduled_for ?? null,
        schedule_timezone: scheduleJob?.timezone ?? null,
        schedule_status: scheduleJob?.status ?? null,
        schedule_attempt_count: scheduleJob?.attempt_count ?? null,
        schedule_last_error: scheduleJob?.last_error ?? null,
        schedule_updated_at: scheduleJob?.updated_at ?? null,
      };
    }

    function selectContentCalendarSlots(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return contentCalendarSlots
        .filter((slot) => campaignId === null || slot.campaign_id === campaignId)
        .map((slot) => {
          const approval = approvals.find((row) => row.id === slot.approval_id);
          const base = approval ? getContentCalendarBaseRow(approval) : null;
          if (!approval || !base) return null;
          const publishAttempt = getLatestSuccessfulPublishAttempt(approval.id);
          return {
            ...slot,
            ...base,
            publish_attempt_id: publishAttempt?.id ?? null,
            publish_status: publishAttempt?.status ?? null,
            publish_external_post_url: publishAttempt?.external_post_url ?? null,
            publish_platform_post_id: publishAttempt?.platform_post_id ?? null,
            publish_error_message: publishAttempt?.error_message ?? null,
            publish_created_at: publishAttempt?.created_at ?? null,
          };
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const leftArchived = left.status === "archived" ? 1 : 0;
          const rightArchived = right.status === "archived" ? 1 : 0;
          if (leftArchived !== rightArchived) return leftArchived - rightArchived;
          const slotDelta = String(left.slot_for).localeCompare(
            String(right.slot_for),
          );
          if (slotDelta !== 0) return slotDelta;
          return Number(left.id) - Number(right.id);
        });
    }

    function selectContentCalendarEligibleApprovals(
      values: unknown[],
    ): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return approvals
        .filter(
          (approval) =>
            ["approved", "scheduled", "published"].includes(approval.status) &&
            (campaignId === null || approval.campaign_id === campaignId) &&
            !contentCalendarSlots.some(
              (slot) => slot.approval_id === approval.id,
            ),
        )
        .map((approval) => {
          const campaign = campaigns.find(
            (row) => row.id === approval.campaign_id,
          );
          const base = getContentCalendarBaseRow(approval);
          if (!campaign || campaign.status === "archived" || !base) return null;
          return base;
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const updatedLeft = approvals.find(
            (approval) => approval.id === Number(left.approval_id),
          )?.updated_at;
          const updatedRight = approvals.find(
            (approval) => approval.id === Number(right.approval_id),
          )?.updated_at;
          const updatedDelta = String(updatedRight).localeCompare(
            String(updatedLeft),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.approval_id) - Number(left.approval_id);
        });
    }

    function selectContentCalendarApprovalValidation(
      values: unknown[],
    ): unknown[] {
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
          approval_status: approval.status,
          slot_count: contentCalendarSlots.filter(
            (slot) => slot.approval_id === approval.id,
          ).length,
        },
      ];
    }

    function selectContentCalendarSlotValidation(values: unknown[]): unknown[] {
      const slotId = Number(values[0] ?? 0);
      const slot = contentCalendarSlots.find((row) => row.id === slotId);
      if (!slot) return [];
      const campaign = campaigns.find((row) => row.id === slot.campaign_id);
      const approval = approvals.find((row) => row.id === slot.approval_id);
      if (!campaign || !approval) return [];
      return [
        {
          id: slot.id,
          approval_id: slot.approval_id,
          campaign_id: slot.campaign_id,
          campaign_status: campaign.status,
          approval_status: approval.status,
          status: slot.status,
          slot_for: slot.slot_for,
          timezone: slot.timezone,
        },
      ];
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
          const campaign = campaigns.find(
            (row) => row.id === approval.campaign_id,
          );
          const publishAttempt = getLatestSuccessfulPublishAttempt(approval.id);
          if (
            !base ||
            !campaign ||
            campaign.status === "archived" ||
            !publishAttempt
          ) {
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
          const approval = approvals.find(
            (row) => row.id === metric.approval_id,
          );
          const base = approval ? getMetricJoinBase(approval) : null;
          const publishAttempt = metric.publish_attempt_id
            ? publishAttempts.find(
                (row) => row.id === metric.publish_attempt_id,
              )
            : undefined;
          if (!approval || !base) return null;
          return {
            ...metric,
            ...base,
            id: metric.id,
            approval_status: approval.status,
            publish_external_post_url:
              publishAttempt?.external_post_url ?? null,
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
            (order[String(left.status)] ?? 8) -
            (order[String(right.status)] ?? 8);
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

    function selectWorkflowArtifacts(values: unknown[]): unknown[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      return workflowArtifacts
        .filter((artifact) => ids.has(artifact.workflow_run_id))
        .map((artifact) => mapWorkflowArtifactWithDetails(artifact))
        .sort((left, right) => {
          if (left.workflow_run_id !== right.workflow_run_id) {
            return left.workflow_run_id - right.workflow_run_id;
          }
          return left.id - right.id;
        });
    }

    function selectWorkflowArtifactId(values: unknown[]): unknown[] {
      const workflowRunId = Number(values[0] ?? 0);
      const artifactType = String(values[1] ?? "");
      const artifactId = Number(values[2] ?? 0);
      const artifact = workflowArtifacts.find(
        (row) =>
          row.workflow_run_id === workflowRunId &&
          row.artifact_type === artifactType &&
          row.artifact_id === artifactId,
      );
      return artifact ? [{ id: artifact.id }] : [];
    }

    function mapWorkflowArtifactWithDetails(artifact: WorkflowArtifact) {
      const agentRun = agentRuns.find(
        (run) =>
          artifact.artifact_type === "agent_run" &&
          run.id === artifact.artifact_id,
      );
      return {
        ...artifact,
        agent_role: agentRun?.agent_role ?? null,
        agent_status: agentRun?.status ?? null,
      };
    }

    function selectAgentRunArtifactOwnership(values: unknown[]): unknown[] {
      const id = Number(values[0] ?? 0);
      const artifactType = String(values[1] ?? "");
      if (artifactType !== "agent_run") return [];
      const run = agentRuns.find((row) => row.id === id);
      return run
        ? [
            {
              campaign_id: run.campaign_id,
              workflow_run_id: run.workflow_run_id,
              workflow_step_id: run.workflow_step_id,
            },
          ]
        : [];
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
            (order[String(left.status)] ?? 7) -
            (order[String(right.status)] ?? 7);
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

    function selectAgentPlaybookOverrides(
      values: unknown[],
    ): AgentPlaybookOverride[] {
      if (values.length > 0) {
        const key = String(values[0] ?? "");
        return agentPlaybookOverrides.filter(
          (override) => override.playbook_key === key,
        );
      }
      return [...agentPlaybookOverrides].sort((left, right) =>
        left.playbook_key.localeCompare(right.playbook_key),
      );
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

    function selectCommentCandidateRow(
      candidate: CandidatePost,
    ): Record<string, unknown> | null {
      const campaign = campaigns.find(
        (row) => row.id === candidate.campaign_id,
      );
      const target = targetPosts.find(
        (row) => row.id === candidate.target_post_id,
      );
      if (!campaign || !target) return null;
      return {
        candidate_id: candidate.id,
        campaign_id: candidate.campaign_id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        candidate_status: candidate.status,
        source_keyword: candidate.source_keyword,
        relevance_score: candidate.relevance_score,
        target_post_id: target.id,
        target_url: target.url,
        target_platform_resource_urn: target.platform_resource_urn,
        target_author_name: target.author_name,
        target_author_profile_url: target.author_profile_url,
        target_content: target.content,
        target_posted_at: target.posted_at,
      };
    }

    function selectCommentThreads(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return commentThreads
        .filter(
          (thread) => campaignId === null || thread.campaign_id === campaignId,
        )
        .map((thread) => {
          const campaign = campaigns.find(
            (row) => row.id === thread.campaign_id,
          );
          const candidate = candidatePosts.find(
            (row) => row.id === thread.candidate_post_id,
          );
          const target = candidate
            ? targetPosts.find((row) => row.id === candidate.target_post_id)
            : undefined;
          if (!campaign || !candidate || !target) return null;
          return {
            ...thread,
            campaign_name: campaign.name,
            campaign_status: campaign.status,
            candidate_status: candidate.status,
            candidate_source_keyword: candidate.source_keyword,
            candidate_relevance_score: candidate.relevance_score,
            target_post_id: target.id,
            target_url: target.url,
            target_platform_resource_urn: target.platform_resource_urn,
            target_author_name: target.author_name,
            target_author_profile_url: target.author_profile_url,
            target_content: target.content,
            target_posted_at: target.posted_at,
          };
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const leftHistory = ["posted", "rejected", "cancelled"].includes(
            String(left.status),
          )
            ? 1
            : 0;
          const rightHistory = ["posted", "rejected", "cancelled"].includes(
            String(right.status),
          )
            ? 1
            : 0;
          if (leftHistory !== rightHistory) return leftHistory - rightHistory;
          const updatedDelta = String(right.updated_at).localeCompare(
            String(left.updated_at),
          );
          if (updatedDelta !== 0) return updatedDelta;
          return Number(right.id) - Number(left.id);
        });
    }

    function selectCommentEligibleCandidates(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return candidatePosts
        .filter((candidate) => {
          const campaign = campaigns.find(
            (row) => row.id === candidate.campaign_id,
          );
          const existingThread = commentThreads.find(
            (thread) => thread.candidate_post_id === candidate.id,
          );
          return (
            campaign?.status !== "archived" &&
            ["shortlisted", "drafted"].includes(candidate.status) &&
            existingThread === undefined &&
            (campaignId === null || candidate.campaign_id === campaignId)
          );
        })
        .map(selectCommentCandidateRow)
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort(
          (left, right) =>
            Number(right.candidate_id) - Number(left.candidate_id),
        );
    }

    function selectCommentThreadValidation(values: unknown[]): unknown[] {
      const threadId = Number(values[0] ?? 0);
      const thread = commentThreads.find((row) => row.id === threadId);
      const campaign = thread
        ? campaigns.find((row) => row.id === thread.campaign_id)
        : undefined;
      if (!thread || !campaign) return [];
      return [
        {
          id: thread.id,
          campaign_id: thread.campaign_id,
          candidate_post_id: thread.candidate_post_id,
          status: thread.status,
          campaign_status: campaign.status,
          daily_comment_limit: campaign.daily_comment_limit,
          target_url:
            targetPosts.find(
              (target) =>
                target.id ===
                candidatePosts.find(
                  (candidate) => candidate.id === thread.candidate_post_id,
                )?.target_post_id,
            )?.url ?? "",
          target_platform_resource_urn:
            targetPosts.find(
              (target) =>
                target.id ===
                candidatePosts.find(
                  (candidate) => candidate.id === thread.candidate_post_id,
                )?.target_post_id,
            )?.platform_resource_urn ?? "",
        },
      ];
    }

    function selectCommentSelectedVariant(values: unknown[]): unknown[] {
      const threadId = Number(values[0] ?? 0);
      return commentVariants
        .filter(
          (variant) =>
            variant.comment_thread_id === threadId &&
            variant.status === "selected",
        )
        .map((variant) => ({
          ...variant,
          blocked_count: commentAudits.filter(
            (audit) =>
              audit.comment_variant_id === variant.id &&
              audit.severity === "block",
          ).length,
        }));
    }

    function selectSafetyErrorQueue(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return errorQueueItems
        .filter(
          (item) => campaignId === null || item.campaign_id === campaignId,
        )
        .map((item) => {
          const campaign = item.campaign_id
            ? campaigns.find((row) => row.id === item.campaign_id)
            : undefined;
          return {
            ...item,
            campaign_name: campaign?.name ?? null,
            campaign_status: campaign?.status ?? null,
          };
        })
        .sort((left, right) => {
          const leftResolved = left.status === "resolved" ? 1 : 0;
          const rightResolved = right.status === "resolved" ? 1 : 0;
          if (leftResolved !== rightResolved)
            return leftResolved - rightResolved;
          const updatedDelta = right.updated_at.localeCompare(left.updated_at);
          if (updatedDelta !== 0) return updatedDelta;
          return right.id - left.id;
        })
        .slice(0, 50);
    }

    function selectRateLimitEvents(values: unknown[]): RateLimitEvent[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return rateLimitEvents
        .filter(
          (event) => campaignId === null || event.campaign_id === campaignId,
        )
        .sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        })
        .slice(0, 50);
    }

    function selectSafetyAuditEvents(values: unknown[]): SafetyAuditEvent[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return safetyAuditEvents
        .filter(
          (event) => campaignId === null || event.campaign_id === campaignId,
        )
        .sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        })
        .slice(0, 50);
    }

    function scheduleCampaign(job: ScheduleJob): Campaign | undefined {
      const approval = approvals.find((row) => row.id === job.approval_id);
      return approval
        ? campaigns.find((campaign) => campaign.id === approval.campaign_id)
        : undefined;
    }

    function scheduleApproval(job: ScheduleJob): Approval | undefined {
      return approvals.find((row) => row.id === job.approval_id);
    }

    function dateMs(value: string | null | undefined): number {
      if (!value) return Number.NaN;
      return new Date(value).getTime();
    }

    function isDueSchedulerJob(job: ScheduleJob): boolean {
      const approval = scheduleApproval(job);
      const campaign = scheduleCampaign(job);
      const nowMs = Date.now();
      return (
        job.status === "scheduled" &&
        approval?.status === "scheduled" &&
        campaign?.status !== "archived" &&
        dateMs(job.scheduled_for) <= nowMs &&
        (job.next_attempt_at === null || dateMs(job.next_attempt_at) <= nowMs)
      );
    }

    function selectSchedulerDueJobs(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return scheduleJobs
        .filter((job) => {
          const approval = scheduleApproval(job);
          const campaign = scheduleCampaign(job);
          const variant = approval
            ? draftVariants.find((row) => row.id === approval.draft_variant_id)
            : undefined;
          if (!approval || !campaign || !variant) return false;
          const includeSoon =
            dateMs(job.scheduled_for) <= Date.now() + 86_400_000;
          const includeError = job.last_error.trim() !== "";
          return (
            job.status === "scheduled" &&
            (includeSoon || includeError) &&
            (campaignId === null || approval.campaign_id === campaignId)
          );
        })
        .map((job) => {
          const approval = scheduleApproval(job)!;
          const campaign = scheduleCampaign(job)!;
          const variant = draftVariants.find(
            (row) => row.id === approval.draft_variant_id,
          )!;
          return {
            ...job,
            campaign_id: approval.campaign_id,
            approval_status: approval.status,
            campaign_name: campaign.name,
            campaign_status: campaign.status,
            variant_hook: variant.hook,
          };
        })
        .sort((left, right) => {
          const scheduledDelta = left.scheduled_for.localeCompare(
            right.scheduled_for,
          );
          if (scheduledDelta !== 0) return scheduledDelta;
          return left.id - right.id;
        })
        .slice(0, 20);
    }

    function selectSchedulerEvents(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return schedulerEvents
        .filter(
          (event) => campaignId === null || event.campaign_id === campaignId,
        )
        .map((event) => ({
          ...event,
          campaign_name: event.campaign_id
            ? (campaigns.find((campaign) => campaign.id === event.campaign_id)
                ?.name ?? null)
            : null,
        }))
        .sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        })
        .slice(0, 50);
    }

    function selectSchedulerPublishAttempts(values: unknown[]): unknown[] {
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      return publishAttempts
        .filter((attempt) => attempt.schedule_job_id !== null)
        .map((attempt) => {
          const approval = approvals.find(
            (row) => row.id === attempt.approval_id,
          );
          const campaign = approval
            ? campaigns.find((row) => row.id === approval.campaign_id)
            : undefined;
          return {
            ...attempt,
            campaign_id: approval?.campaign_id ?? null,
            campaign_name: campaign?.name ?? null,
          };
        })
        .filter(
          (attempt) =>
            campaignId === null || attempt.campaign_id === campaignId,
        )
        .sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          if (createdDelta !== 0) return createdDelta;
          return right.id - left.id;
        })
        .slice(0, 25);
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
      if (query.includes("FROM scheduler_settings")) {
        return [{ ...schedulerSettings }];
      }
      if (query.includes("FROM app_settings")) {
        return [{ ...appSettings }];
      }
      if (query.includes("FROM safety_settings")) {
        return [{ ...safetySettings }];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM error_queue_items")
      ) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return [
          {
            count: errorQueueItems.filter(
              (item) =>
                ["open", "in_progress", "awaiting_review"].includes(
                  item.status,
                ) &&
                (campaignId === null || item.campaign_id === campaignId),
            ).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM rate_limit_events")
      ) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        const decision = query.includes("decision = 'blocked'")
          ? "blocked"
          : "allowed";
        return [
          {
            count: rateLimitEvents.filter(
              (event) =>
                event.decision === decision &&
                (campaignId === null || event.campaign_id === campaignId),
            ).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM comment_attempts ca")
      ) {
        const campaignId = Number(values[0] ?? 0);
        const day = String(values[1] ?? "")
          .trim()
          .slice(0, 10);
        return [
          {
            count: commentAttempts.filter((attempt) => {
              const thread = commentThreads.find(
                (row) => row.id === attempt.comment_thread_id,
              );
              return (
                thread?.campaign_id === campaignId &&
                attempt.status === "succeeded" &&
                attempt.created_at.trim().slice(0, 10) === day
              );
            }).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM comment_threads")
      ) {
        const candidateId = Number(values[0] ?? 0);
        return [
          {
            count: commentThreads.filter(
              (thread) => thread.candidate_post_id === candidateId,
            ).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM safety_audit_events")
      ) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return [
          {
            count: safetyAuditEvents.filter(
              (event) =>
                campaignId === null || event.campaign_id === campaignId,
            ).length,
          },
        ];
      }
      if (query.includes("FROM error_queue_items eqi")) {
        if (query.includes("WHERE eqi.id =")) {
          const id = Number(values[0] ?? 0);
          return selectSafetyErrorQueue([]).filter((item) => item.id === id);
        }
        return selectSafetyErrorQueue(values);
      }
      if (query.includes("FROM error_queue_items")) {
        const sourceType = String(values[0] ?? "");
        const sourceId = Number(values[1] ?? 0);
        return errorQueueItems.filter(
          (item) =>
            item.source_type === sourceType &&
            item.source_id === sourceId &&
            ["open", "in_progress", "awaiting_review"].includes(item.status),
        );
      }
      if (query.includes("FROM rate_limit_events")) {
        return selectRateLimitEvents(values);
      }
      if (query.includes("FROM comment_threads ct")) {
        if (query.includes("WHERE ct.id = $1"))
          return selectCommentThreadValidation(values);
        return selectCommentThreads(values);
      }
      if (
        query.includes("FROM candidate_posts cp") &&
        query.includes("LEFT JOIN comment_threads ct")
      ) {
        return selectCommentEligibleCandidates(values);
      }
      if (
        query.includes("FROM candidate_posts cp") &&
        query.includes("WHERE cp.id = $1") &&
        query.includes("target_posted_at")
      ) {
        const candidateId = Number(values[0] ?? 0);
        const candidate = candidatePosts.find((row) => row.id === candidateId);
        return candidate
          ? [selectCommentCandidateRow(candidate)].filter(Boolean)
          : [];
      }
      if (query.includes("FROM comment_variants")) {
        if (query.includes("cv.status = 'selected'")) {
          return selectCommentSelectedVariant(values);
        }
        if (query.includes("WHERE id = $1")) {
          const id = Number(values[0] ?? 0);
          return commentVariants.filter((variant) => variant.id === id);
        }
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return commentVariants
          .filter((variant) => ids.has(variant.comment_thread_id))
          .sort((left, right) => left.variant_number - right.variant_number);
      }
      if (query.includes("FROM comment_audits")) {
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return commentAudits.filter((audit) =>
          ids.has(audit.comment_variant_id),
        );
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM comment_attempts") &&
        query.includes("comment_thread_id = $1")
      ) {
        const threadId = Number(values[0] ?? 0);
        return [
          {
            count: commentAttempts.filter(
              (attempt) =>
                attempt.comment_thread_id === threadId &&
                (!query.includes("status = 'succeeded'") ||
                  attempt.status === "succeeded"),
            ).length,
          },
        ];
      }
      if (query.includes("FROM comment_attempts")) {
        const ids = new Set(
          values.filter((value): value is number => typeof value === "number"),
        );
        return commentAttempts
          .filter((attempt) => ids.has(attempt.comment_thread_id))
          .sort((left, right) => {
            const createdDelta = right.created_at.localeCompare(
              left.created_at,
            );
            if (createdDelta !== 0) return createdDelta;
            return right.id - left.id;
          });
      }
      if (query.includes("FROM scheduler_events se")) {
        return selectSchedulerEvents(values);
      }
      if (
        query.includes("FROM publish_attempts pa") &&
        query.includes("pa.schedule_job_id IS NOT NULL")
      ) {
        return selectSchedulerPublishAttempts(values);
      }
      if (
        query.includes("FROM schedule_jobs sj") &&
        query.includes("dv.hook AS variant_hook")
      ) {
        return selectSchedulerDueJobs(values);
      }
      if (query.includes("FROM safety_audit_events")) {
        return selectSafetyAuditEvents(values);
      }
      if (
        query.includes("FROM content_calendar_slots ccs") &&
        query.includes("WHERE ccs.id = $1")
      ) {
        return selectContentCalendarSlotValidation(values);
      }
      if (
        query.includes("LEFT JOIN content_calendar_slots ccs") &&
        query.includes("FROM approvals a")
      ) {
        return selectContentCalendarEligibleApprovals(values);
      }
      if (
        query.includes("FROM approvals a") &&
        query.includes("slot_count")
      ) {
        return selectContentCalendarApprovalValidation(values);
      }
      if (
        query.includes("SELECT COUNT(*) FROM content_calendar_slots") &&
        query.includes("existing_ccs.approval_id = a.id")
      ) {
        return selectContentCalendarApprovalValidation(values);
      }
      if (query.includes("FROM content_calendar_slots ccs")) {
        return selectContentCalendarSlots(values);
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM content_calendar_slots")
      ) {
        const approvalId = Number(values[0] ?? 0);
        return [
          {
            count: contentCalendarSlots.filter(
              (slot) => slot.approval_id === approvalId,
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
        query.includes("FROM schedule_jobs sj") &&
        query.includes("sj.status = 'scheduled'") &&
        !query.includes("sj.status IN")
      ) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        const dueOnly = query.includes(
          "datetime(sj.scheduled_for) <= datetime('now')",
        );
        return [
          {
            count: scheduleJobs.filter((job) => {
              const approval = scheduleApproval(job);
              const campaign = scheduleCampaign(job);
              if (!approval || !campaign) return false;
              return (
                job.status === "scheduled" &&
                (campaignId === null || approval.campaign_id === campaignId) &&
                (!dueOnly || isDueSchedulerJob(job))
              );
            }).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM schedule_jobs sj") &&
        query.includes("sj.status = 'failed'")
      ) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return [
          {
            count: scheduleJobs.filter((job) => {
              const approval = scheduleApproval(job);
              return (
                job.status === "failed" &&
                (campaignId === null || approval?.campaign_id === campaignId)
              );
            }).length,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count") &&
        query.includes("FROM schedule_jobs")
      ) {
        if (query.includes("INNER JOIN approvals a")) {
          const campaignId = Number(values[0] ?? 0);
          const scheduledDay = String(values[1] ?? "")
            .trim()
            .slice(0, 10);
          const statusMatches = query.match(/sj\.status IN \(([^)]*)\)/);
          const statuses = statusMatches
            ? statusMatches[1]
                .split(",")
                .map((status) => status.trim().replace(/'/g, ""))
            : ["scheduled", "completed"];
          return [
            {
              count: scheduleJobs.filter((job) => {
                const approval = approvals.find(
                  (row) => row.id === job.approval_id,
                );
                return (
                  approval?.campaign_id === campaignId &&
                  job.scheduled_for.trim().slice(0, 10) === scheduledDay &&
                  statuses.includes(job.status)
                );
              }).length,
            },
          ];
        }
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
      if (query.includes("FROM agent_runs")) {
        return selectAgentRunArtifactOwnership(values);
      }
      if (query.includes("FROM agent_tool_calls")) {
        return selectAgentToolCalls(values);
      }
      if (query.includes("FROM agent_run_events")) {
        return selectAgentRunEvents(values);
      }
      if (query.includes("FROM agent_playbook_overrides")) {
        return selectAgentPlaybookOverrides(values);
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
      if (query.includes("FROM workflow_artifacts")) {
        if (query.includes("SELECT id")) {
          return selectWorkflowArtifactId(values);
        }
        return selectWorkflowArtifacts(values);
      }
      if (query.includes("FROM workflow_events")) {
        return selectWorkflowEvents(values);
      }
      if (query.includes("FROM metric_refresh_settings")) {
        return [{ ...metricRefreshSettings }];
      }
      if (query.includes("FROM metric_refresh_jobs mrj")) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return metricRefreshJobs
          .filter(
            (job) => campaignId === null || job.campaign_id === campaignId,
          )
          .sort((left, right) => left.id - right.id);
      }
      if (query.includes("FROM metric_refresh_events mre")) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        return metricRefreshEvents
          .filter(
            (event) => campaignId === null || event.campaign_id === campaignId,
          )
          .sort((left, right) => right.id - left.id)
          .slice(0, 20);
      }
      if (
        query.includes(
          "SELECT\n      (SELECT COUNT(*) FROM metric_refresh_jobs",
        )
      ) {
        const campaignId = typeof values[0] === "number" ? values[0] : null;
        const jobs = metricRefreshJobs.filter(
          (job) => campaignId === null || job.campaign_id === campaignId,
        );
        const metrics = postMetrics.filter(
          (metric) => campaignId === null || metric.campaign_id === campaignId,
        );
        return [
          {
            total_jobs: jobs.length,
            active_jobs: jobs.filter((job) => job.status === "active").length,
            due_jobs: jobs.filter((job) => job.status === "active").length,
            unavailable_jobs: jobs.filter((job) => job.status === "unavailable")
              .length,
            failed_jobs: jobs.filter((job) => job.status === "failed").length,
            api_snapshots: metrics.filter(
              (metric) =>
                metric.collection_source === "linkedin_social_metadata",
            ).length,
          },
        ];
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
            (memory) =>
              campaignId === null || memory.campaign_id === campaignId,
          )
          .sort((left, right) => {
            const leftArchived = left.status === "archived" ? 1 : 0;
            const rightArchived = right.status === "archived" ? 1 : 0;
            if (leftArchived !== rightArchived)
              return leftArchived - rightArchived;
            const updatedDelta = right.updated_at.localeCompare(
              left.updated_at,
            );
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
            const createdDelta = right.created_at.localeCompare(
              left.created_at,
            );
            if (createdDelta !== 0) return createdDelta;
            return right.id - left.id;
          });
      }
      if (query.includes("FROM post_metrics WHERE id")) {
        const id = Number(values[0] ?? 0);
        return postMetrics
          .filter((metric) => metric.id === id)
          .map((metric) => ({
            id: metric.id,
            campaign_id: metric.campaign_id,
          }));
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
      if (query.includes("FROM draft_generation_requests dgr")) {
        return selectDraftGenerationRequestJoin(query, values);
      }
      if (query.includes("c.status AS campaign_status")) {
        return selectDraftCandidate(values);
      }
      if (query.includes("FROM drafts d")) return selectDraftJoin(values);
      if (query.includes("FROM draft_variants")) {
        return selectDraftVariants(query, values);
      }
      if (query.includes("FROM draft_audits")) return selectDraftAudits(values);
      if (query.includes("FROM candidate_discovery_items")) {
        if (query.includes("WHERE id = $1")) {
          const id = Number(values[0] ?? 0);
          const campaignId = values.length > 1 ? Number(values[1] ?? 0) : null;
          return candidateDiscoveryItems.filter(
            (item) =>
              item.id === id &&
              (campaignId === null || item.campaign_id === campaignId),
          );
        }
        const campaignId = Number(values[0] ?? 0);
        if (query.includes("AND kind = $2")) {
          const kind = String(values[1] ?? "");
          const keyword = String(values[2] ?? "");
          const title = String(values[3] ?? "");
          return candidateDiscoveryItems.filter(
            (item) =>
              item.campaign_id === campaignId &&
              item.kind === kind &&
              item.keyword === keyword &&
              item.title === title &&
              item.status !== "dismissed",
          );
        }
        return candidateDiscoveryItems
          .filter(
            (item) =>
              item.campaign_id === campaignId && item.status !== "dismissed",
          )
          .sort((left, right) => {
            const leftPromoted = left.status === "promoted" ? 1 : 0;
            const rightPromoted = right.status === "promoted" ? 1 : 0;
            if (leftPromoted !== rightPromoted)
              return leftPromoted - rightPromoted;
            const leftConfidence = left.confidence_score ?? -1;
            const rightConfidence = right.confidence_score ?? -1;
            if (leftConfidence !== rightConfidence)
              return rightConfidence - leftConfidence;
            const updatedDelta = right.updated_at.localeCompare(
              left.updated_at,
            );
            if (updatedDelta !== 0) return updatedDelta;
            return right.id - left.id;
          });
      }
      if (query.includes("FROM candidate_posts") && query.includes("id IN")) {
        const campaignId = Number(values[0] ?? 0);
        const ids = new Set(
          values
            .slice(1)
            .filter((value): value is number => typeof value === "number"),
        );
        return candidatePosts
          .filter(
            (candidate) =>
              candidate.campaign_id === campaignId && ids.has(candidate.id),
          )
          .map((candidate) => ({ id: candidate.id, status: candidate.status }));
      }
      if (
        query.includes("FROM candidate_posts") &&
        query.includes("relevance_score IS NULL")
      ) {
        const campaignId = Number(values[0] ?? 0);
        return candidatePosts
          .filter(
            (candidate) =>
              candidate.campaign_id === campaignId &&
              candidate.status === "new" &&
              candidate.relevance_score === null,
          )
          .map((candidate) => ({ id: candidate.id }))
          .slice(0, 50);
      }
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

      if (
        normalizedQuery === "BEGIN TRANSACTION" ||
        normalizedQuery === "BEGIN IMMEDIATE"
      ) {
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

      if (query.includes("INSERT OR IGNORE INTO scheduler_settings")) {
        return { lastInsertId: 1, rowsAffected: 0 };
      }

      if (query.includes("INSERT OR IGNORE INTO app_settings")) {
        return { lastInsertId: 1, rowsAffected: 0 };
      }

      if (query.includes("UPDATE app_settings")) {
        if (query.includes("launch_on_login_enabled")) {
          appSettings.launch_on_login_enabled = Number(values[0] ?? 0);
          appSettings.launch_on_login_last_synced_at = String(values[1] ?? "");
          appSettings.launch_on_login_last_error = String(values[2] ?? "");
          appSettings.updated_at = String(values[1] ?? now);
        } else if (query.includes("launch_on_login_last_error")) {
          appSettings.launch_on_login_last_error = String(values[0] ?? "");
          appSettings.updated_at = String(values[1] ?? now);
        }
        return { lastInsertId: 1, rowsAffected: 1 };
      }

      if (query.includes("UPDATE scheduler_settings")) {
        if (query.includes("enabled")) {
          schedulerSettings.enabled = Number(
            values[0] ?? schedulerSettings.enabled,
          );
        }
        schedulerSettings.updated_at = now;
        return { lastInsertId: 1, rowsAffected: 1 };
      }

      if (query.includes("UPDATE metric_refresh_settings")) {
        if (query.includes("enabled")) {
          metricRefreshSettings.enabled = Number(
            values[0] ?? metricRefreshSettings.enabled,
          );
        }
        metricRefreshSettings.updated_at = now;
        return { lastInsertId: 1, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO scheduler_events")) {
        const event: SchedulerEvent = {
          id: nextSchedulerEventId,
          campaign_id: values[0] === null ? null : Number(values[0] ?? 0),
          approval_id: values[1] === null ? null : Number(values[1] ?? 0),
          schedule_job_id: values[2] === null ? null : Number(values[2] ?? 0),
          event_type: values[3] as SchedulerEventType,
          severity: values[4] as SchedulerEventSeverity,
          summary: String(values[5] ?? ""),
          metadata_json: String(values[6] ?? "{}"),
          created_at: now,
        };
        schedulerEvents.push(event);
        nextSchedulerEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT OR IGNORE INTO safety_settings")) {
        return { lastInsertId: 1, rowsAffected: 0 };
      }

      if (query.includes("UPDATE safety_settings")) {
        safetySettings.global_kill_switch = Number(values[0] ?? 0);
        safetySettings.kill_switch_reason = String(values[1] ?? "");
        safetySettings.updated_at = now;
        return { lastInsertId: 1, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO safety_audit_events")) {
        const event: SafetyAuditEvent = {
          id: nextSafetyAuditEventId,
          campaign_id: values[0] === null ? null : Number(values[0] ?? 0),
          subject_type: values[1] as SafetyAuditSubjectType,
          subject_id: values[2] === null ? null : Number(values[2] ?? 0),
          event_type: values[3] as SafetyAuditEventType,
          severity: values[4] as SafetyAuditSeverity,
          summary: String(values[5] ?? ""),
          metadata_json: String(values[6] ?? "{}"),
          created_at: now,
        };
        safetyAuditEvents.push(event);
        nextSafetyAuditEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO rate_limit_events")) {
        const event: RateLimitEvent = {
          id: nextRateLimitEventId,
          campaign_id: Number(values[0] ?? 0),
          action: values[1] as RateLimitAction,
          window_key: String(values[2] ?? ""),
          limit_value: Number(values[3] ?? 0),
          current_count: Number(values[4] ?? 0),
          decision: values[5] as RateLimitDecision,
          summary: String(values[6] ?? ""),
          created_at: now,
        };
        rateLimitEvents.push(event);
        nextRateLimitEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO error_queue_items")) {
        const item: ErrorQueueItem = {
          id: nextErrorQueueItemId,
          campaign_id: values[0] === null ? null : Number(values[0] ?? 0),
          source_type: values[1] as ErrorQueueSourceType,
          source_id: values[2] === null ? null : Number(values[2] ?? 0),
          title: String(values[3] ?? ""),
          detail: String(values[4] ?? ""),
          severity: values[5] as ErrorQueueSeverity,
          status: "open",
          resolution_notes: "",
          created_at: now,
          updated_at: now,
        };
        errorQueueItems.push(item);
        nextErrorQueueItemId += 1;
        return { lastInsertId: item.id, rowsAffected: 1 };
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
            source: (values[2] as Keyword["source"] | undefined) ?? "manual",
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
          platform_resource_urn: String(values[4] ?? ""),
          posted_at: values[5] === null ? null : String(values[5] ?? ""),
          content: String(values[6] ?? ""),
          content_hash: String(values[7] ?? ""),
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

      if (query.includes("INSERT INTO candidate_discovery_items")) {
        const discoveryItem: CandidateDiscoveryItem = {
          id: nextCandidateDiscoveryItemId,
          campaign_id: Number(values[0] ?? 0),
          agent_run_id: values[1] === null ? null : Number(values[1] ?? 0),
          workflow_run_id: values[2] === null ? null : Number(values[2] ?? 0),
          kind: values[3] as CandidateDiscoveryItem["kind"],
          title: String(values[4] ?? ""),
          keyword: String(values[5] ?? ""),
          rationale: String(values[6] ?? ""),
          source_keyword: String(values[7] ?? ""),
          confidence_score: values[8] === null ? null : Number(values[8] ?? 0),
          status: "suggested",
          created_at: now,
          updated_at: now,
        };
        candidateDiscoveryItems.push(discoveryItem);
        nextCandidateDiscoveryItemId += 1;
        return { lastInsertId: discoveryItem.id, rowsAffected: 1 };
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

      if (query.includes("INSERT INTO draft_generation_requests")) {
        const request: DraftGenerationRequest = {
          id: nextDraftGenerationRequestId,
          campaign_id: Number(values[0] ?? 0),
          candidate_post_id: Number(values[1] ?? 0),
          agent_run_id: values[2] === null ? null : Number(values[2] ?? 0),
          provider_key: values[3] as AgentProviderKey,
          model_name: String(values[4] ?? ""),
          playbook_key: values[5] as AgentPlaybookKey | "",
          variant_count: Number(values[6] ?? 3),
          angle: String(values[7] ?? ""),
          voice_notes: String(values[8] ?? ""),
          status: "pending",
          summary: "",
          generated_variants_json: "[]",
          error_message: "",
          created_draft_id: null,
          created_at: now,
          updated_at: now,
        };
        draftGenerationRequests.push(request);
        nextDraftGenerationRequestId += 1;
        return { lastInsertId: request.id, rowsAffected: 1 };
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
          attempt_count: 0,
          max_attempts: 3,
          next_attempt_at: null,
          last_attempted_at: null,
          last_error: "",
          locked_at: null,
          locked_by: null,
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

      if (query.includes("INSERT INTO content_calendar_slots")) {
        const approvalId = Number(values[1] ?? 0);
        if (
          contentCalendarSlots.some((slot) => slot.approval_id === approvalId)
        ) {
          throw new Error(
            "UNIQUE constraint failed: content_calendar_slots.approval_id",
          );
        }
        const slot: ContentCalendarSlot = {
          id: nextContentCalendarSlotId,
          campaign_id: Number(values[0] ?? 0),
          approval_id: approvalId,
          purpose: values[2] as ContentCalendarPurpose,
          slot_for: String(values[3] ?? ""),
          timezone: String(values[4] ?? "local"),
          format: values[5] as ContentCalendarFormat,
          angle: String(values[6] ?? ""),
          visual_direction: String(values[7] ?? ""),
          cta: String(values[8] ?? ""),
          notes: String(values[9] ?? ""),
          status: "planned",
          created_at: now,
          updated_at: now,
        };
        contentCalendarSlots.push(slot);
        nextContentCalendarSlotId += 1;
        return { lastInsertId: slot.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO comment_threads")) {
        const thread: CommentThread = {
          id: nextCommentThreadId,
          campaign_id: Number(values[0] ?? 0),
          candidate_post_id: Number(values[1] ?? 0),
          status: "drafting",
          operator_notes: String(values[2] ?? ""),
          reviewer_notes: "",
          approved_at: null,
          rejected_at: null,
          posted_at: null,
          created_at: now,
          updated_at: now,
        };
        commentThreads.push(thread);
        nextCommentThreadId += 1;
        return { lastInsertId: thread.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO comment_variants")) {
        const variant: CommentVariant = {
          id: nextCommentVariantId,
          comment_thread_id: Number(values[0] ?? 0),
          variant_number: Number(values[1] ?? 1),
          body: String(values[2] ?? ""),
          status: "draft",
          created_at: now,
          updated_at: now,
        };
        commentVariants.push(variant);
        nextCommentVariantId += 1;
        return { lastInsertId: variant.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO comment_audits")) {
        const audit: CommentAudit = {
          id: nextCommentAuditId,
          comment_variant_id: Number(values[0] ?? 0),
          rule_key: String(values[1] ?? ""),
          severity: values[2] as CommentAuditSeverity,
          message: String(values[3] ?? ""),
          created_at: now,
        };
        commentAudits.push(audit);
        nextCommentAuditId += 1;
        return { lastInsertId: audit.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO comment_attempts")) {
        const attempt: CommentAttempt = {
          id: nextCommentAttemptId,
          comment_thread_id: Number(values[0] ?? 0),
          platform: "linkedin",
          status: values[1] as CommentAttemptStatus,
          external_comment_url: String(values[2] ?? ""),
          platform_comment_id: String(values[3] ?? ""),
          idempotency_key: String(values[4] ?? ""),
          error_message: String(values[5] ?? ""),
          created_at: now,
        };
        commentAttempts.push(attempt);
        nextCommentAttemptId += 1;
        return { lastInsertId: attempt.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO post_metrics")) {
        const apiSource = query.includes("linkedin_social_metadata");
        const metric: PostMetric = apiSource
          ? {
              id: nextPostMetricId,
              campaign_id: Number(values[0] ?? 0),
              approval_id: Number(values[1] ?? 0),
              publish_attempt_id:
                values[2] === null ? null : Number(values[2] ?? 0),
              platform: "linkedin",
              measured_at: now,
              impressions: 0,
              reactions: Number(values[3] ?? 0),
              comments: Number(values[4] ?? 0),
              reposts: 0,
              profile_visits: 0,
              link_clicks: 0,
              ctr: null,
              notes: String(values[5] ?? ""),
              collection_source: "linkedin_social_metadata",
              raw_payload_json: String(values[6] ?? "{}"),
              created_at: now,
              updated_at: now,
            }
          : {
              id: nextPostMetricId,
              campaign_id: Number(values[0] ?? 0),
              approval_id: Number(values[1] ?? 0),
              publish_attempt_id:
                values[2] === null ? null : Number(values[2] ?? 0),
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
              collection_source: "manual",
              raw_payload_json: "",
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

      if (query.includes("INSERT INTO agent_playbook_overrides")) {
        const key = String(values[0] ?? "");
        const customInstructions = String(values[2] ?? "");
        assertValidAgentPlaybookKey(key);
        assertValidCustomInstructions(customInstructions);
        const existing = agentPlaybookOverrides.find(
          (override) => override.playbook_key === key,
        );
        if (existing) {
          existing.enabled = Number(values[1] ?? 1);
          existing.custom_instructions = customInstructions;
          existing.updated_at = now;
        } else {
          agentPlaybookOverrides.push({
            playbook_key: key,
            enabled: Number(values[1] ?? 1),
            custom_instructions: customInstructions,
            updated_at: now,
          });
        }
        return { lastInsertId: 0, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO agent_runs")) {
        const playbookKey = String(values[6] ?? "");
        assertValidAgentRunPlaybookKey(playbookKey);
        const run: AgentRun = {
          id: nextAgentRunId,
          campaign_id: Number(values[0] ?? 0),
          workflow_run_id: values[1] === null ? null : Number(values[1] ?? 0),
          workflow_step_id: values[2] === null ? null : Number(values[2] ?? 0),
          agent_role: values[3] as AgentRole,
          provider_key: values[4] as AgentProviderKey,
          model_name: String(values[5] ?? ""),
          playbook_key: playbookKey,
          status: "queued",
          input_summary: String(values[7] ?? ""),
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

      if (query.includes("INSERT INTO workflow_artifacts")) {
        const existing = workflowArtifacts.find(
          (artifact) =>
            artifact.workflow_run_id === Number(values[0] ?? 0) &&
            artifact.artifact_type === values[2] &&
            artifact.artifact_id === Number(values[3] ?? 0),
        );
        if (existing) {
          existing.workflow_step_id =
            values[1] === null ? null : Number(values[1] ?? 0);
          existing.summary = String(values[4] ?? "");
          existing.updated_at = now;
          return { lastInsertId: existing.id, rowsAffected: 1 };
        }
        const artifact: WorkflowArtifact = {
          id: nextWorkflowArtifactId,
          workflow_run_id: Number(values[0] ?? 0),
          workflow_step_id: values[1] === null ? null : Number(values[1] ?? 0),
          artifact_type: values[2] as "agent_run",
          artifact_id: Number(values[3] ?? 0),
          summary: String(values[4] ?? ""),
          created_at: now,
          updated_at: now,
        };
        workflowArtifacts.push(artifact);
        nextWorkflowArtifactId += 1;
        return { lastInsertId: artifact.id, rowsAffected: 1 };
      }

      if (query.includes("UPDATE draft_generation_requests")) {
        const id = Number(values[values.length - 1] ?? 0);
        const request = draftGenerationRequests.find((row) => row.id === id);
        if (!request) return { lastInsertId: 0, rowsAffected: 0 };
        if (query.includes("status = 'generated'")) {
          request.status = "generated";
          request.summary = String(values[0] ?? "");
          request.generated_variants_json = String(values[1] ?? "[]");
          request.error_message = "";
        } else if (query.includes("status = 'failed'")) {
          request.status = "failed";
          request.error_message = String(values[0] ?? "");
        } else if (query.includes("status = 'saved'")) {
          request.status = "saved";
          request.created_draft_id = Number(values[0] ?? 0);
        } else if (query.includes("status = 'dismissed'")) {
          request.status = "dismissed";
        }
        request.updated_at = now;
        return { lastInsertId: 0, rowsAffected: 1 };
      }

      if (query.includes("UPDATE agent_runs")) {
        const literalRunning = query.includes("status = 'running'");
        const literalCancelled = query.includes("status = 'cancelled'");
        const id =
          literalRunning || literalCancelled
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
        const id = literalRunning
          ? Number(values[0] ?? 0)
          : Number(values[3] ?? 0);
        const step = workflowSteps.find((row) => row.id === id);
        if (step) {
          const status = literalRunning
            ? "running"
            : (values[0] as WorkflowStepStatus);
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

      if (query.includes("UPDATE comment_threads")) {
        const id = Number(values.at(-1) ?? 0);
        const thread = commentThreads.find((row) => row.id === id);
        if (thread) {
          if (query.includes("status = 'posted'")) {
            thread.status = "posted";
            thread.posted_at = now;
          } else if (
            query.includes(
              "status = CASE WHEN status IN ('needs_review', 'approved')",
            )
          ) {
            if (["needs_review", "approved"].includes(thread.status)) {
              thread.status = "changes_requested";
            }
          } else if (query.includes("status = $1")) {
            thread.status = values[0] as CommentThreadStatus;
            if (query.includes("reviewer_notes")) {
              const reviewerNotes = values[1];
              if (reviewerNotes !== null && reviewerNotes !== undefined) {
                thread.reviewer_notes = String(reviewerNotes);
              }
            }
            if (thread.status === "approved") {
              thread.approved_at = now;
            }
            if (thread.status === "rejected") {
              thread.rejected_at = now;
            }
          } else {
            const columns = parseUpdateColumns(query, "comment_threads");
            columns.forEach((column, index) => {
              const value = values[index];
              if (column === "operator_notes")
                thread.operator_notes = String(value ?? "");
              if (column === "reviewer_notes")
                thread.reviewer_notes = String(value ?? "");
              if (column === "status")
                thread.status = value as CommentThreadStatus;
            });
          }
          thread.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE comment_variants")) {
        if (query.includes("WHERE comment_thread_id = $1 AND id <> $2")) {
          const threadId = Number(values[0] ?? 0);
          const excludedId = Number(values[1] ?? 0);
          let rowsAffected = 0;
          for (const variant of commentVariants) {
            if (
              variant.comment_thread_id === threadId &&
              variant.id !== excludedId
            ) {
              variant.status = "draft";
              variant.updated_at = now;
              rowsAffected += 1;
            }
          }
          return { lastInsertId: 0, rowsAffected };
        }
        const id = Number(values.at(-1) ?? 0);
        const variant = commentVariants.find((row) => row.id === id);
        if (variant) {
          if (query.includes("status = 'selected'")) {
            variant.status = "selected";
          } else {
            const columns = parseUpdateColumns(query, "comment_variants");
            columns.forEach((column, index) => {
              const value = values[index];
              if (column === "body") variant.body = String(value ?? "");
              if (column === "status")
                variant.status = value as CommentVariantStatus;
            });
          }
          variant.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
      }

      if (query.includes("UPDATE content_calendar_slots")) {
        const id = Number(values.at(-1) ?? 0);
        const slot = contentCalendarSlots.find((row) => row.id === id);
        if (slot) {
          if (query.includes("status = 'archived'")) {
            slot.status = "archived";
          } else {
            slot.purpose = values[0] as ContentCalendarPurpose;
            slot.slot_for = String(values[1] ?? "");
            slot.timezone = String(values[2] ?? "local");
            slot.format = values[3] as ContentCalendarFormat;
            slot.angle = String(values[4] ?? "");
            slot.visual_direction = String(values[5] ?? "");
            slot.cta = String(values[6] ?? "");
            slot.notes = String(values[7] ?? "");
          }
          slot.updated_at = now;
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

      if (query.includes("UPDATE error_queue_items")) {
        const id = Number(values.at(-1) ?? 0);
        const item = errorQueueItems.find((row) => row.id === id);
        if (item) {
          if (query.includes("status = $1")) {
            item.status = values[0] as ErrorQueueStatus;
            item.resolution_notes = String(values[1] ?? "");
          } else {
            item.campaign_id =
              values[0] === null ? null : Number(values[0] ?? 0);
            item.title = String(values[1] ?? item.title);
            item.detail = String(values[2] ?? item.detail);
            item.severity = values[3] as ErrorQueueSeverity;
          }
          item.updated_at = now;
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

      if (
        query.includes("UPDATE candidate_posts") &&
        query.includes("score_reason") &&
        query.includes("CASE")
      ) {
        const score = Number(values[0] ?? 0);
        const rationale = String(values[1] ?? "");
        const autoReject = Number(values[2] ?? 0) === 1;
        const minimumScore = Number(values[3] ?? 0);
        const candidateId = Number(values[4] ?? 0);
        const campaignId = Number(values[5] ?? 0);
        const candidate = candidatePosts.find(
          (row) => row.id === candidateId && row.campaign_id === campaignId,
        );
        if (!candidate) return { lastInsertId: candidateId, rowsAffected: 0 };
        candidate.relevance_score = score;
        candidate.score_reason = rationale;
        if (autoReject && candidate.status === "new" && score < minimumScore) {
          candidate.status = "rejected";
        }
        candidate.updated_at = now;
        return { lastInsertId: candidateId, rowsAffected: 1 };
      }

      if (query.includes("UPDATE candidate_discovery_items")) {
        if (w.__LINKGO_FAIL_DISCOVERY_STATUS_UPDATE__) {
          w.__LINKGO_FAIL_DISCOVERY_STATUS_UPDATE__ = undefined;
          throw new Error("Injected discovery status update failure");
        }
        const id = Number(values[0] ?? 0);
        const campaignId = Number(values[1] ?? 0);
        const discoveryItem = candidateDiscoveryItems.find(
          (item) => item.id === id && item.campaign_id === campaignId,
        );
        if (!discoveryItem) return { lastInsertId: id, rowsAffected: 0 };
        if (query.includes("status = 'promoted'"))
          discoveryItem.status = "promoted";
        if (query.includes("status = 'dismissed'"))
          discoveryItem.status = "dismissed";
        discoveryItem.updated_at = now;
        return { lastInsertId: id, rowsAffected: 1 };
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

      if (query.includes("DELETE FROM comment_audits")) {
        const variantId = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          commentAudits,
          (audit) => audit.comment_variant_id === variantId,
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM comment_variants")) {
        const threadId = Number(values[0] ?? 0);
        const removedVariantIds = commentVariants
          .filter((variant) => variant.comment_thread_id === threadId)
          .map((variant) => variant.id);
        const rowsAffected = removeRows(
          commentVariants,
          (variant) => variant.comment_thread_id === threadId,
        );
        removeRows(commentAudits, (audit) =>
          removedVariantIds.includes(audit.comment_variant_id),
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM comment_threads")) {
        const id = Number(values[0] ?? 0);
        const removedVariantIds = commentVariants
          .filter((variant) => variant.comment_thread_id === id)
          .map((variant) => variant.id);
        const rowsAffected = removeRows(commentThreads, (row) => row.id === id);
        removeRows(
          commentVariants,
          (variant) => variant.comment_thread_id === id,
        );
        removeRows(commentAudits, (audit) =>
          removedVariantIds.includes(audit.comment_variant_id),
        );
        removeRows(
          commentAttempts,
          (attempt) => attempt.comment_thread_id === id,
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
        const removedCommentThreadIds = commentThreads
          .filter((thread) => thread.candidate_post_id === id)
          .map((thread) => thread.id);
        const removedCommentVariantIds = commentVariants
          .filter((variant) =>
            removedCommentThreadIds.includes(variant.comment_thread_id),
          )
          .map((variant) => variant.id);
        removeRows(commentThreads, (thread) => thread.candidate_post_id === id);
        removeRows(commentVariants, (variant) =>
          removedCommentThreadIds.includes(variant.comment_thread_id),
        );
        removeRows(commentAudits, (audit) =>
          removedCommentVariantIds.includes(audit.comment_variant_id),
        );
        removeRows(commentAttempts, (attempt) =>
          removedCommentThreadIds.includes(attempt.comment_thread_id),
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
        const removedCommentThreadIds = commentThreads
          .filter((thread) => thread.campaign_id === id)
          .map((thread) => thread.id);
        const removedCommentVariantIds = commentVariants
          .filter((variant) =>
            removedCommentThreadIds.includes(variant.comment_thread_id),
          )
          .map((variant) => variant.id);
        removeRows(commentThreads, (thread) => thread.campaign_id === id);
        removeRows(commentVariants, (variant) =>
          removedCommentThreadIds.includes(variant.comment_thread_id),
        );
        removeRows(commentAudits, (audit) =>
          removedCommentVariantIds.includes(audit.comment_variant_id),
        );
        removeRows(commentAttempts, (attempt) =>
          removedCommentThreadIds.includes(attempt.comment_thread_id),
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

    function recordSchedulerEvent(
      event_type: SchedulerEventType,
      summary: string,
      options: {
        campaignId?: number | null;
        approvalId?: number | null;
        scheduleJobId?: number | null;
        severity?: SchedulerEventSeverity;
        metadata?: unknown;
      } = {},
    ): void {
      schedulerEvents.push({
        id: nextSchedulerEventId,
        campaign_id: options.campaignId ?? null,
        approval_id: options.approvalId ?? null,
        schedule_job_id: options.scheduleJobId ?? null,
        event_type,
        severity: options.severity ?? "info",
        summary,
        metadata_json: JSON.stringify(options.metadata ?? {}),
        created_at: getNow(),
      });
      nextSchedulerEventId += 1;
    }

    function schedulerStatusPayload(): Record<string, unknown> {
      return {
        enabled: schedulerSettings.enabled === 1,
        running: schedulerRunning,
        runnerId: schedulerRunning ? "mock-runner" : null,
        settings: {
          enabled: schedulerSettings.enabled === 1,
          pollIntervalSeconds: schedulerSettings.poll_interval_seconds,
          maxJobsPerTick: schedulerSettings.max_jobs_per_tick,
          retryBackoffMinutes: schedulerSettings.retry_backoff_minutes,
          updatedAt: schedulerSettings.updated_at,
        },
      };
    }

    function publishSchedulerJob(
      job: ScheduleJob,
    ): "published" | "retry" | "failed" | "blocked" {
      const approval = scheduleApproval(job);
      const campaign = scheduleCampaign(job);
      if (!approval || !campaign) return "failed";
      if (safetySettings.global_kill_switch === 1) {
        recordSchedulerEvent(
          "job_blocked",
          "Scheduler skipped a due job because the global kill switch is enabled.",
          {
            campaignId: approval.campaign_id,
            approvalId: approval.id,
            scheduleJobId: job.id,
            severity: "warning",
          },
        );
        return "blocked";
      }

      job.attempt_count += 1;
      job.last_attempted_at = getNow();
      job.locked_at = getNow();
      job.locked_by = "mock-runner";
      recordSchedulerEvent(
        "job_claimed",
        "Scheduler claimed a due LinkedIn post.",
        {
          campaignId: approval.campaign_id,
          approvalId: approval.id,
          scheduleJobId: job.id,
        },
      );

      const publishInvokes = Number(w.__LINKGO_LINKEDIN_PUBLISH_INVOKES__ ?? 0);
      w.__LINKGO_LINKEDIN_PUBLISH_INVOKES__ = publishInvokes + 1;
      const error = w.__LINKGO_LINKEDIN_PUBLISH_ERROR__;
      if (typeof error === "string" && error.trim() !== "") {
        const redacted = error;
        publishAttempts.push({
          id: nextPublishAttemptId,
          approval_id: approval.id,
          schedule_job_id: job.id,
          platform: "linkedin",
          status: "failed",
          external_post_url: "",
          platform_post_id: "",
          error_message: redacted,
          created_at: getNow(),
        });
        nextPublishAttemptId += 1;
        safetyAuditEvents.push({
          id: nextSafetyAuditEventId,
          campaign_id: approval.campaign_id,
          subject_type: "schedule_job",
          subject_id: job.id,
          event_type: "publish_failed",
          severity: "warning",
          summary:
            job.attempt_count >= job.max_attempts
              ? "Scheduled LinkedIn publish failed permanently."
              : "Scheduled LinkedIn publish failed and will retry.",
          metadata_json: JSON.stringify({ attemptCount: job.attempt_count }),
          created_at: getNow(),
        });
        nextSafetyAuditEventId += 1;
        job.last_error = redacted;
        job.locked_at = null;
        job.locked_by = null;
        job.updated_at = getNow();
        if (
          job.attempt_count >= job.max_attempts ||
          w.__LINKGO_SCHEDULER_FORCE_TERMINAL_FAILURE__ === true
        ) {
          job.status = "failed";
          approval.status = "approved";
          approval.updated_at = getNow();
          errorQueueItems.push({
            id: nextErrorQueueItemId,
            campaign_id: approval.campaign_id,
            source_type: "schedule_job",
            source_id: job.id,
            title: "Scheduled publish failed",
            detail: redacted,
            severity: "error",
            status: "open",
            resolution_notes: "",
            created_at: getNow(),
            updated_at: getNow(),
          });
          nextErrorQueueItemId += 1;
          recordSchedulerEvent(
            "job_failed",
            "Scheduled LinkedIn publish failed permanently.",
            {
              campaignId: approval.campaign_id,
              approvalId: approval.id,
              scheduleJobId: job.id,
              severity: "error",
              metadata: { attemptCount: job.attempt_count },
            },
          );
          return "failed";
        }
        job.next_attempt_at = new Date(
          Date.now() +
            schedulerSettings.retry_backoff_minutes *
              job.attempt_count *
              60_000,
        ).toISOString();
        recordSchedulerEvent(
          "job_retry_scheduled",
          "Scheduled LinkedIn publish failed and will retry.",
          {
            campaignId: approval.campaign_id,
            approvalId: approval.id,
            scheduleJobId: job.id,
            severity: "warning",
            metadata: { attemptCount: job.attempt_count },
          },
        );
        return "retry";
      }

      const platformPostId = `urn:li:ugcPost:test-${approval.id}`;
      publishAttempts.push({
        id: nextPublishAttemptId,
        approval_id: approval.id,
        schedule_job_id: job.id,
        platform: "linkedin",
        status: "succeeded",
        external_post_url: `https://www.linkedin.com/feed/update/${platformPostId}/`,
        platform_post_id: platformPostId,
        error_message: "",
        created_at: getNow(),
      });
      nextPublishAttemptId += 1;
      approval.status = "published";
      approval.updated_at = getNow();
      job.status = "completed";
      job.last_error = "";
      job.locked_at = null;
      job.locked_by = null;
      job.updated_at = getNow();
      safetyAuditEvents.push({
        id: nextSafetyAuditEventId,
        campaign_id: approval.campaign_id,
        subject_type: "schedule_job",
        subject_id: job.id,
        event_type: "publish_succeeded",
        severity: "info",
        summary: "Scheduled LinkedIn post was published.",
        metadata_json: JSON.stringify({ platformPostId }),
        created_at: getNow(),
      });
      nextSafetyAuditEventId += 1;
      recordSchedulerEvent(
        "job_published",
        "Scheduled LinkedIn post was published.",
        {
          campaignId: approval.campaign_id,
          approvalId: approval.id,
          scheduleJobId: job.id,
          metadata: { platformPostId },
        },
      );
      return "published";
    }

    function runSchedulerTickMock(): Record<string, number> {
      const result = {
        claimed: 0,
        published: 0,
        retryScheduled: 0,
        failed: 0,
        blocked: 0,
      };
      recordSchedulerEvent("tick_started", "Scheduler tick started.");
      const dueJobs = scheduleJobs
        .filter(isDueSchedulerJob)
        .slice(0, schedulerSettings.max_jobs_per_tick);
      for (const job of dueJobs) {
        const outcome = publishSchedulerJob(job);
        if (outcome !== "blocked") result.claimed += 1;
        if (outcome === "published") result.published += 1;
        if (outcome === "retry") result.retryScheduled += 1;
        if (outcome === "failed") result.failed += 1;
        if (outcome === "blocked") result.blocked += 1;
      }
      recordSchedulerEvent("tick_completed", "Scheduler tick completed.", {
        metadata: result,
      });
      return result;
    }

    function metricRefreshStatusPayload(): Record<string, unknown> {
      return {
        enabled: metricRefreshSettings.enabled === 1,
        running: metricRefreshRunning,
        runnerId: metricRefreshRunning ? "mock-metric-refresh" : null,
        settings: {
          enabled: metricRefreshSettings.enabled === 1,
          pollIntervalMinutes: metricRefreshSettings.poll_interval_minutes,
          maxJobsPerTick: metricRefreshSettings.max_jobs_per_tick,
          refreshIntervalHours: metricRefreshSettings.refresh_interval_hours,
          retryBackoffMinutes: metricRefreshSettings.retry_backoff_minutes,
          updatedAt: metricRefreshSettings.updated_at,
        },
      };
    }

    function resolveMockLinkedInUrn(value: string): string {
      const decoded = decodeURIComponent(value || "");
      const direct = decoded.match(
        /urn:li:(?:ugcPost|share|activity):[A-Za-z0-9_-]+/u,
      )?.[0];
      if (direct) return direct;
      const activity = decoded.match(/activity[-:](\d+)/u)?.[1];
      return activity ? `urn:li:activity:${activity}` : "";
    }

    function recordMetricRefreshEvent(
      event_type: MetricRefreshEvent["event_type"],
      summary: string,
      options: {
        campaignId?: number | null;
        approvalId?: number | null;
        jobId?: number | null;
        postMetricId?: number | null;
        severity?: MetricRefreshEvent["severity"];
        metadata?: unknown;
      } = {},
    ): void {
      metricRefreshEvents.push({
        id: nextMetricRefreshEventId,
        campaign_id: options.campaignId ?? null,
        approval_id: options.approvalId ?? null,
        metric_refresh_job_id: options.jobId ?? null,
        post_metric_id: options.postMetricId ?? null,
        event_type,
        severity: options.severity ?? "info",
        summary,
        metadata_json: JSON.stringify(options.metadata ?? {}),
        created_at: getNow(),
      });
      nextMetricRefreshEventId += 1;
    }

    function seedMetricRefreshJobs(): number {
      let seeded = 0;
      for (const approval of approvals.filter(
        (item) => item.status === "published",
      )) {
        const campaign = campaigns.find(
          (item) => item.id === approval.campaign_id,
        );
        const attempt = getLatestSuccessfulPublishAttempt(approval.id);
        if (!campaign || campaign.status === "archived" || !attempt) continue;
        if (metricRefreshJobs.some((job) => job.approval_id === approval.id))
          continue;
        const targetUrn =
          resolveMockLinkedInUrn(attempt.platform_post_id) ||
          resolveMockLinkedInUrn(attempt.external_post_url);
        const job: MetricRefreshJob = {
          id: nextMetricRefreshJobId,
          campaign_id: approval.campaign_id,
          approval_id: approval.id,
          publish_attempt_id: attempt.id,
          platform: "linkedin",
          target_urn: targetUrn,
          status: targetUrn ? "active" : "unavailable",
          next_refresh_at: getNow(),
          last_refreshed_at: null,
          last_attempted_at: null,
          attempt_count: 0,
          max_attempts: 3,
          failure_count: 0,
          last_error: targetUrn
            ? ""
            : "LinkedIn target URN could not be resolved",
          locked_at: null,
          locked_by: null,
          created_at: getNow(),
          updated_at: getNow(),
        };
        metricRefreshJobs.push(job);
        nextMetricRefreshJobId += 1;
        seeded += 1;
        if (!targetUrn) {
          recordMetricRefreshEvent(
            "refresh_unavailable",
            "Metric refresh is unavailable because no LinkedIn target URN could be resolved.",
            {
              campaignId: job.campaign_id,
              approvalId: job.approval_id,
              jobId: job.id,
              severity: "warning",
            },
          );
        }
      }
      return seeded;
    }

    function runMetricRefreshTickMock(): Record<string, number> {
      const result = {
        claimed: 0,
        refreshed: 0,
        retryScheduled: 0,
        unavailable: 0,
        failed: 0,
        blocked: 0,
        seeded: 0,
      };
      recordMetricRefreshEvent("tick_started", "Metric refresh tick started.");
      result.seeded = seedMetricRefreshJobs();
      const dueJobs = metricRefreshJobs
        .filter((job) => job.status === "active")
        .slice(0, metricRefreshSettings.max_jobs_per_tick);
      if (safetySettings.global_kill_switch === 1) {
        for (const job of dueJobs) {
          result.blocked += 1;
          recordMetricRefreshEvent(
            "refresh_blocked",
            "Metric refresh skipped: Global kill switch is enabled",
            {
              campaignId: job.campaign_id,
              approvalId: job.approval_id,
              jobId: job.id,
              severity: "warning",
            },
          );
        }
        return result;
      }
      for (const job of dueJobs) {
        job.attempt_count += 1;
        job.last_attempted_at = getNow();
        result.claimed += 1;
        recordMetricRefreshEvent(
          "refresh_started",
          "Metric refresh job started.",
          {
            campaignId: job.campaign_id,
            approvalId: job.approval_id,
            jobId: job.id,
          },
        );
        const forcedUnavailable =
          w.__LINKGO_METRIC_REFRESH_UNAVAILABLE__ === true;
        if (forcedUnavailable || !job.target_urn) {
          job.status = "unavailable";
          job.last_error = "LinkedIn target URN could not be resolved";
          result.unavailable += 1;
          recordMetricRefreshEvent("refresh_unavailable", job.last_error, {
            campaignId: job.campaign_id,
            approvalId: job.approval_id,
            jobId: job.id,
            severity: "warning",
          });
          continue;
        }
        const reactions = Number(w.__LINKGO_METRIC_REFRESH_REACTIONS__ ?? 42);
        const comments = Number(w.__LINKGO_METRIC_REFRESH_COMMENTS__ ?? 7);
        const metric: PostMetric = {
          id: nextPostMetricId,
          campaign_id: job.campaign_id,
          approval_id: job.approval_id,
          publish_attempt_id: job.publish_attempt_id,
          platform: "linkedin",
          measured_at: getNow(),
          impressions: 0,
          reactions,
          comments,
          reposts: 0,
          profile_visits: 0,
          link_clicks: 0,
          ctr: null,
          notes:
            "LinkedIn social metadata API snapshot: reactions and comments only. Impressions, reposts, profile visits, link clicks, and CTR remain manual-only for member posts.",
          collection_source: "linkedin_social_metadata",
          raw_payload_json: JSON.stringify({
            likesSummary: { totalLikes: reactions },
            commentsSummary: { totalFirstLevelComments: comments },
          }),
          created_at: getNow(),
          updated_at: getNow(),
        };
        postMetrics.push(metric);
        nextPostMetricId += 1;
        learningEvents.push({
          id: nextLearningEventId,
          campaign_id: job.campaign_id,
          post_metric_id: metric.id,
          campaign_memory_id: null,
          event_type: "metric_recorded",
          summary: `LinkedIn social metadata recorded for approval #${job.approval_id}`,
          created_at: getNow(),
        });
        nextLearningEventId += 1;
        job.last_refreshed_at = getNow();
        job.next_refresh_at = new Date(
          Date.now() + metricRefreshSettings.refresh_interval_hours * 3_600_000,
        ).toISOString();
        job.last_error = "";
        job.updated_at = getNow();
        result.refreshed += 1;
        recordMetricRefreshEvent(
          "refresh_completed",
          "LinkedIn social metadata refresh completed.",
          {
            campaignId: job.campaign_id,
            approvalId: job.approval_id,
            jobId: job.id,
            postMetricId: metric.id,
            metadata: { reactions, comments },
          },
        );
      }
      recordMetricRefreshEvent(
        "tick_completed",
        "Metric refresh tick completed.",
        { metadata: result },
      );
      return result;
    }

    w.__LINKGO_SQL_AGENT_TOOL_CALLS__ = () => cloneRows(agentToolCalls);
    w.__LINKGO_SQL_AGENT_RUNS__ = () => cloneRows(agentRuns);
    w.__LINKGO_SQL_WORKFLOW_ARTIFACTS__ = () => cloneRows(workflowArtifacts);
    w.__LINKGO_SQL_PLAYBOOK_OVERRIDES__ = () =>
      cloneRows(agentPlaybookOverrides);
    w.__LINKGO_SQL_KEYWORDS__ = () => cloneRows(keywords);
    w.__LINKGO_SQL_CANDIDATE_POSTS__ = () => cloneRows(candidatePosts);
    w.__LINKGO_SQL_CANDIDATE_DISCOVERY_ITEMS__ = () =>
      cloneRows(candidateDiscoveryItems);
    w.__LINKGO_SQL_CONTENT_CALENDAR_SLOTS__ = () =>
      cloneRows(contentCalendarSlots);
    w.__LINKGO_SQL_COMMENT_THREADS__ = () => cloneRows(commentThreads);
    w.__LINKGO_SQL_COMMENT_VARIANTS__ = () => cloneRows(commentVariants);
    w.__LINKGO_SQL_COMMENT_AUDITS__ = () => cloneRows(commentAudits);
    w.__LINKGO_SQL_COMMENT_ATTEMPTS__ = () => cloneRows(commentAttempts);
    w.__LINKGO_SQL_SAFETY_SETTINGS__ = () => ({ ...safetySettings });
    w.__LINKGO_SQL_SAFETY_AUDIT_EVENTS__ = () => cloneRows(safetyAuditEvents);
    w.__LINKGO_SQL_RATE_LIMIT_EVENTS__ = () => cloneRows(rateLimitEvents);
    w.__LINKGO_SQL_ERROR_QUEUE_ITEMS__ = () => cloneRows(errorQueueItems);
    w.__LINKGO_SQL_SCHEDULE_JOBS__ = () => cloneRows(scheduleJobs);
    w.__LINKGO_SQL_PUBLISH_ATTEMPTS__ = () => cloneRows(publishAttempts);
    w.__LINKGO_SQL_SCHEDULER_SETTINGS__ = () => ({ ...schedulerSettings });
    w.__LINKGO_SQL_SCHEDULER_EVENTS__ = () => cloneRows(schedulerEvents);
    w.__LINKGO_SQL_APP_SETTINGS__ = () => ({ ...appSettings });

    w.__LINKGO_SQL_STATE_COUNTS__ = () => ({
      campaigns: campaigns.length,
      keywords: keywords.length,
      targetPosts: targetPosts.length,
      candidatePosts: candidatePosts.length,
      dedupeKeys: dedupeKeys.length,
      candidateDiscoveryItems: candidateDiscoveryItems.length,
      drafts: drafts.length,
      draftVariants: draftVariants.length,
      draftAudits: draftAudits.length,
      approvals: approvals.length,
      scheduleJobs: scheduleJobs.length,
      publishAttempts: publishAttempts.length,
      contentCalendarSlots: contentCalendarSlots.length,
      commentThreads: commentThreads.length,
      commentVariants: commentVariants.length,
      commentAudits: commentAudits.length,
      commentAttempts: commentAttempts.length,
      postMetrics: postMetrics.length,
      campaignMemory: campaignMemory.length,
      learningEvents: learningEvents.length,
      workflowRuns: workflowRuns.length,
      workflowSteps: workflowSteps.length,
      workflowEvents: workflowEvents.length,
      workflowArtifacts: workflowArtifacts.length,
      agentRuns: agentRuns.length,
      agentToolCalls: agentToolCalls.length,
      agentRunEvents: agentRunEvents.length,
      playbookOverrides: agentPlaybookOverrides.length,
      safetySettings: 1,
      safetyAuditEvents: safetyAuditEvents.length,
      rateLimitEvents: rateLimitEvents.length,
      errorQueueItems: errorQueueItems.length,
      schedulerEvents: schedulerEvents.length,
    });

    const authProviders = [
      [
        "anthropic",
        "Anthropic",
        "claude-sonnet-4-6",
        "Anthropic API key or OAuth token",
      ],
      ["xiaomi", "Xiaomi (MiMo)", "MiMo-VL-7B-RL", "Xiaomi MiMo API key"],
      ["openai", "OpenAI", "gpt-4.1-mini", "OpenAI API key"],
      [
        "gemini",
        "Gemini",
        "gemini-2.5-flash",
        "Gemini Code Assist access token",
      ],
      ["glm", "Z.AI (GLM)", "glm-4.7", "Z.AI / GLM API key"],
      ["moonshot", "Moonshot", "kimi-k2-0711-preview", "Moonshot API key"],
      ["deepseek", "DeepSeek", "deepseek-chat", "DeepSeek API key"],
      ["openrouter", "OpenRouter", "openrouter/auto", "OpenRouter API key"],
      ["sakana", "Sakana", "fugu-mt-001", "Sakana API key"],
      ["minimax", "MiniMax", "MiniMax-M2", "MiniMax API key"],
      ["custom", "Custom API", "custom-model", "Provider API key"],
    ].map(([key, label, model, secretLabel]) => ({
      key,
      label,
      description:
        key === "custom"
          ? "Linkgo-only OpenAI-compatible endpoint for custom GG AI execution."
          : `${label} credentials for GG AI-backed agent execution.`,
      methods: ["api_key"],
      defaultMethod: "api_key",
      scopes: [],
      models: [model],
      secretLabel,
      docsUrl: "https://example.com/docs",
    }));
    authProviders.push({
      key: "linkedin",
      label: "LinkedIn",
      description:
        "3-legged OAuth foundation for future approval-gated posting and comments.",
      methods: ["oauth"],
      defaultMethod: "oauth",
      scopes: [
        "openid",
        "profile",
        "email",
        "w_member_social",
        "w_member_social_feed",
        "r_member_social_feed",
      ],
      models: [],
      secretLabel: "LinkedIn OAuth",
      docsUrl:
        "https://learn.microsoft.com/linkedin/shared/authentication/authorization-code-flow",
    });
    const connectedAccounts: Record<string, unknown>[] = [];
    const providerSecrets: Record<
      string,
      { apiKey: string; baseUrl?: string }
    > = {};
    function getAuthStatusMock(): Record<string, unknown> {
      return {
        providers: authProviders,
        accounts: cloneRows(connectedAccounts),
        events: [],
      };
    }

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
        if (cmd === "plugin:autostart|is_enabled") {
          if (
            w.__LINKGO_FAIL_AUTOSTART_IS_ENABLED__ === true ||
            (w.__LINKGO_FAIL_AUTOSTART_IS_ENABLED_AFTER_MUTATION__ === true &&
              autostartMutationCount > 0)
          ) {
            throw new Error("Autostart status read failed");
          }
          if (typeof w.__LINKGO_AUTOSTART_IS_ENABLED_OVERRIDE__ === "boolean") {
            return Promise.resolve(w.__LINKGO_AUTOSTART_IS_ENABLED_OVERRIDE__);
          }
          const stored = window.localStorage.getItem(
            "linkgo.autostart.enabled",
          );
          return Promise.resolve(
            stored === "true" || w.__LINKGO_AUTOSTART_ENABLED__ === true,
          );
        }
        if (cmd === "plugin:autostart|enable") {
          if (w.__LINKGO_FAIL_AUTOSTART_ENABLE__ === true) {
            throw new Error("Autostart enable failed");
          }
          autostartMutationCount += 1;
          w.__LINKGO_AUTOSTART_ENABLED__ = true;
          window.localStorage.setItem("linkgo.autostart.enabled", "true");
          return Promise.resolve(null);
        }
        if (cmd === "plugin:autostart|disable") {
          if (w.__LINKGO_FAIL_AUTOSTART_DISABLE__ === true) {
            throw new Error("Autostart disable failed");
          }
          autostartMutationCount += 1;
          w.__LINKGO_AUTOSTART_ENABLED__ = false;
          window.localStorage.setItem("linkgo.autostart.enabled", "false");
          return Promise.resolve(null);
        }
        if (cmd === "update_tray_menu") return Promise.resolve(null);
        if (cmd === "linkgo_auth_status")
          return Promise.resolve(getAuthStatusMock());
        if (cmd === "linkgo_auth_api_key") {
          const input =
            (
              args as
                | {
                    input?: {
                      providerKey?: string;
                      provider_key?: string;
                      apiKey?: string;
                      api_key?: string;
                      baseUrl?: string;
                      base_url?: string;
                      accountLabel?: string;
                    };
                  }
                | undefined
            )?.input ?? {};
          const providerKey =
            input.providerKey ?? input.provider_key ?? "openai";
          const apiKey = input.apiKey ?? input.api_key ?? "sk-test-secret";
          const baseUrl = input.baseUrl ?? input.base_url;
          if (providerKey === "custom" && !baseUrl?.trim()) {
            throw new Error("Custom provider requires a Base URL override");
          }
          providerSecrets[providerKey] = {
            apiKey,
            ...(baseUrl ? { baseUrl } : {}),
          };
          const provider =
            authProviders.find((candidate) => candidate.key === providerKey) ??
            authProviders[0];
          const existingIndex = connectedAccounts.findIndex(
            (account) => account.provider_key === providerKey,
          );
          const account = {
            id:
              existingIndex >= 0
                ? existingIndex + 1
                : connectedAccounts.length + 1,
            provider_key: providerKey,
            provider_label: provider?.label ?? providerKey,
            auth_method: "api_key",
            status: "connected",
            scopes: "",
            account_label:
              input.accountLabel ?? `${provider?.label ?? providerKey} account`,
            account_id: "",
            expires_at: null,
            refresh_expires_at: null,
            has_base_url_override: Boolean(baseUrl?.trim()),
            last_checked_at: getNow(),
            last_error: "",
            created_at: getNow(),
            updated_at: getNow(),
          };
          if (existingIndex >= 0) connectedAccounts[existingIndex] = account;
          else connectedAccounts.push(account);
          return Promise.resolve(getAuthStatusMock());
        }
        if (cmd === "linkgo_auth_provider_secret") {
          const input =
            (
              args as
                | { input?: { providerKey?: string; provider_key?: string } }
                | undefined
            )?.input ?? {};
          const providerKey =
            input.providerKey ?? input.provider_key ?? "openai";
          const secret = providerSecrets[providerKey];
          if (secret === undefined)
            throw new Error("Provider is not connected");
          return Promise.resolve({
            providerKey,
            apiKey: secret.apiKey,
            ...(secret.baseUrl ? { baseUrl: secret.baseUrl } : {}),
          });
        }
        if (cmd === "linkgo_auth_oauth_start") {
          return Promise.resolve({
            providerKey: "linkedin",
            authUrl:
              "https://www.linkedin.com/oauth/v2/authorization?response_type=code&state=test-oauth-state&code_challenge=test-pkce-challenge&code_challenge_method=S256",
            state: "test-oauth-state",
            needsCode: true,
          });
        }
        if (cmd === "linkgo_auth_oauth_code") {
          connectedAccounts.push({
            id: connectedAccounts.length + 1,
            provider_key: "linkedin",
            provider_label: "LinkedIn",
            auth_method: "oauth",
            status: "connected",
            scopes:
              "openid profile email w_member_social w_member_social_feed r_member_social_feed",
            account_label: "LinkedIn member",
            account_id: "member-1",
            expires_at: null,
            refresh_expires_at: null,
            has_base_url_override: false,
            last_checked_at: getNow(),
            last_error: "",
            created_at: getNow(),
            updated_at: getNow(),
          });
          return Promise.resolve(getAuthStatusMock());
        }
        if (cmd === "linkgo_auth_logout") {
          const input =
            (
              args as
                | { input?: { providerKey?: string; provider_key?: string } }
                | undefined
            )?.input ?? {};
          const providerKey =
            input.providerKey ?? input.provider_key ?? "openai";
          removeRows(
            connectedAccounts,
            (account) => account.provider_key === providerKey,
          );
          return Promise.resolve(getAuthStatusMock());
        }
        if (cmd === "linkgo_auth_check")
          return Promise.resolve(getAuthStatusMock());
        if (cmd === "linkgo_agent_provider_stream") {
          const input =
            (
              args as
                | {
                    input?: {
                      providerKey?: string;
                      modelName?: string;
                      request?: unknown;
                    };
                  }
                | undefined
            )?.input ?? {};
          const providerKey = input.providerKey ?? "openai";
          const secret = providerSecrets[providerKey];
          if (secret === undefined)
            throw new Error("Provider is not connected");
          const testApi = (
            w as unknown as {
              __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
                execute: (args: unknown) => Promise<unknown> | unknown;
              };
            }
          ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__;
          if (testApi === undefined) {
            throw new Error("Provider command test API is not configured");
          }
          return Promise.resolve(testApi.execute(args));
        }
        if (cmd === "linkgo_scheduler_status") {
          return Promise.resolve(schedulerStatusPayload());
        }
        if (cmd === "linkgo_scheduler_start") {
          if (safetySettings.global_kill_switch === 1) {
            throw new Error(
              safetySettings.kill_switch_reason.trim()
                ? `Global kill switch is enabled: ${safetySettings.kill_switch_reason}`
                : "Global kill switch is enabled",
            );
          }
          schedulerSettings.enabled = 1;
          schedulerSettings.updated_at = getNow();
          schedulerRunning = true;
          recordSchedulerEvent(
            "scheduler_started",
            "Background scheduler started.",
            {
              metadata: { runnerId: "mock-runner" },
            },
          );
          return Promise.resolve(schedulerStatusPayload());
        }
        if (cmd === "linkgo_scheduler_stop") {
          schedulerSettings.enabled = 0;
          schedulerSettings.updated_at = getNow();
          schedulerRunning = false;
          recordSchedulerEvent(
            "scheduler_stopped",
            "Background scheduler stopped.",
            {
              metadata: { runnerId: "mock-runner" },
            },
          );
          return Promise.resolve(schedulerStatusPayload());
        }
        if (cmd === "linkgo_scheduler_tick") {
          return Promise.resolve(runSchedulerTickMock());
        }
        if (cmd === "linkgo_metric_refresh_status") {
          return Promise.resolve(metricRefreshStatusPayload());
        }
        if (cmd === "linkgo_metric_refresh_start") {
          metricRefreshSettings.enabled = 1;
          metricRefreshSettings.updated_at = getNow();
          metricRefreshRunning = true;
          recordMetricRefreshEvent(
            "worker_started",
            "Metric refresh worker started.",
            {
              metadata: { runnerId: "mock-metric-refresh" },
            },
          );
          return Promise.resolve(metricRefreshStatusPayload());
        }
        if (cmd === "linkgo_metric_refresh_stop") {
          metricRefreshSettings.enabled = 0;
          metricRefreshSettings.updated_at = getNow();
          metricRefreshRunning = false;
          recordMetricRefreshEvent(
            "worker_stopped",
            "Metric refresh worker stopped.",
            {
              metadata: { runnerId: "mock-metric-refresh" },
            },
          );
          return Promise.resolve(metricRefreshStatusPayload());
        }
        if (cmd === "linkgo_metric_refresh_tick") {
          const error = w.__LINKGO_METRIC_REFRESH_TICK_ERROR__;
          if (typeof error === "string" && error.trim() !== "") {
            return Promise.reject(error);
          }
          return Promise.resolve(runMetricRefreshTickMock());
        }
        if (cmd === "linkgo_linkedin_publish_comment") {
          const input =
            (
              args as
                | {
                    input?: {
                      commentThreadId?: number;
                      comment_thread_id?: number;
                      targetUrn?: string;
                      target_urn?: string;
                    };
                  }
                | undefined
            )?.input ?? {};
          const commentInvokes = Number(
            w.__LINKGO_LINKEDIN_COMMENT_INVOKES__ ?? 0,
          );
          w.__LINKGO_LINKEDIN_COMMENT_INVOKES__ = commentInvokes + 1;
          const error = w.__LINKGO_LINKEDIN_COMMENT_ERROR__;
          if (typeof error === "string" && error.trim() !== "") {
            throw new Error(error);
          }
          const result = w.__LINKGO_LINKEDIN_COMMENT_RESULT__;
          if (result !== undefined) {
            return Promise.resolve(result);
          }
          const commentThreadId =
            input.commentThreadId ?? input.comment_thread_id ?? 1;
          const targetUrn =
            input.targetUrn ?? input.target_urn ?? "urn:li:ugcPost:test";
          const platformCommentId = `test-comment-${commentThreadId}`;
          return Promise.resolve({
            platformCommentId,
            platformCommentUrn: `urn:li:comment:(${targetUrn},${platformCommentId})`,
            externalCommentUrl: `https://www.linkedin.com/feed/update/${targetUrn}/`,
          });
        }
        if (cmd === "linkgo_linkedin_publish_post") {
          const input =
            (
              args as
                | {
                    input?: {
                      approvalId?: number;
                      approval_id?: number;
                    };
                  }
                | undefined
            )?.input ?? {};
          const error = w.__LINKGO_LINKEDIN_PUBLISH_ERROR__;
          if (typeof error === "string" && error.trim() !== "") {
            throw new Error(error);
          }
          const result = w.__LINKGO_LINKEDIN_PUBLISH_RESULT__;
          if (result !== undefined) {
            return Promise.resolve(result);
          }
          const approvalId = input.approvalId ?? input.approval_id ?? 1;
          const platformPostId = `urn:li:ugcPost:test-${approvalId}`;
          return Promise.resolve({
            platformPostId,
            externalPostUrl: `https://www.linkedin.com/feed/update/${platformPostId}/`,
          });
        }
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
