import type { Page } from "@playwright/test";

import { MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH } from "../../src/features/source-imports/schemas";

export async function setupTauriMocks(page: Page): Promise<void> {
  await page.addInitScript((maxSourceImportInputJsonLength) => {
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

    type CampaignBacklogItem = {
      id: number;
      campaign_id: number;
      recurrence_parent_id: number | null;
      work_type:
        | "research"
        | "scoring"
        | "drafting"
        | "approval"
        | "scheduling"
        | "metrics"
        | "retry"
        | "other";
      title: string;
      details: string;
      owner_type: "operator" | "linkgo";
      status: "pending" | "in_progress" | "blocked" | "completed" | "cancelled";
      due_at: string;
      recurrence: "none" | "daily" | "weekly";
      recurrence_timezone: string;
      completed_at: string | null;
      cancelled_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type CampaignBacklogItemDetail = CampaignBacklogItem & {
      campaign_name: string;
      campaign_status: Campaign["status"];
      autopilot_plan_id: number | null;
      source_import_batch_id: number | null;
      workflow_run_id: number | null;
      linked_workflow_status: WorkflowRunStatus | null;
      linked_score_step_status: WorkflowStepStatus | null;
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

    type CandidatePolicyRuleKey =
      | "source"
      | "age"
      | "banned_topic"
      | "already_contacted";

    type CandidateIntakePolicy = {
      campaign_id: number;
      max_post_age_days: number;
      created_at: string;
      updated_at: string;
    };

    type CandidatePolicyBannedTopic = {
      id: number;
      campaign_id: number;
      topic: string;
      normalized_topic: string;
      created_at: string;
    };

    type SourceImportBatchStatus =
      | "processing"
      | "completed"
      | "completed_with_errors"
      | "failed";
    type SourceImportItemStatus =
      | "pending"
      | "accepted"
      | "duplicate"
      | "rejected";

    type SourceImportBatch = {
      id: number;
      campaign_id: number;
      source_type: "local_json";
      status: SourceImportBatchStatus;
      total_count: number;
      accepted_count: number;
      duplicate_count: number;
      rejected_count: number;
      error_message: string;
      created_at: string;
      updated_at: string;
    };

    type SourceImportItem = {
      id: number;
      source_import_batch_id: number;
      row_number: number;
      status: SourceImportItemStatus;
      input_json: string;
      candidate_post_id: number | null;
      reason: string;
      policy_rule_key: CandidatePolicyRuleKey | "";
      created_at: string;
      updated_at: string;
    };

    type AutopilotPlan = {
      id: number;
      campaign_id: number;
      source_import_batch_id: number;
      source_type: "local_json";
      status: "planned" | "skipped";
      campaign_backlog_item_id: number | null;
      workflow_run_id: number | null;
      candidate_count: number;
      summary: string;
      created_at: string;
      updated_at: string;
    };

    type AutopilotPlannerEventType =
      | "planner_started"
      | "planner_stopped"
      | "tick_started"
      | "tick_completed"
      | "tick_failed"
      | "batch_planned"
      | "batch_skipped"
      | "batch_failed"
      | "planner_blocked";

    type AutopilotPlannerEvent = {
      id: number;
      campaign_id: number | null;
      source_import_batch_id: number | null;
      autopilot_plan_id: number | null;
      event_type: AutopilotPlannerEventType;
      severity: "info" | "warning" | "error";
      summary: string;
      metadata_json: string;
      created_at: string;
    };

    type AutopilotPlannerSettings = {
      id: 1;
      enabled: number;
      poll_interval_minutes: number;
      max_batches_per_tick: number;
      updated_at: string;
    };

    type DraftContentIntent = "event" | "launch" | "idea" | "community";

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
      content_intent: DraftContentIntent;
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
      content_revision: number;
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

    type DraftAiAuditRunStatus =
      | "pending"
      | "running"
      | "completed"
      | "failed"
      | "cancelled";

    type DraftAiAuditRun = {
      id: number;
      draft_variant_id: number;
      content_revision: number;
      agent_run_id: number | null;
      provider_key: AgentProviderKey;
      model_name: string;
      status: DraftAiAuditRunStatus;
      summary: string;
      error_message: string;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    };

    type DraftAiAuditFinding = {
      id: number;
      audit_run_id: number;
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
      content_intent: DraftContentIntent;
      workflow_run_id: number | null;
      workflow_step_id: number | null;
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
      artifact_type: "agent_run" | "candidate_post" | "draft";
      artifact_id: number;
      summary: string;
      created_at: string;
      updated_at: string;
    };

    type WorkflowStepExecutionStatus =
      | "claimed"
      | "running"
      | "completed"
      | "waiting_approval"
      | "failed"
      | "blocked"
      | "cancelled";

    type WorkflowStepExecution = {
      id: number;
      workflow_step_id: number;
      agent_run_id: number | null;
      executor_role: AgentRole;
      attempt_count: number;
      status: WorkflowStepExecutionStatus;
      error_summary: string;
      started_at: string;
      completed_at: string | null;
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
      input_context_json: string;
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

    type AgentApprovalCheckpoint = {
      agent_run_id: number;
      pending_tool_call_id: number;
      approval_id: number;
      phase: "waiting_approval" | "continuation_ready";
      messages_json: string;
      iteration_count: number;
      created_at: string;
      updated_at: string;
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
      campaignBacklogItems: CampaignBacklogItem[];
      keywords: Keyword[];
      targetPosts: TargetPost[];
      candidatePosts: CandidatePost[];
      dedupeKeys: DedupeKey[];
      candidateIntakePolicies: CandidateIntakePolicy[];
      candidatePolicyBannedTopics: CandidatePolicyBannedTopic[];
      sourceImportBatches: SourceImportBatch[];
      sourceImportItems: SourceImportItem[];
      autopilotPlans: AutopilotPlan[];
      autopilotPlannerEvents: AutopilotPlannerEvent[];
      autopilotPlannerSettings: AutopilotPlannerSettings;
      candidateDiscoveryItems: CandidateDiscoveryItem[];
      drafts: Draft[];
      draftVariants: DraftVariant[];
      draftAudits: DraftAudit[];
      draftAiAuditRuns: DraftAiAuditRun[];
      draftAiAuditFindings: DraftAiAuditFinding[];
      draftGenerationRequests: DraftGenerationRequest[];
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
      workflowStepExecutions: WorkflowStepExecution[];
      agentRuns: AgentRun[];
      agentToolCalls: AgentToolCall[];
      agentRunEvents: AgentRunEvent[];
      agentApprovalCheckpoints: AgentApprovalCheckpoint[];
      agentPlaybookOverrides: AgentPlaybookOverride[];
      safetySettings: SafetySettings;
      safetyAuditEvents: SafetyAuditEvent[];
      rateLimitEvents: RateLimitEvent[];
      errorQueueItems: ErrorQueueItem[];
      schedulerSettings: SchedulerSettings;
      schedulerEvents: SchedulerEvent[];
      nextCampaignId: number;
      nextCampaignBacklogItemId: number;
      nextKeywordId: number;
      nextTargetPostId: number;
      nextCandidatePostId: number;
      nextDedupeKeyId: number;
      nextCandidatePolicyBannedTopicId: number;
      nextSourceImportBatchId: number;
      nextSourceImportItemId: number;
      nextAutopilotPlanId: number;
      nextAutopilotPlannerEventId: number;
      nextDraftId: number;
      nextDraftVariantId: number;
      nextDraftAuditId: number;
      nextDraftAiAuditRunId: number;
      nextDraftAiAuditFindingId: number;
      nextDraftGenerationRequestId: number;
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
      nextWorkflowStepExecutionId: number;
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
    const campaignBacklogItems: CampaignBacklogItem[] = [];
    const keywords: Keyword[] = [];
    const targetPosts: TargetPost[] = [];
    const candidatePosts: CandidatePost[] = [];
    const dedupeKeys: DedupeKey[] = [];
    const candidateIntakePolicies: CandidateIntakePolicy[] = [];
    const candidatePolicyBannedTopics: CandidatePolicyBannedTopic[] = [];
    const sourceImportBatches: SourceImportBatch[] = [];
    const sourceImportItems: SourceImportItem[] = [];
    const autopilotPlans: AutopilotPlan[] = [];
    const autopilotPlannerEvents: AutopilotPlannerEvent[] = [];
    const autopilotPlannerSettings: AutopilotPlannerSettings = {
      id: 1,
      enabled: 0,
      poll_interval_minutes: 60,
      max_batches_per_tick: 3,
      updated_at: new Date().toISOString(),
    };
    let autopilotPlannerRunning = false;
    const candidateDiscoveryItems: CandidateDiscoveryItem[] = [];
    const drafts: Draft[] = [];
    const draftVariants: DraftVariant[] = [];
    const draftAudits: DraftAudit[] = [];
    const draftAiAuditRuns: DraftAiAuditRun[] = [];
    const draftAiAuditFindings: DraftAiAuditFinding[] = [];
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
    const workflowStepExecutions: WorkflowStepExecution[] = [];
    const agentRuns: AgentRun[] = [];
    const agentToolCalls: AgentToolCall[] = [];
    const agentRunEvents: AgentRunEvent[] = [];
    const agentApprovalCheckpoints: AgentApprovalCheckpoint[] = [];
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
    let nextCampaignBacklogItemId = 1;
    let nextKeywordId = 1;
    let nextTargetPostId = 1;
    let nextCandidatePostId = 1;
    let nextDedupeKeyId = 1;
    let nextCandidatePolicyBannedTopicId = 1;
    let nextSourceImportBatchId = 1;
    let nextSourceImportItemId = 1;
    let nextAutopilotPlanId = 1;
    let nextAutopilotPlannerEventId = 1;
    let nextCandidateDiscoveryItemId = 1;
    let nextDraftId = 1;
    let nextDraftVariantId = 1;
    let nextDraftAuditId = 1;
    let nextDraftAiAuditRunId = 1;
    let nextDraftAiAuditFindingId = 1;
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
    let nextWorkflowStepExecutionId = 1;
    let nextAgentRunId = 1;
    let nextAgentToolCallId = 1;
    let nextAgentRunEventId = 1;
    let nextSafetyAuditEventId = 1;
    let nextRateLimitEventId = 1;
    let nextErrorQueueItemId = 1;
    let nextSchedulerEventId = 1;
    let transactionSnapshot: TransactionSnapshot | null = null;
    const campaignSelectGates = new Map<
      number,
      { promise: Promise<void>; release: () => void; pending: number }
    >();
    const backlogSelectGates = new Map<
      string,
      { promise: Promise<void>; release: () => void; pending: number }
    >();
    let backlogMutationGate: {
      promise: Promise<void>;
      release: () => void;
      pending: number;
    } | null = null;
    const reloadSnapshotKey = "linkgo:test:sql-snapshot";
    let persistedReloadSnapshot: string | null = null;
    try {
      persistedReloadSnapshot =
        window.sessionStorage.getItem(reloadSnapshotKey);
    } catch {
      persistedReloadSnapshot = null;
    }
    let reloadPersistenceEnabled = persistedReloadSnapshot !== null;
    let autostartMutationCount = 0;

    function readSqlArgs(args?: unknown): { query: string; values: unknown[] } {
      const sqlArgs = (args ?? {}) as { query?: string; values?: unknown[] };
      return { query: sqlArgs.query ?? "", values: sqlArgs.values ?? [] };
    }

    function getNow(): string {
      return new Date().toISOString();
    }

    function isOlderThanSqliteModifier(
      timestamp: string,
      modifier: unknown,
    ): boolean {
      const minutes = Number(
        String(modifier ?? "").match(/-(\d+) minutes/)?.[1] ?? 0,
      );
      return (
        Date.parse(timestamp) <= Date.parse(getNow()) - minutes * 60 * 1000
      );
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
        campaignBacklogItems: cloneRows(campaignBacklogItems),
        keywords: cloneRows(keywords),
        targetPosts: cloneRows(targetPosts),
        candidatePosts: cloneRows(candidatePosts),
        dedupeKeys: cloneRows(dedupeKeys),
        candidateIntakePolicies: cloneRows(candidateIntakePolicies),
        candidatePolicyBannedTopics: cloneRows(candidatePolicyBannedTopics),
        sourceImportBatches: cloneRows(sourceImportBatches),
        sourceImportItems: cloneRows(sourceImportItems),
        autopilotPlans: cloneRows(autopilotPlans),
        autopilotPlannerEvents: cloneRows(autopilotPlannerEvents),
        autopilotPlannerSettings: { ...autopilotPlannerSettings },
        candidateDiscoveryItems: cloneRows(candidateDiscoveryItems),
        drafts: cloneRows(drafts),
        draftVariants: cloneRows(draftVariants),
        draftAudits: cloneRows(draftAudits),
        draftAiAuditRuns: cloneRows(draftAiAuditRuns),
        draftAiAuditFindings: cloneRows(draftAiAuditFindings),
        draftGenerationRequests: cloneRows(draftGenerationRequests),
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
        workflowStepExecutions: cloneRows(workflowStepExecutions),
        agentRuns: cloneRows(agentRuns),
        agentToolCalls: cloneRows(agentToolCalls),
        agentRunEvents: cloneRows(agentRunEvents),
        agentApprovalCheckpoints: cloneRows(agentApprovalCheckpoints),
        agentPlaybookOverrides: cloneRows(agentPlaybookOverrides),
        safetySettings: { ...safetySettings },
        safetyAuditEvents: cloneRows(safetyAuditEvents),
        rateLimitEvents: cloneRows(rateLimitEvents),
        errorQueueItems: cloneRows(errorQueueItems),
        schedulerSettings: { ...schedulerSettings },
        schedulerEvents: cloneRows(schedulerEvents),
        nextCampaignId,
        nextCampaignBacklogItemId,
        nextKeywordId,
        nextTargetPostId,
        nextCandidatePostId,
        nextDedupeKeyId,
        nextCandidatePolicyBannedTopicId,
        nextSourceImportBatchId,
        nextSourceImportItemId,
        nextAutopilotPlanId,
        nextAutopilotPlannerEventId,
        nextCandidateDiscoveryItemId,
        nextDraftId,
        nextDraftVariantId,
        nextDraftAuditId,
        nextDraftAiAuditRunId,
        nextDraftAiAuditFindingId,
        nextDraftGenerationRequestId,
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
        nextWorkflowStepExecutionId,
        nextAgentRunId,
        nextAgentToolCallId,
        nextAgentRunEventId,
        nextSafetyAuditEventId,
        nextRateLimitEventId,
        nextErrorQueueItemId,
        nextSchedulerEventId,
      };
    }

    function persistReloadSnapshot(): void {
      if (!reloadPersistenceEnabled) return;
      try {
        window.sessionStorage.setItem(
          reloadSnapshotKey,
          JSON.stringify(createTransactionSnapshot()),
        );
      } catch {
        // Tests can continue without reload persistence when storage is unavailable.
      }
    }

    function restoreRows<T extends object>(rows: T[], snapshotRows: T[]): void {
      rows.splice(0, rows.length, ...cloneRows(snapshotRows));
    }

    function restoreTransactionSnapshot(
      snapshot: TransactionSnapshot,
      restoreCampaignBacklog = true,
    ): void {
      restoreRows(campaigns, snapshot.campaigns);
      if (restoreCampaignBacklog) {
        restoreRows(campaignBacklogItems, snapshot.campaignBacklogItems ?? []);
      }
      restoreRows(keywords, snapshot.keywords);
      restoreRows(targetPosts, snapshot.targetPosts);
      restoreRows(candidatePosts, snapshot.candidatePosts);
      restoreRows(dedupeKeys, snapshot.dedupeKeys);
      restoreRows(
        candidateIntakePolicies,
        snapshot.candidateIntakePolicies ?? [],
      );
      restoreRows(
        candidatePolicyBannedTopics,
        snapshot.candidatePolicyBannedTopics ?? [],
      );
      restoreRows(sourceImportBatches, snapshot.sourceImportBatches ?? []);
      restoreRows(sourceImportItems, snapshot.sourceImportItems ?? []);
      restoreRows(autopilotPlans, snapshot.autopilotPlans ?? []);
      restoreRows(
        autopilotPlannerEvents,
        snapshot.autopilotPlannerEvents ?? [],
      );
      Object.assign(
        autopilotPlannerSettings,
        snapshot.autopilotPlannerSettings ?? autopilotPlannerSettings,
      );
      restoreRows(candidateDiscoveryItems, snapshot.candidateDiscoveryItems);
      restoreRows(drafts, snapshot.drafts);
      restoreRows(draftVariants, snapshot.draftVariants);
      restoreRows(draftAudits, snapshot.draftAudits);
      restoreRows(draftAiAuditRuns, snapshot.draftAiAuditRuns ?? []);
      restoreRows(draftAiAuditFindings, snapshot.draftAiAuditFindings ?? []);
      restoreRows(
        draftGenerationRequests,
        snapshot.draftGenerationRequests ?? [],
      );
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
      restoreRows(
        workflowStepExecutions,
        snapshot.workflowStepExecutions ?? [],
      );
      restoreRows(agentRuns, snapshot.agentRuns);
      restoreRows(agentToolCalls, snapshot.agentToolCalls);
      restoreRows(agentRunEvents, snapshot.agentRunEvents);
      restoreRows(agentApprovalCheckpoints, snapshot.agentApprovalCheckpoints);
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
      if (restoreCampaignBacklog) {
        nextCampaignBacklogItemId = snapshot.nextCampaignBacklogItemId ?? 1;
      }
      nextKeywordId = snapshot.nextKeywordId;
      nextTargetPostId = snapshot.nextTargetPostId;
      nextCandidatePostId = snapshot.nextCandidatePostId;
      nextDedupeKeyId = snapshot.nextDedupeKeyId;
      nextCandidatePolicyBannedTopicId =
        snapshot.nextCandidatePolicyBannedTopicId ?? 1;
      nextSourceImportBatchId = snapshot.nextSourceImportBatchId ?? 1;
      nextSourceImportItemId = snapshot.nextSourceImportItemId ?? 1;
      nextAutopilotPlanId = snapshot.nextAutopilotPlanId ?? 1;
      nextAutopilotPlannerEventId = snapshot.nextAutopilotPlannerEventId ?? 1;
      nextCandidateDiscoveryItemId = snapshot.nextCandidateDiscoveryItemId;
      nextDraftId = snapshot.nextDraftId;
      nextDraftVariantId = snapshot.nextDraftVariantId;
      nextDraftAuditId = snapshot.nextDraftAuditId;
      nextDraftAiAuditRunId = snapshot.nextDraftAiAuditRunId ?? 1;
      nextDraftAiAuditFindingId = snapshot.nextDraftAiAuditFindingId ?? 1;
      nextDraftGenerationRequestId = snapshot.nextDraftGenerationRequestId ?? 1;
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
      nextWorkflowStepExecutionId = snapshot.nextWorkflowStepExecutionId ?? 1;
      nextAgentRunId = snapshot.nextAgentRunId;
      nextAgentToolCallId = snapshot.nextAgentToolCallId;
      nextAgentRunEventId = snapshot.nextAgentRunEventId;
      nextSafetyAuditEventId = snapshot.nextSafetyAuditEventId;
      nextRateLimitEventId = snapshot.nextRateLimitEventId;
      nextErrorQueueItemId = snapshot.nextErrorQueueItemId;
      nextSchedulerEventId = snapshot.nextSchedulerEventId;
    }

    if (persistedReloadSnapshot !== null) {
      try {
        restoreTransactionSnapshot(
          JSON.parse(persistedReloadSnapshot) as TransactionSnapshot,
        );
      } catch {
        window.sessionStorage.removeItem(reloadSnapshotKey);
        reloadPersistenceEnabled = false;
      }
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
          campaign_product: campaign.product,
          campaign_audience: campaign.audience,
          campaign_voice: campaign.voice,
          campaign_tone: campaign.tone,
          candidate_source_keyword: candidate.source_keyword,
          candidate_score_reason: candidate.score_reason,
          candidate_notes: candidate.notes,
          candidate_relevance_score: candidate.relevance_score,
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
          content_intent: draft.content_intent,
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
      if (query.includes("dgr.id AS request_id")) {
        const candidateId = Number(values[0] ?? 0);
        return draftGenerationRequests
          .filter(
            (request) =>
              request.candidate_post_id === candidateId &&
              ["pending", "generated"].includes(request.status) &&
              (request.workflow_run_id !== null ||
                request.workflow_step_id !== null),
          )
          .map((request) => {
            const run = workflowRuns.find(
              (row) => row.id === request.workflow_run_id,
            );
            const step = workflowSteps.find(
              (row) =>
                row.id === request.workflow_step_id &&
                row.workflow_run_id === request.workflow_run_id &&
                row.step_key === "draft",
            );
            return {
              request_id: request.id,
              request_status: request.status,
              agent_run_id: request.agent_run_id,
              campaign_id: request.campaign_id,
              workflow_run_id: request.workflow_run_id,
              workflow_step_id: request.workflow_step_id,
              run_status: run?.status ?? null,
              current_step_key: run?.current_step_key ?? null,
              step_status: step?.status ?? null,
            };
          });
      }

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
        .filter(
          (slot) => campaignId === null || slot.campaign_id === campaignId,
        )
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
            publish_external_post_url:
              publishAttempt?.external_post_url ?? null,
            publish_platform_post_id: publishAttempt?.platform_post_id ?? null,
            publish_error_message: publishAttempt?.error_message ?? null,
            publish_created_at: publishAttempt?.created_at ?? null,
          };
        })
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          const leftArchived = left.status === "archived" ? 1 : 0;
          const rightArchived = right.status === "archived" ? 1 : 0;
          if (leftArchived !== rightArchived)
            return leftArchived - rightArchived;
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
      const plan = autopilotPlans.find(
        (candidate) => candidate.workflow_run_id === run.id,
      );
      return {
        ...run,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        autopilot_plan_id: plan?.id ?? null,
        source_import_batch_id: plan?.source_import_batch_id ?? null,
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
      const plan = autopilotPlans.find((row) => row.workflow_run_id === run.id);
      return [
        {
          ...run,
          campaign_status: campaign.status,
          autopilot_plan_id: plan?.id ?? null,
        },
      ];
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
      const plan = autopilotPlans.find((row) => row.workflow_run_id === run.id);
      return [
        {
          ...step,
          run_status: run.status,
          campaign_id: run.campaign_id,
          campaign_status: campaign.status,
          autopilot_plan_id: plan?.id ?? null,
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
      const candidate = candidatePosts.find(
        (row) =>
          artifact.artifact_type === "candidate_post" &&
          row.id === artifact.artifact_id,
      );
      const draft = drafts.find(
        (row) =>
          artifact.artifact_type === "draft" && row.id === artifact.artifact_id,
      );
      return {
        ...artifact,
        agent_role: agentRun?.agent_role ?? null,
        agent_status: agentRun?.status ?? null,
        candidate_id: candidate?.id ?? null,
        candidate_status: candidate?.status ?? null,
        candidate_relevance_score: candidate?.relevance_score ?? null,
        draft_id: draft?.id ?? null,
        draft_status: draft?.status ?? null,
        draft_content_intent: draft?.content_intent ?? null,
      };
    }

    function selectAgentRunArtifactOwnership(values: unknown[]): unknown[] {
      const id = Number(values[0] ?? 0);
      const artifactType = String(values[1] ?? "agent_run");
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

    function selectAgentApprovalCheckpoints(
      query: string,
      values: unknown[],
    ): unknown[] {
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      if (query.includes("COUNT(*) AS count")) {
        return [...ids]
          .map((approvalId) => ({
            approval_id: approvalId,
            count: agentApprovalCheckpoints.filter(
              (checkpoint) => checkpoint.approval_id === approvalId,
            ).length,
          }))
          .filter((row) => row.count > 0);
      }
      const byApproval = query.includes("WHERE approval_id");
      return agentApprovalCheckpoints
        .filter((checkpoint) =>
          byApproval
            ? ids.has(checkpoint.approval_id)
            : ids.has(checkpoint.agent_run_id),
        )
        .filter(
          (checkpoint) =>
            !query.includes("phase = 'continuation_ready'") ||
            checkpoint.phase === "continuation_ready",
        )
        .map((checkpoint) => {
          if (query.includes("SELECT agent_run_id, pending_tool_call_id")) {
            return {
              agent_run_id: checkpoint.agent_run_id,
              pending_tool_call_id: checkpoint.pending_tool_call_id,
            };
          }
          if (
            query.includes("SELECT agent_run_id") &&
            !query.includes("SELECT cp.*")
          ) {
            return { agent_run_id: checkpoint.agent_run_id };
          }
          const approval = approvals.find(
            (row) => row.id === checkpoint.approval_id,
          );
          return {
            ...checkpoint,
            approval_status: approval?.status ?? "cancelled",
          };
        });
    }

    function selectAgentToolCalls(
      query: string,
      values: unknown[],
    ): AgentToolCall[] {
      if (query.includes("WHERE id = $1")) {
        const id = Number(values[0] ?? 0);
        const runId = Number(values[1] ?? 0);
        return agentToolCalls.filter(
          (toolCall) => toolCall.id === id && toolCall.agent_run_id === runId,
        );
      }
      const ids = new Set(
        values.filter((value): value is number => typeof value === "number"),
      );
      const matchingCalls = agentToolCalls.filter(
        (toolCall) =>
          ids.has(toolCall.agent_run_id) &&
          (!query.includes("tool_name = 'audit_post'") ||
            toolCall.tool_name === "audit_post") &&
          (!query.includes("status = 'completed'") ||
            toolCall.status === "completed"),
      );
      return matchingCalls
        .sort((left, right) => {
          if (left.agent_run_id !== right.agent_run_id) {
            return left.agent_run_id - right.agent_run_id;
          }
          return query.includes("ORDER BY id DESC")
            ? right.id - left.id
            : left.id - right.id;
        })
        .slice(0, query.includes("LIMIT 2") ? 2 : undefined);
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

    function getCampaignBacklogDetail(
      item: CampaignBacklogItem,
    ): CampaignBacklogItemDetail | null {
      const campaign = campaigns.find((row) => row.id === item.campaign_id);
      if (!campaign) return null;
      const plan = autopilotPlans.find(
        (candidate) => candidate.campaign_backlog_item_id === item.id,
      );
      return {
        ...item,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        autopilot_plan_id: plan?.id ?? null,
        source_import_batch_id: plan?.source_import_batch_id ?? null,
        workflow_run_id: plan?.workflow_run_id ?? null,
        linked_workflow_status: plan
          ? (workflowRuns.find((run) => run.id === plan.workflow_run_id)
              ?.status ?? null)
          : null,
        linked_score_step_status: plan
          ? (workflowSteps.find(
              (step) =>
                step.workflow_run_id === plan.workflow_run_id &&
                step.step_key === "score",
            )?.status ?? null)
          : null,
      };
    }

    function getCampaignBacklogFilters(values: unknown[]): {
      campaignId: number | null;
      owner: "operator" | "linkgo" | null;
    } {
      const campaignValue = values.find(
        (value): value is number => typeof value === "number",
      );
      const ownerValue = values.find(
        (value): value is "operator" | "linkgo" =>
          value === "operator" || value === "linkgo",
      );
      return {
        campaignId: campaignValue ?? null,
        owner: ownerValue ?? null,
      };
    }

    function selectCampaignBacklog(
      query: string,
      values: unknown[],
    ): unknown[] {
      if (w.__LINKGO_FAIL_BACKLOG_SELECT__ === true) {
        throw new Error("Injected backlog load failure");
      }
      if (query.includes("COUNT(*) AS total_items")) {
        return [{ total_items: campaignBacklogItems.length }];
      }
      if (query.includes("WHERE cbi.id =")) {
        const item = campaignBacklogItems.find(
          (candidate) => candidate.id === Number(values[0] ?? 0),
        );
        const detail = item ? getCampaignBacklogDetail(item) : null;
        return detail ? [detail] : [];
      }

      const { campaignId, owner } = getCampaignBacklogFilters(values);
      const matchesFilter = (item: CampaignBacklogItem): boolean =>
        (campaignId === null || item.campaign_id === campaignId) &&
        (owner === null || item.owner_type === owner);
      const openItems = campaignBacklogItems.filter(
        (item) =>
          ["pending", "in_progress", "blocked"].includes(item.status) &&
          matchesFilter(item),
      );
      if (query.includes("AS due_now")) {
        const now = getNow();
        return [
          {
            due_now: openItems.filter((item) => item.due_at <= now).length,
            in_progress: openItems.filter(
              (item) => item.status === "in_progress",
            ).length,
            blocked: openItems.filter((item) => item.status === "blocked")
              .length,
            linkgo_owned: openItems.filter(
              (item) => item.owner_type === "linkgo",
            ).length,
          },
        ];
      }

      const history = query.includes(
        "cbi.status IN ('completed', 'cancelled')",
      );
      const rows = campaignBacklogItems
        .filter((item) =>
          history
            ? ["completed", "cancelled"].includes(item.status) &&
              matchesFilter(item)
            : ["pending", "in_progress", "blocked"].includes(item.status) &&
              matchesFilter(item),
        )
        .map(getCampaignBacklogDetail)
        .filter((row): row is Record<string, unknown> => row !== null)
        .sort((left, right) => {
          if (!history) {
            const dueDelta = String(left.due_at).localeCompare(
              String(right.due_at),
            );
            return dueDelta !== 0
              ? dueDelta
              : Number(left.id) - Number(right.id);
          }
          const leftTerminal = String(
            left.completed_at ?? left.cancelled_at ?? "",
          );
          const rightTerminal = String(
            right.completed_at ?? right.cancelled_at ?? "",
          );
          const terminalDelta = rightTerminal.localeCompare(leftTerminal);
          return terminalDelta !== 0
            ? terminalDelta
            : Number(right.id) - Number(left.id);
        });
      return history ? rows.slice(0, 100) : rows;
    }

    function currentAutopilotCandidateCount(batchId: number): number {
      return sourceImportItems.filter(
        (item) =>
          item.source_import_batch_id === batchId &&
          item.status === "accepted" &&
          item.candidate_post_id !== null &&
          candidatePosts.some(
            (candidate) => candidate.id === item.candidate_post_id,
          ),
      ).length;
    }

    function isEligibleAutopilotBatch(batch: SourceImportBatch): boolean {
      const campaign = campaigns.find((row) => row.id === batch.campaign_id);
      return (
        campaign?.status === "active" &&
        campaign.auto_pilot === 1 &&
        ["completed", "completed_with_errors"].includes(batch.status) &&
        batch.accepted_count > 0 &&
        !autopilotPlans.some((plan) => plan.source_import_batch_id === batch.id)
      );
    }

    function selectAutopilotPlanner(
      query: string,
      values: unknown[],
    ): unknown[] {
      if (w.__LINKGO_FAIL_AUTOPILOT_SELECT__ === true) {
        throw new Error("Injected autopilot planner load failure");
      }
      const campaignId = typeof values[0] === "number" ? values[0] : null;
      if (
        query.includes("FROM source_import_batches sib") &&
        query.includes("autopilot_plans")
      ) {
        return [
          {
            count: sourceImportBatches.filter(
              (batch) =>
                (campaignId === null || batch.campaign_id === campaignId) &&
                isEligibleAutopilotBatch(batch),
            ).length,
          },
        ];
      }
      if (query.includes("FROM autopilot_planner_events")) {
        const events = autopilotPlannerEvents.filter(
          (event) => campaignId === null || event.campaign_id === campaignId,
        );
        if (query.includes("COUNT(*) AS count")) {
          return [
            {
              count: events.filter(
                (event) => event.event_type === "batch_failed",
              ).length,
            },
          ];
        }
        return events
          .map((event) => {
            const campaign =
              event.campaign_id === null
                ? undefined
                : campaigns.find((row) => row.id === event.campaign_id);
            return {
              ...event,
              campaign_name: campaign?.name ?? null,
              campaign_status: campaign?.status ?? null,
            };
          })
          .sort((left, right) => {
            const createdDelta = right.created_at.localeCompare(
              left.created_at,
            );
            return createdDelta !== 0 ? createdDelta : right.id - left.id;
          })
          .slice(0, 50);
      }
      if (query.includes("FROM autopilot_plans ap")) {
        const plans = autopilotPlans.filter(
          (plan) => campaignId === null || plan.campaign_id === campaignId,
        );
        if (query.includes("COUNT(*) AS count")) {
          const status = query.includes("ap.status = 'skipped'")
            ? "skipped"
            : "planned";
          return [
            { count: plans.filter((plan) => plan.status === status).length },
          ];
        }
        return plans
          .map((plan) => {
            const campaign = campaigns.find(
              (row) => row.id === plan.campaign_id,
            );
            const batch = sourceImportBatches.find(
              (row) => row.id === plan.source_import_batch_id,
            );
            const backlog = campaignBacklogItems.find(
              (row) => row.id === plan.campaign_backlog_item_id,
            );
            const workflow = workflowRuns.find(
              (row) => row.id === plan.workflow_run_id,
            );
            return {
              ...plan,
              campaign_name: campaign?.name ?? "Campaign removed",
              campaign_status: campaign?.status ?? "archived",
              source_batch_status: batch?.status ?? null,
              source_total_count: batch?.total_count ?? null,
              source_accepted_count: batch?.accepted_count ?? null,
              current_candidate_count: currentAutopilotCandidateCount(
                plan.source_import_batch_id,
              ),
              backlog_title: backlog?.title ?? null,
              backlog_status: backlog?.status ?? null,
              backlog_work_type: backlog?.work_type ?? null,
              workflow_title: workflow?.title ?? null,
              workflow_status: workflow?.status ?? null,
              workflow_current_step_key: workflow?.current_step_key ?? null,
              score_step_status:
                workflowSteps.find(
                  (step) =>
                    step.workflow_run_id === workflow?.id &&
                    step.step_key === "score",
                )?.status ?? null,
              latest_scorer_run_status:
                agentRuns
                  .filter(
                    (run) =>
                      run.workflow_run_id === workflow?.id &&
                      run.agent_role === "scorer",
                  )
                  .sort((left, right) => right.id - left.id)[0]?.status ?? null,
              latest_scorer_provider_key:
                agentRuns
                  .filter(
                    (run) =>
                      run.workflow_run_id === workflow?.id &&
                      run.agent_role === "scorer",
                  )
                  .sort((left, right) => right.id - left.id)[0]?.provider_key ??
                null,
              latest_scorer_model_name:
                agentRuns
                  .filter(
                    (run) =>
                      run.workflow_run_id === workflow?.id &&
                      run.agent_role === "scorer",
                  )
                  .sort((left, right) => right.id - left.id)[0]?.model_name ??
                null,
            };
          })
          .sort((left, right) => {
            const createdDelta = right.created_at.localeCompare(
              left.created_at,
            );
            return createdDelta !== 0 ? createdDelta : right.id - left.id;
          })
          .slice(0, 30);
      }
      return [];
    }

    function isAutopilotPlannerQuery(query: string): boolean {
      return (
        query.includes("FROM autopilot_plans ap") ||
        query.includes("FROM autopilot_planner_events ape") ||
        (query.includes("FROM source_import_batches sib") &&
          query.includes("LEFT JOIN autopilot_plans"))
      );
    }

    function getBacklogSelectKey(values: unknown[]): string {
      const { campaignId, owner } = getCampaignBacklogFilters(values);
      return `${campaignId ?? "all"}:${owner ?? "all"}`;
    }

    function selectSql(args?: unknown): unknown[] {
      const { query, values } = readSqlArgs(args);
      if (isAutopilotPlannerQuery(query)) {
        return selectAutopilotPlanner(query, values);
      }
      if (query.includes("campaign_backlog_items")) {
        return selectCampaignBacklog(query, values);
      }
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
      if (
        query.includes("tp.normalized_url") &&
        query.includes("FROM comment_attempts ca") &&
        !query.includes("COUNT(*)")
      ) {
        const normalizedUrl = String(values[0] ?? "");
        const platformResourceUrn = String(values[1] ?? "");
        const normalizedProfile = String(values[2] ?? "");
        return commentAttempts.flatMap((attempt) => {
          if (attempt.status !== "succeeded") return [];
          const thread = commentThreads.find(
            (row) => row.id === attempt.comment_thread_id,
          );
          const candidate = thread
            ? candidatePosts.find((row) => row.id === thread.candidate_post_id)
            : undefined;
          const target = candidate
            ? targetPosts.find((row) => row.id === candidate.target_post_id)
            : undefined;
          if (target === undefined) return [];
          const matchesSqlFilter =
            target.normalized_url === normalizedUrl ||
            (platformResourceUrn !== "" &&
              target.platform_resource_urn === platformResourceUrn) ||
            (normalizedProfile !== "" &&
              target.author_profile_url.trim() !== "");
          return matchesSqlFilter
            ? [
                {
                  normalized_url: target.normalized_url,
                  platform_resource_urn: target.platform_resource_urn,
                  author_profile_url: target.author_profile_url,
                },
              ]
            : [];
        });
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
      if (query.includes("FROM approvals a") && query.includes("slot_count")) {
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
        query.includes("FROM approvals") &&
        query.includes("WHERE id = $1") &&
        !query.includes("COUNT(*)")
      ) {
        const approvalId = Number(values[0] ?? 0);
        return approvals
          .filter((approval) => approval.id === approvalId)
          .map((approval) => ({
            id: approval.id,
            campaign_id: approval.campaign_id,
            status: approval.status,
          }));
      }
      if (query.includes("FROM agent_run_approval_checkpoints")) {
        return selectAgentApprovalCheckpoints(query, values);
      }
      if (
        query.includes("FROM agent_runs ar") &&
        query.includes("c.name AS campaign_name")
      ) {
        return selectAgentRunJoin(values);
      }
      if (
        query.includes("FROM agent_runs ar") &&
        query.includes("$.auditRequest.auditRunId") &&
        query.includes("NOT EXISTS")
      ) {
        const limit = Number(values[1] ?? 25);
        return agentRuns
          .filter(
            (run) =>
              run.agent_role === "auditor" &&
              ["queued", "running", "waiting_approval"].includes(run.status) &&
              isOlderThanSqliteModifier(run.updated_at, values[0]) &&
              !draftAiAuditRuns.some((audit) => audit.agent_run_id === run.id),
          )
          .filter((run) => {
            try {
              const context = JSON.parse(run.input_context_json) as {
                auditRequest?: { auditRunId?: unknown };
              };
              return Number.isInteger(context.auditRequest?.auditRunId);
            } catch {
              return false;
            }
          })
          .sort((left, right) => {
            const updatedDelta = left.updated_at.localeCompare(
              right.updated_at,
            );
            return updatedDelta !== 0 ? updatedDelta : left.id - right.id;
          })
          .slice(0, limit)
          .map((run) => ({ id: run.id }));
      }
      if (query.includes("FROM agent_runs ar")) {
        return selectAgentRunValidation(values);
      }
      if (
        query.includes("SELECT status, error_message") &&
        query.includes("FROM agent_runs")
      ) {
        const run = agentRuns.find(
          (candidate) => candidate.id === Number(values[0] ?? 0),
        );
        return run
          ? [{ status: run.status, error_message: run.error_message }]
          : [];
      }
      if (
        query.includes("SELECT workflow_run_id, workflow_step_id") &&
        query.includes("FROM agent_runs")
      ) {
        const run = agentRuns.find(
          (candidate) => candidate.id === Number(values[0] ?? 0),
        );
        return run
          ? [
              {
                workflow_run_id: run.workflow_run_id,
                workflow_step_id: run.workflow_step_id,
              },
            ]
          : [];
      }
      if (
        query.includes("FROM agent_runs") &&
        query.includes("WHERE workflow_run_id = $1")
      ) {
        const workflowRunId = Number(values[0] ?? 0);
        const workflowStepId = Number(values[1] ?? 0);
        return agentRuns
          .filter(
            (run) =>
              run.workflow_run_id === workflowRunId &&
              run.workflow_step_id === workflowStepId,
          )
          .sort((left, right) => right.id - left.id)
          .slice(0, 1)
          .map((run) => ({
            id: run.id,
            status: run.status,
            output_summary: run.output_summary,
            error_message: run.error_message,
          }));
      }
      if (query.includes("FROM agent_runs")) {
        return selectAgentRunArtifactOwnership(values);
      }
      if (query.includes("FROM agent_tool_calls")) {
        return selectAgentToolCalls(query, values);
      }
      if (query.includes("FROM agent_run_events")) {
        return selectAgentRunEvents(values);
      }
      if (query.includes("FROM agent_playbook_overrides")) {
        return selectAgentPlaybookOverrides(values);
      }
      if (
        query.includes("ws.status AS score_step_status") &&
        query.includes("INNER JOIN autopilot_plans ap")
      ) {
        const workflowRunId = Number(values[0] ?? 0);
        const run = workflowRuns.find((row) => row.id === workflowRunId);
        const campaign = run
          ? campaigns.find((row) => row.id === run.campaign_id)
          : undefined;
        const step = workflowSteps.find(
          (row) =>
            row.workflow_run_id === workflowRunId && row.step_key === "score",
        );
        const plan = autopilotPlans.find(
          (row) => row.workflow_run_id === workflowRunId,
        );
        const batch = plan
          ? sourceImportBatches.find(
              (row) => row.id === plan.source_import_batch_id,
            )
          : undefined;
        if (!run || !campaign || !step || !plan || !batch) return [];
        return [
          {
            workflow_run_id: run.id,
            workflow_status: run.status,
            current_step_key: run.current_step_key,
            workflow_step_id: step.id,
            score_step_status: step.status,
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            campaign_product: campaign.product,
            campaign_audience: campaign.audience,
            campaign_voice: campaign.voice,
            campaign_tone: campaign.tone,
            campaign_status: campaign.status,
            autopilot_plan_id: plan.id,
            plan_status: plan.status,
            source_import_batch_id: plan.source_import_batch_id,
            source_campaign_id: batch.campaign_id,
          },
        ];
      }
      if (
        query.includes("wa.id AS artifact_order") &&
        query.includes("tp.content")
      ) {
        const workflowRunId = Number(values[0] ?? 0);
        return workflowArtifacts
          .filter(
            (artifact) =>
              artifact.workflow_run_id === workflowRunId &&
              artifact.artifact_type === "candidate_post",
          )
          .map((artifact) => {
            const candidate = candidatePosts.find(
              (row) => row.id === artifact.artifact_id,
            );
            const target = candidate
              ? targetPosts.find((row) => row.id === candidate.target_post_id)
              : undefined;
            return {
              artifact_id: artifact.artifact_id,
              artifact_order: artifact.id,
              workflow_step_id: artifact.workflow_step_id,
              candidate_id: candidate?.id ?? null,
              candidate_campaign_id: candidate?.campaign_id ?? null,
              candidate_status: candidate?.status ?? null,
              relevance_score: candidate?.relevance_score ?? null,
              source_keyword: candidate?.source_keyword ?? null,
              author_name: target?.author_name ?? null,
              author_profile_url: target?.author_profile_url ?? null,
              posted_at: target?.posted_at ?? null,
              source_url: target?.url ?? null,
              content: target?.content ?? null,
            };
          });
      }
      if (
        query.includes("cp.id AS candidate_id") &&
        query.includes("FROM workflow_runs wr") &&
        query.includes("NOT EXISTS")
      ) {
        const campaignId = Number(values[0] ?? 0);
        return workflowRuns
          .filter(
            (run) =>
              run.campaign_id === campaignId &&
              run.current_step_key === "draft" &&
              ["running", "blocked", "failed"].includes(run.status),
          )
          .flatMap((run) => {
            const draftSteps = workflowSteps.filter(
              (step) =>
                step.workflow_run_id === run.id &&
                step.step_key === "draft" &&
                ["pending", "running", "blocked", "failed"].includes(
                  step.status,
                ) &&
                !draftGenerationRequests.some(
                  (request) =>
                    request.workflow_step_id === step.id &&
                    ["pending", "generated"].includes(request.status),
                ),
            );
            return draftSteps.flatMap((step) =>
              workflowArtifacts
                .filter(
                  (artifact) =>
                    artifact.workflow_run_id === run.id &&
                    artifact.artifact_type === "candidate_post",
                )
                .flatMap((artifact) => {
                  const candidate = candidatePosts.find(
                    (row) =>
                      row.id === artifact.artifact_id &&
                      row.campaign_id === run.campaign_id &&
                      ["new", "shortlisted"].includes(row.status) &&
                      row.relevance_score !== null,
                  );
                  return candidate
                    ? [
                        {
                          workflow_run_id: run.id,
                          workflow_step_id: step.id,
                          candidate_id: candidate.id,
                          title: run.title,
                          status: run.status,
                        },
                      ]
                    : [];
                }),
            );
          });
      }
      if (
        query.includes("cp.status AS candidate_status") &&
        query.includes("FROM workflow_runs wr") &&
        query.includes("ws.step_key = 'draft'")
      ) {
        const candidateId = Number(values[0] ?? 0);
        const workflowRunId = Number(values[1] ?? 0);
        const run = workflowRuns.find((row) => row.id === workflowRunId);
        const step = workflowSteps.find(
          (row) =>
            row.workflow_run_id === workflowRunId && row.step_key === "draft",
        );
        const artifact = workflowArtifacts.find(
          (row) =>
            row.workflow_run_id === workflowRunId &&
            row.artifact_type === "candidate_post" &&
            row.artifact_id === candidateId,
        );
        const candidate = artifact
          ? candidatePosts.find((row) => row.id === candidateId)
          : undefined;
        if (!run || !step || !candidate) return [];
        return [
          {
            workflow_run_id: run.id,
            campaign_id: run.campaign_id,
            run_status: run.status,
            current_step_key: run.current_step_key,
            workflow_step_id: step.id,
            step_status: step.status,
            step_title: step.title,
            candidate_status: candidate.status,
            relevance_score: candidate.relevance_score,
            candidate_campaign_id: candidate.campaign_id,
          },
        ];
      }
      if (
        query.includes("ws.status AS step_status") &&
        query.includes("wr.current_step_key") &&
        query.includes("FROM workflow_steps ws")
      ) {
        const stepId = Number(values[0] ?? 0);
        const workflowRunId = Number(values[1] ?? 0);
        const campaignId = Number(values[2] ?? 0);
        const step = workflowSteps.find(
          (row) => row.id === stepId && row.workflow_run_id === workflowRunId,
        );
        const run = workflowRuns.find(
          (row) => row.id === workflowRunId && row.campaign_id === campaignId,
        );
        return step && run
          ? [
              {
                step_status: step.status,
                run_status: run.status,
                current_step_key: run.current_step_key,
              },
            ]
          : [];
      }
      if (query.includes("FROM workflow_step_executions")) {
        const workflowStepId = Number(values[0] ?? 0);
        if (query.includes("next_attempt")) {
          return [
            {
              next_attempt:
                Math.max(
                  0,
                  ...workflowStepExecutions
                    .filter((row) => row.workflow_step_id === workflowStepId)
                    .map((row) => row.attempt_count),
                ) + 1,
            },
          ];
        }
        return workflowStepExecutions
          .filter(
            (row) =>
              row.workflow_step_id === workflowStepId &&
              (!query.includes("status IN") ||
                ["claimed", "running", "waiting_approval"].includes(
                  row.status,
                )),
          )
          .slice(0, query.includes("LIMIT 1") ? 1 : undefined);
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
      if (
        query.includes("FROM workflow_steps") &&
        query.includes("step_key = 'audit'")
      ) {
        const workflowRunId = Number(values[0] ?? 0);
        return workflowSteps.filter(
          (step) =>
            step.workflow_run_id === workflowRunId && step.step_key === "audit",
        );
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
      if (
        query.includes("FROM draft_ai_audit_runs dar") &&
        query.includes("LEFT JOIN agent_runs ar")
      ) {
        const limit = Number(values[2] ?? 25);
        return draftAiAuditRuns
          .filter(
            (audit) => audit.status === "pending" || audit.status === "running",
          )
          .filter((audit) => {
            if (audit.agent_run_id === null) {
              return isOlderThanSqliteModifier(audit.updated_at, values[0]);
            }
            const agent = agentRuns.find(
              (candidate) => candidate.id === audit.agent_run_id,
            );
            const latestActivity =
              agent && agent.updated_at > audit.updated_at
                ? agent.updated_at
                : audit.updated_at;
            return isOlderThanSqliteModifier(latestActivity, values[1]);
          })
          .sort((left, right) => {
            const updatedDelta = left.updated_at.localeCompare(
              right.updated_at,
            );
            return updatedDelta !== 0 ? updatedDelta : left.id - right.id;
          })
          .slice(0, limit)
          .map((audit) => ({
            id: audit.id,
            draft_variant_id: audit.draft_variant_id,
            content_revision: audit.content_revision,
            agent_run_id: audit.agent_run_id,
          }));
      }
      if (query.includes("FROM draft_ai_audit_runs")) {
        if (query.includes("WHERE id = $1")) {
          return draftAiAuditRuns.filter(
            (run) => run.id === Number(values[0] ?? 0),
          );
        }
        const variantId = Number(values[0] ?? 0);
        const contentRevision = Number(values[1] ?? 0);
        return draftAiAuditRuns.filter(
          (run) =>
            run.draft_variant_id === variantId &&
            run.content_revision === contentRevision &&
            (!query.includes("status IN ('pending', 'running')") ||
              run.status === "pending" ||
              run.status === "running"),
        );
      }
      if (query.includes("FROM draft_ai_audit_findings")) {
        return draftAiAuditFindings.filter(
          (finding) => finding.audit_run_id === Number(values[0] ?? 0),
        );
      }
      if (
        query.includes("SELECT\n        campaign_id") &&
        query.includes("FROM drafts") &&
        !query.includes("FROM drafts d")
      ) {
        const draft = drafts.find((row) => row.id === Number(values[0] ?? 0));
        return draft
          ? [
              {
                campaign_id: draft.campaign_id,
                workflow_run_id: null,
                workflow_step_id: null,
              },
            ]
          : [];
      }
      if (query.includes("c.status AS campaign_status")) {
        return selectDraftCandidate(values);
      }
      if (
        query.includes("dv.id AS draft_variant_id") &&
        query.includes("FROM draft_variants dv")
      ) {
        const variant = draftVariants.find(
          (row) => row.id === Number(values[0] ?? 0),
        );
        const draft = variant
          ? drafts.find((row) => row.id === variant.draft_id)
          : undefined;
        return variant && draft
          ? [
              {
                draft_variant_id: variant.id,
                campaign_id: draft.campaign_id,
                content_revision: variant.content_revision,
                hook: variant.hook,
                body: variant.body,
                cta: variant.cta,
                hashtags: variant.hashtags,
              },
            ]
          : [];
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
      if (query.includes("FROM candidate_intake_policies")) {
        if (
          w.__LINKGO_FAIL_CANDIDATE_POLICY_POST_COMMIT_LOAD__ === true &&
          transactionSnapshot === null
        ) {
          w.__LINKGO_FAIL_CANDIDATE_POLICY_POST_COMMIT_LOAD__ = undefined;
          throw new Error("Injected post-commit policy load failure");
        }
        const campaignId = Number(values[0] ?? 0);
        return candidateIntakePolicies.filter(
          (policy) => policy.campaign_id === campaignId,
        );
      }
      if (query.includes("FROM candidate_policy_banned_topics")) {
        const campaignId = Number(values[0] ?? 0);
        return candidatePolicyBannedTopics
          .filter((topic) => topic.campaign_id === campaignId)
          .sort((left, right) => left.id - right.id);
      }
      if (query.includes("FROM source_import_batches")) {
        const campaignId = Number(values[0] ?? 0);
        const batches = sourceImportBatches.filter(
          (batch) =>
            batch.campaign_id === campaignId &&
            (!query.includes("status = 'processing'") ||
              batch.status === "processing"),
        );
        if (query.includes("ORDER BY id ASC")) {
          return batches.sort((left, right) => left.id - right.id);
        }
        const sortedBatches = batches.sort((left, right) => {
          const createdDelta = right.created_at.localeCompare(left.created_at);
          return createdDelta !== 0 ? createdDelta : right.id - left.id;
        });
        return query.includes("LIMIT")
          ? sortedBatches.slice(0, 10)
          : sortedBatches;
      }
      if (query.includes("FROM source_import_items")) {
        const batchId = Number(values[0] ?? 0);
        return sourceImportItems
          .filter((item) => item.source_import_batch_id === batchId)
          .sort((left, right) => left.row_number - right.row_number);
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
          .map((candidate) => ({
            id: candidate.id,
            status: candidate.status,
            relevance_score: candidate.relevance_score,
          }));
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

    function getDelayedSelectCampaignId(args?: unknown): number | null {
      const { query, values } = readSqlArgs(args);
      const isCandidateList = query.includes("ORDER BY cp.status = 'rejected'");
      const isDraftList = query.includes("ORDER BY d.status = 'archived'");
      const isDraftGenerationRequestList = query.includes(
        "ORDER BY CASE dgr.status",
      );
      const isWorkflowRunList = query.includes("ORDER BY CASE wr.status");
      const isEligibleDraftWorkflowList =
        query.includes("cp.id AS candidate_id") && query.includes("NOT EXISTS");
      const isDiscoveryList =
        query.includes("FROM candidate_discovery_items") &&
        query.includes("ORDER BY status = 'promoted'");
      const isSourceImportList = query.includes("FROM source_import_batches");
      const isCandidatePolicyList =
        query.includes("FROM candidate_intake_policies") ||
        query.includes("FROM candidate_policy_banned_topics");
      const isAutopilotList = isAutopilotPlannerQuery(query);
      if (
        !isCandidateList &&
        !isDraftList &&
        !isDraftGenerationRequestList &&
        !isWorkflowRunList &&
        !isEligibleDraftWorkflowList &&
        !isDiscoveryList &&
        !isSourceImportList &&
        !isCandidatePolicyList &&
        !isAutopilotList
      ) {
        return null;
      }

      const campaignId = Number(values[0] ?? 0);
      return Number.isInteger(campaignId) && campaignId > 0 ? campaignId : null;
    }

    function selectSqlWithCampaignDelay(args?: unknown): Promise<unknown[]> {
      const result = selectSql(args);
      const { query, values } = readSqlArgs(args);
      const backlogGate = query.includes("campaign_backlog_items")
        ? backlogSelectGates.get(getBacklogSelectKey(values))
        : undefined;
      const campaignId = getDelayedSelectCampaignId(args);
      const campaignGate =
        campaignId === null ? undefined : campaignSelectGates.get(campaignId);
      const gate = backlogGate ?? campaignGate;
      if (gate === undefined) return Promise.resolve(result);

      gate.pending += 1;
      return gate.promise.then(() => {
        gate.pending -= 1;
        return result;
      });
    }

    function readCampaignBacklogCommandInput<T>(args?: unknown): T {
      return ((args as { input?: T } | undefined)?.input ?? {}) as T;
    }

    function mutateCampaignBacklogAtomically<T>(mutation: () => T): T {
      const itemsSnapshot = cloneRows(campaignBacklogItems);
      const nextIdSnapshot = nextCampaignBacklogItemId;
      try {
        const result = mutation();
        persistReloadSnapshot();
        return result;
      } catch (error) {
        restoreRows(campaignBacklogItems, itemsSnapshot);
        nextCampaignBacklogItemId = nextIdSnapshot;
        throw error;
      }
    }

    function runCampaignBacklogCommand<T>(command: () => T): Promise<T> {
      const gate = backlogMutationGate;
      if (gate === null) return Promise.resolve(command());

      gate.pending += 1;
      return gate.promise.then(() => {
        gate.pending -= 1;
        return command();
      });
    }

    function requireMutableBacklogCampaign(campaignId: number): Campaign {
      const campaign = campaigns.find(
        (candidate) => candidate.id === campaignId,
      );
      if (campaign === undefined) throw new Error("Campaign was not found");
      if (campaign.status === "archived") {
        throw new Error("Archived campaigns are read-only");
      }
      return campaign;
    }

    function getNextMockBacklogDueAt(
      dueAt: string,
      recurrence: "daily" | "weekly",
      recurrenceTimeZone: string,
      now: Date,
    ): string {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: recurrenceTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      const partsAt = (instant: number): number[] => {
        const values = new Map(
          formatter
            .formatToParts(new Date(instant))
            .map((part) => [part.type, part.value]),
        );
        return [
          Number(values.get("year")),
          Number(values.get("month")),
          Number(values.get("day")),
          Number(values.get("hour")),
          Number(values.get("minute")),
        ];
      };
      const localAsUtcAt = (instant: number): number => {
        const [year, month, day, hour, minute] = partsAt(instant);
        return Date.UTC(year, month - 1, day, hour, minute);
      };
      const offsetAt = (instant: number): number =>
        localAsUtcAt(instant) - Math.floor(instant / 60_000) * 60_000;
      const resolveLocal = (localAsUtc: number): number => {
        const twoDays = 2 * 86_400_000;
        const offsets = new Set([
          offsetAt(localAsUtc - twoDays),
          offsetAt(localAsUtc),
          offsetAt(localAsUtc + twoDays),
        ]);
        const matches = [...offsets]
          .map((offset) => localAsUtc - offset)
          .filter((instant) => localAsUtcAt(instant) === localAsUtc)
          .sort((left, right) => left - right);
        if (matches[0] !== undefined) return matches[0];

        const forwardGap =
          offsetAt(localAsUtc + twoDays) - offsetAt(localAsUtc - twoDays);
        if (forwardGap > 0) {
          const shiftedLocal = localAsUtc + forwardGap;
          const shifted = [...offsets]
            .map((offset) => shiftedLocal - offset)
            .filter((instant) => localAsUtcAt(instant) === shiftedLocal)
            .sort((left, right) => left - right);
          if (shifted[0] !== undefined) return shifted[0];
        }
        throw new Error("The next recurring due time could not be calculated");
      };

      const dueInstant = Date.parse(dueAt);
      if (Number.isNaN(dueInstant)) throw new Error("Due time is invalid");
      const dueParts = partsAt(dueInstant);
      const localCursor = new Date(
        Date.UTC(
          dueParts[0],
          dueParts[1] - 1,
          dueParts[2],
          dueParts[3],
          dueParts[4],
        ),
      );
      const days = recurrence === "daily" ? 1 : 7;
      for (let interval = 0; interval < 10_000; interval += 1) {
        localCursor.setUTCDate(localCursor.getUTCDate() + days);
        const next = resolveLocal(localCursor.getTime());
        if (next > now.getTime()) return new Date(next).toISOString();
      }
      throw new Error("The next recurring due time could not be calculated");
    }

    function createCampaignBacklogCommand(args?: unknown): {
      item: CampaignBacklogItemDetail;
    } {
      const input = readCampaignBacklogCommandInput<{
        campaignId: number;
        workType: CampaignBacklogItem["work_type"];
        title: string;
        details: string;
        ownerType: CampaignBacklogItem["owner_type"];
        dueAt: string;
        recurrence: CampaignBacklogItem["recurrence"];
        recurrenceTimeZone: string;
      }>(args);
      return mutateCampaignBacklogAtomically(() => {
        requireMutableBacklogCampaign(Number(input.campaignId ?? 0));
        if (w.__LINKGO_FAIL_BACKLOG_INSERT__ === true) {
          w.__LINKGO_FAIL_BACKLOG_INSERT__ = undefined;
          throw new Error("Injected backlog insert failure");
        }
        const now = getNow();
        const item: CampaignBacklogItem = {
          id: nextCampaignBacklogItemId,
          campaign_id: Number(input.campaignId ?? 0),
          recurrence_parent_id: null,
          work_type: input.workType,
          title: String(input.title ?? ""),
          details: String(input.details ?? ""),
          owner_type: input.ownerType,
          status: "pending",
          due_at: String(input.dueAt ?? ""),
          recurrence: input.recurrence,
          recurrence_timezone: String(input.recurrenceTimeZone ?? ""),
          completed_at: null,
          cancelled_at: null,
          created_at: now,
          updated_at: now,
        };
        campaignBacklogItems.push(item);
        nextCampaignBacklogItemId += 1;
        const detail = getCampaignBacklogDetail(item);
        if (detail === null) throw new Error("Campaign was not found");
        return { item: detail };
      });
    }

    function updateCampaignBacklogCommand(args?: unknown): {
      item: CampaignBacklogItemDetail;
    } {
      const input = readCampaignBacklogCommandInput<{
        id: number;
        workType: CampaignBacklogItem["work_type"];
        title: string;
        details: string;
        ownerType: CampaignBacklogItem["owner_type"];
        dueAt: string;
        recurrence: CampaignBacklogItem["recurrence"];
        recurrenceTimeZone: string;
      }>(args);
      return mutateCampaignBacklogAtomically(() => {
        const item = campaignBacklogItems.find(
          (candidate) => candidate.id === Number(input.id ?? 0),
        );
        if (item === undefined) throw new Error("Backlog item was not found");
        requireMutableBacklogCampaign(item.campaign_id);
        if (["completed", "cancelled"].includes(item.status)) {
          throw new Error(
            "Completed and cancelled backlog items cannot be edited",
          );
        }
        if (w.__LINKGO_FAIL_BACKLOG_UPDATE__ === true) {
          w.__LINKGO_FAIL_BACKLOG_UPDATE__ = undefined;
          throw new Error("Injected backlog update failure");
        }
        item.work_type = input.workType;
        item.title = String(input.title ?? "");
        item.details = String(input.details ?? "");
        item.owner_type = input.ownerType;
        item.due_at = String(input.dueAt ?? "");
        item.recurrence = input.recurrence;
        item.recurrence_timezone = String(input.recurrenceTimeZone ?? "");
        item.updated_at = getNow();
        const detail = getCampaignBacklogDetail(item);
        if (detail === null) throw new Error("Campaign was not found");
        return { item: detail };
      });
    }

    function setCampaignBacklogStatusCommand(args?: unknown): {
      item: CampaignBacklogItemDetail;
      successor: CampaignBacklogItemDetail | null;
    } {
      const input = readCampaignBacklogCommandInput<{
        id: number;
        status: CampaignBacklogItem["status"];
      }>(args);
      return mutateCampaignBacklogAtomically(() => {
        const item = campaignBacklogItems.find(
          (candidate) => candidate.id === Number(input.id ?? 0),
        );
        if (item === undefined) throw new Error("Backlog item was not found");
        requireMutableBacklogCampaign(item.campaign_id);
        const currentStatus = item.status;
        if (currentStatus === "completed" || currentStatus === "cancelled") {
          throw new Error("Completed and cancelled backlog items are final");
        }
        const allowedTransitions: Record<
          "pending" | "in_progress" | "blocked",
          CampaignBacklogItem["status"][]
        > = {
          pending: ["in_progress", "blocked", "completed", "cancelled"],
          in_progress: ["pending", "blocked", "completed", "cancelled"],
          blocked: ["pending", "in_progress", "completed", "cancelled"],
        };
        if (!allowedTransitions[currentStatus].includes(input.status)) {
          throw new Error(
            `Backlog item cannot move from ${currentStatus} to ${input.status}`,
          );
        }

        const now = getNow();
        item.status = input.status;
        item.completed_at = input.status === "completed" ? now : null;
        item.cancelled_at = input.status === "cancelled" ? now : null;
        item.updated_at = now;

        let successor: CampaignBacklogItemDetail | null = null;
        if (input.status === "completed" && item.recurrence !== "none") {
          if (w.__LINKGO_FAIL_BACKLOG_SUCCESSOR__ === true) {
            w.__LINKGO_FAIL_BACKLOG_SUCCESSOR__ = undefined;
            throw new Error("Injected recurring successor failure");
          }
          const successorItem: CampaignBacklogItem = {
            ...item,
            id: nextCampaignBacklogItemId,
            recurrence_parent_id: item.id,
            status: "pending",
            due_at: getNextMockBacklogDueAt(
              item.due_at,
              item.recurrence,
              item.recurrence_timezone,
              new Date(now),
            ),
            completed_at: null,
            cancelled_at: null,
            created_at: now,
            updated_at: now,
          };
          campaignBacklogItems.push(successorItem);
          nextCampaignBacklogItemId += 1;
          successor = getCampaignBacklogDetail(successorItem);
          if (successor === null) throw new Error("Campaign was not found");
        }
        const detail = getCampaignBacklogDetail(item);
        if (detail === null) throw new Error("Campaign was not found");
        return { item: detail, successor };
      });
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
        persistReloadSnapshot();
        return { lastInsertId: 0, rowsAffected: 0 };
      }

      if (normalizedQuery === "ROLLBACK") {
        if (transactionSnapshot !== null) {
          restoreTransactionSnapshot(transactionSnapshot, false);
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

      if (query.includes("INSERT INTO campaign_backlog_items")) {
        const successor = query.includes("recurrence_parent_id");
        if (successor && w.__LINKGO_FAIL_BACKLOG_SUCCESSOR__ === true) {
          w.__LINKGO_FAIL_BACKLOG_SUCCESSOR__ = undefined;
          throw new Error("Injected recurring successor failure");
        }
        if (!successor && w.__LINKGO_FAIL_BACKLOG_INSERT__ === true) {
          w.__LINKGO_FAIL_BACKLOG_INSERT__ = undefined;
          throw new Error("Injected backlog insert failure");
        }
        const campaignId = Number(values[0] ?? 0);
        if (!campaigns.some((campaign) => campaign.id === campaignId)) {
          throw new Error("FOREIGN KEY constraint failed");
        }
        const item: CampaignBacklogItem = successor
          ? {
              id: nextCampaignBacklogItemId,
              campaign_id: campaignId,
              recurrence_parent_id: Number(values[1] ?? 0),
              work_type: values[2] as CampaignBacklogItem["work_type"],
              title: String(values[3] ?? ""),
              details: String(values[4] ?? ""),
              owner_type: values[5] as CampaignBacklogItem["owner_type"],
              status: "pending",
              due_at: String(values[6] ?? ""),
              recurrence: values[7] as CampaignBacklogItem["recurrence"],
              recurrence_timezone: String(values[8] ?? ""),
              completed_at: null,
              cancelled_at: null,
              created_at: now,
              updated_at: now,
            }
          : {
              id: nextCampaignBacklogItemId,
              campaign_id: campaignId,
              recurrence_parent_id: null,
              work_type: values[1] as CampaignBacklogItem["work_type"],
              title: String(values[2] ?? ""),
              details: String(values[3] ?? ""),
              owner_type: values[4] as CampaignBacklogItem["owner_type"],
              status: "pending",
              due_at: String(values[5] ?? ""),
              recurrence: values[6] as CampaignBacklogItem["recurrence"],
              recurrence_timezone: String(values[7] ?? ""),
              completed_at: null,
              cancelled_at: null,
              created_at: now,
              updated_at: now,
            };
        campaignBacklogItems.push(item);
        nextCampaignBacklogItemId += 1;
        return { lastInsertId: item.id, rowsAffected: 1 };
      }

      if (
        query.includes("UPDATE campaign_backlog_items") &&
        query.includes("SET work_type")
      ) {
        if (w.__LINKGO_FAIL_BACKLOG_UPDATE__ === true) {
          w.__LINKGO_FAIL_BACKLOG_UPDATE__ = undefined;
          throw new Error("Injected backlog update failure");
        }
        const item = campaignBacklogItems.find(
          (candidate) => candidate.id === Number(values[7] ?? 0),
        );
        if (!item || ["completed", "cancelled"].includes(item.status)) {
          return { lastInsertId: 0, rowsAffected: 0 };
        }
        item.work_type = values[0] as CampaignBacklogItem["work_type"];
        item.title = String(values[1] ?? "");
        item.details = String(values[2] ?? "");
        item.owner_type = values[3] as CampaignBacklogItem["owner_type"];
        item.due_at = String(values[4] ?? "");
        item.recurrence = values[5] as CampaignBacklogItem["recurrence"];
        item.recurrence_timezone = String(values[6] ?? "");
        item.updated_at = now;
        return { lastInsertId: item.id, rowsAffected: 1 };
      }

      if (
        query.includes("UPDATE campaign_backlog_items") &&
        query.includes("SELECT ap.campaign_backlog_item_id")
      ) {
        const status = values[0] as CampaignBacklogItem["status"];
        const workflowRunId = Number(values[1] ?? 0);
        const scoreStepStatus = String(values[2] ?? "");
        const plan = autopilotPlans.find(
          (row) => row.workflow_run_id === workflowRunId,
        );
        const scoreStep = workflowSteps.find(
          (row) =>
            row.workflow_run_id === workflowRunId &&
            row.step_key === "score" &&
            row.status === scoreStepStatus,
        );
        const item = campaignBacklogItems.find(
          (row) => row.id === plan?.campaign_backlog_item_id,
        );
        if (
          !plan ||
          !scoreStep ||
          !item ||
          item.owner_type !== "linkgo" ||
          item.work_type !== "scoring" ||
          item.recurrence !== "none" ||
          ["completed", "cancelled"].includes(item.status)
        ) {
          return { lastInsertId: 0, rowsAffected: 0 };
        }
        item.status = status;
        item.completed_at =
          status === "completed" ? (item.completed_at ?? now) : null;
        item.cancelled_at =
          status === "cancelled" ? (item.cancelled_at ?? now) : null;
        item.updated_at = now;
        return { lastInsertId: item.id, rowsAffected: 1 };
      }
      if (
        query.includes("UPDATE campaign_backlog_items") &&
        query.includes("SET status")
      ) {
        const id = Number(values[3] ?? 0);
        const currentStatus = String(values[4] ?? "");
        const item = campaignBacklogItems.find(
          (candidate) =>
            candidate.id === id && candidate.status === currentStatus,
        );
        if (!item) return { lastInsertId: 0, rowsAffected: 0 };
        item.status = values[0] as CampaignBacklogItem["status"];
        item.completed_at = values[1] === null ? null : String(values[1]);
        item.cancelled_at = values[2] === null ? null : String(values[2]);
        item.updated_at = now;
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

      if (query.includes("INSERT INTO candidate_intake_policies")) {
        if (w.__LINKGO_FAIL_CANDIDATE_POLICY_SAVE__ === true) {
          w.__LINKGO_FAIL_CANDIDATE_POLICY_SAVE__ = undefined;
          throw new Error("Injected candidate policy save failure");
        }
        const campaignId = Number(values[0] ?? 0);
        const maxPostAgeDays = Number(values[1] ?? 0);
        if (!campaigns.some((campaign) => campaign.id === campaignId)) {
          throw new Error("FOREIGN KEY constraint failed");
        }
        if (
          !Number.isInteger(maxPostAgeDays) ||
          maxPostAgeDays < 1 ||
          maxPostAgeDays > 365
        ) {
          throw new Error("CHECK constraint failed: max_post_age_days");
        }
        const existing = candidateIntakePolicies.find(
          (policy) => policy.campaign_id === campaignId,
        );
        if (existing) {
          existing.max_post_age_days = maxPostAgeDays;
          existing.updated_at = now;
          return { lastInsertId: campaignId, rowsAffected: 1 };
        }
        candidateIntakePolicies.push({
          campaign_id: campaignId,
          max_post_age_days: maxPostAgeDays,
          created_at: now,
          updated_at: now,
        });
        return { lastInsertId: campaignId, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO candidate_policy_banned_topics")) {
        const campaignId = Number(values[0] ?? 0);
        const topic = String(values[1] ?? "");
        const normalizedTopic = String(values[2] ?? "");
        if (!campaigns.some((campaign) => campaign.id === campaignId))
          throw new Error("FOREIGN KEY constraint failed");
        if (
          topic.trim().length < 1 ||
          topic.trim().length > 80 ||
          normalizedTopic.length < 1 ||
          normalizedTopic.length > 80
        ) {
          throw new Error(
            "CHECK constraint failed: candidate_policy_banned_topics",
          );
        }
        if (
          candidatePolicyBannedTopics.filter(
            (row) => row.campaign_id === campaignId,
          ).length >= 25
        ) {
          throw new Error(
            "Candidate policy allows no more than 25 banned topics",
          );
        }
        if (
          candidatePolicyBannedTopics.some(
            (row) =>
              row.campaign_id === campaignId &&
              row.normalized_topic === normalizedTopic,
          )
        ) {
          throw new Error(
            "UNIQUE constraint failed: candidate_policy_banned_topics.campaign_id, candidate_policy_banned_topics.normalized_topic",
          );
        }
        const row: CandidatePolicyBannedTopic = {
          id: nextCandidatePolicyBannedTopicId,
          campaign_id: campaignId,
          topic,
          normalized_topic: normalizedTopic,
          created_at: now,
        };
        candidatePolicyBannedTopics.push(row);
        nextCandidatePolicyBannedTopicId += 1;
        return { lastInsertId: row.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO source_import_batches")) {
        const campaignId = Number(values[0] ?? 0);
        const sourceType = String(values[1] ?? "");
        const totalCount = Number(values[2] ?? 0);
        if (!campaigns.some((campaign) => campaign.id === campaignId)) {
          throw new Error("FOREIGN KEY constraint failed");
        }
        if (sourceType !== "local_json") {
          throw new Error("CHECK constraint failed: source_type");
        }
        if (!Number.isInteger(totalCount) || totalCount < 0) {
          throw new Error("CHECK constraint failed: total_count >= 0");
        }
        const batch: SourceImportBatch = {
          id: nextSourceImportBatchId,
          campaign_id: campaignId,
          source_type: "local_json",
          status: "processing",
          total_count: totalCount,
          accepted_count: 0,
          duplicate_count: 0,
          rejected_count: 0,
          error_message: "",
          created_at: now,
          updated_at: now,
        };
        sourceImportBatches.push(batch);
        nextSourceImportBatchId += 1;
        return { lastInsertId: batch.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO source_import_items")) {
        const batchId = Number(values[0] ?? 0);
        const rowNumber = Number(values[1] ?? 0);
        const inputJson = String(values[2] ?? "");
        if (!sourceImportBatches.some((batch) => batch.id === batchId)) {
          throw new Error("FOREIGN KEY constraint failed");
        }
        if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
          throw new Error("CHECK constraint failed: row_number > 0");
        }
        if (
          sourceImportItems.some(
            (item) =>
              item.source_import_batch_id === batchId &&
              item.row_number === rowNumber,
          )
        ) {
          throw new Error(
            "UNIQUE constraint failed: source_import_items.source_import_batch_id, source_import_items.row_number",
          );
        }
        if (inputJson.length > maxSourceImportInputJsonLength) {
          throw new Error(
            `CHECK constraint failed: length(input_json) <= ${maxSourceImportInputJsonLength}`,
          );
        }
        const item: SourceImportItem = {
          id: nextSourceImportItemId,
          source_import_batch_id: batchId,
          row_number: rowNumber,
          status: "pending",
          input_json: inputJson,
          candidate_post_id: null,
          reason: "",
          policy_rule_key: "",
          created_at: now,
          updated_at: now,
        };
        sourceImportItems.push(item);
        nextSourceImportItemId += 1;
        return { lastInsertId: item.id, rowsAffected: 1 };
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
        const failInsertNumber = Number(
          w.__LINKGO_FAIL_CANDIDATE_INSERT_NUMBER__ ?? 0,
        );
        if (failInsertNumber === nextCandidatePostId) {
          w.__LINKGO_FAIL_CANDIDATE_INSERT_NUMBER__ = undefined;
          throw new Error("Injected candidate insert failure");
        }
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
        const workflowStepId =
          values[8] === null ? null : Number(values[8] ?? 0);
        if (
          workflowStepId !== null &&
          draftGenerationRequests.some(
            (row) =>
              row.workflow_step_id === workflowStepId &&
              ["pending", "generated"].includes(row.status),
          )
        ) {
          throw new Error(
            "UNIQUE constraint failed: draft_generation_requests.workflow_step_id",
          );
        }
        const variantCount = Number(values[5] ?? 3);
        if (variantCount < 3 || variantCount > 5) {
          throw new Error(
            "new draft generation requests require 3 to 5 variants",
          );
        }
        const request: DraftGenerationRequest = {
          id: nextDraftGenerationRequestId,
          campaign_id: Number(values[0] ?? 0),
          candidate_post_id: Number(values[1] ?? 0),
          agent_run_id: null,
          provider_key: values[2] as AgentProviderKey,
          model_name: String(values[3] ?? ""),
          playbook_key: values[4] as AgentPlaybookKey | "",
          variant_count: variantCount,
          content_intent: values[6] as DraftContentIntent,
          workflow_run_id: values[7] === null ? null : Number(values[7] ?? 0),
          workflow_step_id: workflowStepId,
          angle: String(values[9] ?? ""),
          voice_notes: String(values[10] ?? ""),
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
          content_intent: (values[4] as DraftContentIntent) ?? "idea",
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
          content_revision: 1,
          status: "draft",
          created_at: now,
          updated_at: now,
        };
        draftVariants.push(variant);
        nextDraftVariantId += 1;
        return { lastInsertId: variant.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO draft_ai_audit_runs")) {
        const draftVariantId = Number(values[0] ?? 0);
        const contentRevision = Number(values[1] ?? 0);
        if (
          draftAiAuditRuns.some(
            (run) =>
              run.draft_variant_id === draftVariantId &&
              run.content_revision === contentRevision &&
              (run.status === "pending" || run.status === "running"),
          )
        ) {
          throw new Error(
            "UNIQUE constraint failed: draft_ai_audit_runs.draft_variant_id, draft_ai_audit_runs.content_revision",
          );
        }
        const run: DraftAiAuditRun = {
          id: nextDraftAiAuditRunId,
          draft_variant_id: draftVariantId,
          content_revision: contentRevision,
          agent_run_id:
            values[2] === null || values[2] === undefined
              ? null
              : Number(values[2]),
          provider_key: values[3] as AgentProviderKey,
          model_name: String(values[4] ?? ""),
          status: "running",
          summary: "",
          error_message: "",
          started_at: now,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        draftAiAuditRuns.push(run);
        nextDraftAiAuditRunId += 1;
        return { lastInsertId: run.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO draft_ai_audit_findings")) {
        const auditRunId = Number(values[0] ?? 0);
        const insertionNumber =
          draftAiAuditFindings.filter(
            (finding) => finding.audit_run_id === auditRunId,
          ).length + 1;
        if (
          Number(w.__LINKGO_FAIL_DRAFT_AI_AUDIT_FINDING_INSERT_AT__ ?? 0) ===
          insertionNumber
        ) {
          throw new Error("Injected draft AI audit finding insert failure");
        }
        const finding: DraftAiAuditFinding = {
          id: nextDraftAiAuditFindingId,
          audit_run_id: auditRunId,
          rule_key: String(values[1] ?? ""),
          severity: values[2] as DraftAuditSeverity,
          message: String(values[3] ?? ""),
          created_at: now,
        };
        draftAiAuditFindings.push(finding);
        nextDraftAiAuditFindingId += 1;
        return { lastInsertId: finding.id, rowsAffected: 1 };
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
          input_context_json: String(values[8] ?? "{}"),
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

      if (query.includes("INSERT INTO agent_run_approval_checkpoints")) {
        const checkpoint: AgentApprovalCheckpoint = {
          agent_run_id: Number(values[0] ?? 0),
          pending_tool_call_id: Number(values[1] ?? 0),
          approval_id: Number(values[2] ?? 0),
          phase: "waiting_approval",
          messages_json: String(values[3] ?? "[]"),
          iteration_count: Number(values[4] ?? 0),
          created_at: now,
          updated_at: now,
        };
        if (
          agentApprovalCheckpoints.some(
            (row) => row.agent_run_id === checkpoint.agent_run_id,
          )
        ) {
          throw new Error(
            "UNIQUE constraint failed: agent_run_approval_checkpoints.agent_run_id",
          );
        }
        if (
          !agentRuns.some((row) => row.id === checkpoint.agent_run_id) ||
          !agentToolCalls.some(
            (row) => row.id === checkpoint.pending_tool_call_id,
          ) ||
          !approvals.some((row) => row.id === checkpoint.approval_id)
        ) {
          throw new Error("FOREIGN KEY constraint failed");
        }
        JSON.parse(checkpoint.messages_json);
        agentApprovalCheckpoints.push(checkpoint);
        return { lastInsertId: checkpoint.agent_run_id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO workflow_step_executions")) {
        const workflowStepId = Number(values[0] ?? 0);
        const activeExecution = workflowStepExecutions.find(
          (execution) =>
            execution.workflow_step_id === workflowStepId &&
            ["claimed", "running", "waiting_approval"].includes(
              execution.status,
            ),
        );
        if (activeExecution) {
          throw new Error(
            "UNIQUE constraint failed: workflow_step_executions.workflow_step_id",
          );
        }
        const attemptCount =
          Math.max(
            0,
            ...workflowStepExecutions
              .filter(
                (execution) => execution.workflow_step_id === workflowStepId,
              )
              .map((execution) => execution.attempt_count),
          ) + 1;
        const plannerScoringClaim = query.includes("VALUES ($1, 'scorer'");
        const execution: WorkflowStepExecution = {
          id: nextWorkflowStepExecutionId,
          workflow_step_id: workflowStepId,
          agent_run_id: plannerScoringClaim
            ? null
            : values[1] === null
              ? null
              : Number(values[1] ?? 0),
          executor_role: plannerScoringClaim
            ? "scorer"
            : (values[2] as AgentRole),
          attempt_count: plannerScoringClaim
            ? Number(values[1] ?? attemptCount)
            : attemptCount,
          status: "claimed",
          error_summary: "",
          started_at: now,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        workflowStepExecutions.push(execution);
        nextWorkflowStepExecutionId += 1;
        return { lastInsertId: execution.id, rowsAffected: 1 };
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
        const literalEventType = query.includes("'step_completed'")
          ? "step_completed"
          : query.includes("'step_blocked'")
            ? "step_blocked"
            : query.includes("'step_started'")
              ? "step_started"
              : null;
        if (
          literalEventType === "step_blocked" &&
          w.__LINKGO_FAIL_CANDIDATE_DELETE_WORKFLOW_EVENT__ === true &&
          String(values[2] ?? "").includes("Candidate #")
        ) {
          w.__LINKGO_FAIL_CANDIDATE_DELETE_WORKFLOW_EVENT__ = undefined;
          throw new Error("Injected candidate deletion workflow event failure");
        }
        const event: WorkflowEvent = {
          id: nextWorkflowEventId,
          workflow_run_id: Number(values[0] ?? 0),
          workflow_step_id: values[1] === null ? null : Number(values[1] ?? 0),
          event_type: literalEventType ?? (values[2] as WorkflowEventType),
          summary:
            literalEventType === "step_started"
              ? "Draft variants started"
              : literalEventType === null
                ? String(values[3] ?? "")
                : String(values[2] ?? ""),
          created_at: now,
        };
        workflowEvents.push(event);
        nextWorkflowEventId += 1;
        return { lastInsertId: event.id, rowsAffected: 1 };
      }

      if (query.includes("INSERT INTO workflow_artifacts")) {
        const literalDraft = query.includes("'draft'");
        const artifactType = literalDraft
          ? "draft"
          : (values[2] as "agent_run" | "candidate_post");
        const artifactId = Number(values[literalDraft ? 2 : 3] ?? 0);
        const summary = String(values[literalDraft ? 3 : 4] ?? "");
        if (literalDraft && w.__LINKGO_FAIL_DRAFT_ARTIFACT_INSERT__ === true) {
          w.__LINKGO_FAIL_DRAFT_ARTIFACT_INSERT__ = false;
          throw new Error("Injected draft artifact insert failure");
        }
        const existing = workflowArtifacts.find(
          (artifact) =>
            artifact.workflow_run_id === Number(values[0] ?? 0) &&
            artifact.artifact_type === artifactType &&
            artifact.artifact_id === artifactId,
        );
        if (existing) {
          existing.workflow_step_id =
            values[1] === null ? null : Number(values[1] ?? 0);
          existing.summary = summary;
          existing.updated_at = now;
          return { lastInsertId: existing.id, rowsAffected: 1 };
        }
        const artifact: WorkflowArtifact = {
          id: nextWorkflowArtifactId,
          workflow_run_id: Number(values[0] ?? 0),
          workflow_step_id: values[1] === null ? null : Number(values[1] ?? 0),
          artifact_type: artifactType,
          artifact_id: artifactId,
          summary,
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
        if (
          query.includes("AND status = 'pending'") &&
          request.status !== "pending"
        ) {
          return { lastInsertId: 0, rowsAffected: 0 };
        }
        if (
          query.includes("AND status = 'generated'") &&
          request.status !== "generated"
        ) {
          return { lastInsertId: 0, rowsAffected: 0 };
        }
        if (
          query.includes("AND status IN ('pending', 'generated')") &&
          !["pending", "generated"].includes(request.status)
        ) {
          return { lastInsertId: 0, rowsAffected: 0 };
        }
        if (query.includes("SET agent_run_id = $1")) {
          request.agent_run_id = Number(values[0] ?? 0);
        } else if (query.includes("SET status = 'generated'")) {
          request.status = "generated";
          request.summary = String(values[0] ?? "");
          request.generated_variants_json = String(values[1] ?? "[]");
          request.error_message = "";
        } else if (query.includes("SET status = 'failed'")) {
          request.status = "failed";
          request.error_message = String(values[0] ?? "");
        } else if (query.includes("SET status = 'saved'")) {
          request.status = "saved";
          request.created_draft_id = Number(values[0] ?? 0);
        } else if (query.includes("SET status = 'dismissed'")) {
          request.status = "dismissed";
          if (query.includes("error_message")) {
            request.error_message = String(values[0] ?? "");
          }
        }
        request.updated_at = now;
        return { lastInsertId: 0, rowsAffected: 1 };
      }

      if (query.includes("UPDATE agent_run_approval_checkpoints")) {
        const runId = Number(values.at(-1) ?? 0);
        const checkpoint = agentApprovalCheckpoints.find(
          (row) => row.agent_run_id === runId,
        );
        if (!checkpoint) return { lastInsertId: 0, rowsAffected: 0 };
        checkpoint.phase = "continuation_ready";
        checkpoint.messages_json = String(
          values[0] ?? checkpoint.messages_json,
        );
        if (query.includes("iteration_count = $2")) {
          checkpoint.iteration_count = Number(
            values[1] ?? checkpoint.iteration_count,
          );
        }
        checkpoint.updated_at = now;
        return { lastInsertId: runId, rowsAffected: 1 };
      }

      if (query.includes("UPDATE agent_tool_calls")) {
        const id = Number(values[1] ?? 0);
        const toolCall = agentToolCalls.find((row) => row.id === id);
        if (!toolCall) return { lastInsertId: 0, rowsAffected: 0 };
        const allowed = ["waiting_approval", "running"].includes(
          toolCall.status,
        );
        if (!allowed) return { lastInsertId: id, rowsAffected: 0 };
        if (query.includes("status = 'completed'")) {
          toolCall.status = "completed";
          toolCall.output_json = String(values[0] ?? "{}");
          toolCall.error_message = "";
        } else if (query.includes("status = 'rejected'")) {
          toolCall.status = "rejected";
          toolCall.error_message = String(values[0] ?? "Approval rejected");
        }
        toolCall.completed_at = now;
        return { lastInsertId: id, rowsAffected: 1 };
      }

      if (query.includes("UPDATE agent_runs")) {
        const literalRunning = query.includes("status = 'running'");
        const literalCancelled = query.includes("status = 'cancelled'");
        const literalFailed = query.includes("status = 'failed'");
        const cancellationWithError =
          literalCancelled && query.includes("error_message = $1");
        const id = literalFailed
          ? Number(values[1] ?? 0)
          : literalRunning || literalCancelled
            ? Number(values[cancellationWithError ? 1 : 0] ?? 0)
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
            if (
              query.includes("status IN ('queued', 'running')") &&
              !["queued", "running"].includes(run.status)
            ) {
              return { lastInsertId: id, rowsAffected: 0 };
            }
            run.status = "cancelled";
            run.completed_at = now;
            if (cancellationWithError) {
              run.error_message = String(values[0] ?? "");
            }
          } else if (literalFailed) {
            if (
              query.includes(
                "status IN ('queued', 'running', 'waiting_approval')",
              ) &&
              !["queued", "running", "waiting_approval"].includes(run.status)
            ) {
              return { lastInsertId: id, rowsAffected: 0 };
            }
            run.status = "failed";
            run.error_message = String(values[0] ?? "");
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

      if (
        query.includes("UPDATE workflow_step_executions") &&
        query.includes("status = 'running'") &&
        query.includes("status = 'claimed'")
      ) {
        const agentRunId = Number(values[0] ?? 0);
        const executionId = Number(values[1] ?? 0);
        const workflowStepId = Number(values[2] ?? 0);
        const execution = workflowStepExecutions.find(
          (row) =>
            row.id === executionId &&
            row.workflow_step_id === workflowStepId &&
            row.status === "claimed",
        );
        if (!execution) return { lastInsertId: 0, rowsAffected: 0 };
        execution.agent_run_id = agentRunId;
        execution.status = "running";
        execution.updated_at = now;
        return { lastInsertId: execution.id, rowsAffected: 1 };
      }
      if (
        query.includes("UPDATE workflow_step_executions") &&
        query.includes("status = 'failed'") &&
        query.includes("WHERE id = $2")
      ) {
        const execution = workflowStepExecutions.find(
          (row) => row.id === Number(values[1] ?? 0),
        );
        if (!execution) return { lastInsertId: 0, rowsAffected: 0 };
        execution.status = "failed";
        execution.error_summary = String(values[0] ?? "");
        execution.completed_at = now;
        execution.updated_at = now;
        return { lastInsertId: execution.id, rowsAffected: 1 };
      }
      if (query.includes("UPDATE workflow_step_executions")) {
        const reconcilesAgentRun = query.includes("WHERE agent_run_id = $3");
        const execution = reconcilesAgentRun
          ? workflowStepExecutions.find(
              (row) =>
                row.agent_run_id === Number(values[2] ?? 0) &&
                row.workflow_step_id === Number(values[3] ?? 0),
            )
          : workflowStepExecutions.find(
              (row) => row.id === Number(values[3] ?? 0),
            );
        if (!execution) return { lastInsertId: 0, rowsAffected: 0 };

        if (reconcilesAgentRun) {
          execution.status = values[0] as WorkflowStepExecutionStatus;
          execution.error_summary = String(values[1] ?? "");
        } else {
          if (values[0] !== null) {
            execution.agent_run_id = Number(values[0] ?? 0);
          }
          execution.status = values[1] as WorkflowStepExecutionStatus;
          execution.error_summary = String(values[2] ?? "");
        }
        execution.completed_at = [
          "completed",
          "failed",
          "blocked",
          "cancelled",
        ].includes(execution.status)
          ? (execution.completed_at ?? now)
          : null;
        execution.updated_at = now;
        return { lastInsertId: execution.id, rowsAffected: 1 };
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
            if (query.includes("current_step_key = 'score'")) {
              run.current_step_key = "score";
            }
            if (query.includes("current_step_key = 'draft'")) {
              run.current_step_key = "draft";
            }
            if (query.includes("current_step_key = 'audit'")) {
              run.current_step_key = "audit";
            }
          } else if (query.includes("status = 'failed'")) {
            run.status = "failed";
            run.current_step_key = "score";
            run.completed_at = null;
          } else if (query.includes("status = 'blocked'")) {
            run.status = "blocked";
            run.current_step_key = query.includes("current_step_key = 'draft'")
              ? "draft"
              : "score";
            run.completed_at = null;
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

      if (
        query.includes("UPDATE workflow_steps") &&
        query.includes("WHERE id = $2") &&
        (query.includes("status = 'failed'") ||
          query.includes("status = 'blocked'") ||
          query.includes("status = 'completed'"))
      ) {
        const step = workflowSteps.find(
          (row) => row.id === Number(values[1] ?? 0),
        );
        if (!step) return { lastInsertId: 0, rowsAffected: 0 };
        if (query.includes("status = 'failed'")) step.status = "failed";
        if (query.includes("status = 'blocked'")) step.status = "blocked";
        if (query.includes("status = 'completed'")) {
          step.status = "completed";
          step.output_summary = String(values[0] ?? "");
          step.completed_at = now;
        } else {
          if (query.includes("output_summary = ''")) {
            step.output_summary = "";
          }
          step.error_message = String(values[0] ?? "");
          step.completed_at = null;
        }
        step.updated_at = now;
        return { lastInsertId: step.id, rowsAffected: 1 };
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
        if (query.includes("campaign_id = $1")) {
          const id = Number(values[1] ?? 0);
          const approval = approvals.find((row) => row.id === id);
          if (!approval) return { lastInsertId: id, rowsAffected: 0 };
          approval.campaign_id = Number(values[0] ?? 0);
          approval.updated_at = now;
          return { lastInsertId: id, rowsAffected: 1 };
        }
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

      if (query.includes("UPDATE source_import_items")) {
        const remainingFailures = Number(
          w.__LINKGO_FAIL_SOURCE_IMPORT_ITEM_UPDATE_COUNT__ ?? 0,
        );
        if (remainingFailures > 0) {
          w.__LINKGO_FAIL_SOURCE_IMPORT_ITEM_UPDATE_COUNT__ =
            remainingFailures - 1;
          throw new Error("Injected source import item update failure");
        }
        const status = values[0] as SourceImportItemStatus;
        const candidatePostId =
          values[1] === null ? null : Number(values[1] ?? 0);
        const reason = String(values[2] ?? "");
        const policyRuleKey = String(values[3] ?? "") as
          | CandidatePolicyRuleKey
          | "";
        const batchId = Number(values[4] ?? 0);
        const rowNumber = Number(values[5] ?? 0);
        if (
          !["accepted", "duplicate", "rejected"].includes(status) ||
          reason.length > 2000 ||
          !["", "source", "age", "banned_topic", "already_contacted"].includes(
            policyRuleKey,
          )
        ) {
          throw new Error("CHECK constraint failed: source_import_items");
        }
        if (
          candidatePostId !== null &&
          !candidatePosts.some((candidate) => candidate.id === candidatePostId)
        ) {
          throw new Error("FOREIGN KEY constraint failed");
        }
        const item = sourceImportItems.find(
          (row) =>
            row.source_import_batch_id === batchId &&
            row.row_number === rowNumber,
        );
        if (!item) return { lastInsertId: 0, rowsAffected: 0 };
        item.status = status;
        item.candidate_post_id = candidatePostId;
        item.reason = reason;
        item.policy_rule_key = policyRuleKey;
        item.updated_at = now;
        if (transactionSnapshot === null) persistReloadSnapshot();
        return { lastInsertId: item.id, rowsAffected: 1 };
      }

      if (query.includes("UPDATE source_import_batches")) {
        const remainingFailures = Number(
          w.__LINKGO_FAIL_SOURCE_IMPORT_BATCH_UPDATE_COUNT__ ?? 0,
        );
        if (remainingFailures > 0) {
          w.__LINKGO_FAIL_SOURCE_IMPORT_BATCH_UPDATE_COUNT__ =
            remainingFailures - 1;
          throw new Error("Injected source import batch update failure");
        }
        const status = values[0] as SourceImportBatchStatus;
        const acceptedCount = Number(values[1] ?? 0);
        const duplicateCount = Number(values[2] ?? 0);
        const rejectedCount = Number(values[3] ?? 0);
        const errorMessage = String(values[4] ?? "");
        const id = Number(values[5] ?? 0);
        if (
          ![
            "processing",
            "completed",
            "completed_with_errors",
            "failed",
          ].includes(status) ||
          [acceptedCount, duplicateCount, rejectedCount].some(
            (count) => !Number.isInteger(count) || count < 0,
          ) ||
          errorMessage.length > 1000
        ) {
          throw new Error("CHECK constraint failed: source_import_batches");
        }
        const batch = sourceImportBatches.find((row) => row.id === id);
        if (!batch) return { lastInsertId: 0, rowsAffected: 0 };
        batch.status = status;
        batch.accepted_count = acceptedCount;
        batch.duplicate_count = duplicateCount;
        batch.rejected_count = rejectedCount;
        batch.error_message = errorMessage;
        batch.updated_at = now;
        if (transactionSnapshot === null) persistReloadSnapshot();
        return { lastInsertId: id, rowsAffected: 1 };
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

      if (
        query.includes("UPDATE draft_ai_audit_runs") &&
        query.includes("SET agent_run_id = $1")
      ) {
        const agentRunId = Number(values[0] ?? 0);
        const id = Number(values[1] ?? 0);
        const variantId = Number(values[2] ?? 0);
        const contentRevision = Number(values[3] ?? 0);
        const run = draftAiAuditRuns.find(
          (candidate) =>
            candidate.id === id &&
            candidate.draft_variant_id === variantId &&
            candidate.content_revision === contentRevision &&
            candidate.agent_run_id === null &&
            (candidate.status === "pending" || candidate.status === "running"),
        );
        if (!run) return { lastInsertId: 0, rowsAffected: 0 };
        run.agent_run_id = agentRunId;
        run.updated_at = now;
        return { lastInsertId: run.id, rowsAffected: 1 };
      }

      if (query.includes("UPDATE draft_ai_audit_runs")) {
        const completed = query.includes("status = 'completed'");
        const id = Number(values[1] ?? 0);
        const variantId = Number(values[2] ?? 0);
        const contentRevision = Number(values[3] ?? 0);
        const run = draftAiAuditRuns.find(
          (candidate) =>
            candidate.id === id &&
            candidate.draft_variant_id === variantId &&
            candidate.content_revision === contentRevision &&
            (candidate.status === "pending" || candidate.status === "running"),
        );
        if (!run) return { lastInsertId: 0, rowsAffected: 0 };
        run.status = completed ? "completed" : "failed";
        if (completed) {
          run.summary = String(values[0] ?? "");
          run.error_message = "";
        } else {
          run.error_message = String(values[0] ?? "");
        }
        run.completed_at = now;
        run.updated_at = now;
        return { lastInsertId: run.id, rowsAffected: 1 };
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
            let contentChanged = false;
            const columns = parseUpdateColumns(query, "draft_variants");
            columns.forEach((column, index) => {
              const value = values[index];
              if (column === "hook") {
                const nextValue = String(value ?? "");
                contentChanged ||= variant.hook !== nextValue;
                variant.hook = nextValue;
              }
              if (column === "body") {
                const nextValue = String(value ?? "");
                contentChanged ||= variant.body !== nextValue;
                variant.body = nextValue;
              }
              if (column === "cta") {
                const nextValue = String(value ?? "");
                contentChanged ||= variant.cta !== nextValue;
                variant.cta = nextValue;
              }
              if (column === "hashtags") {
                const nextValue = String(value ?? "");
                contentChanged ||= variant.hashtags !== nextValue;
                variant.hashtags = nextValue;
              }
              if (column === "status") {
                variant.status = value as DraftVariantStatus;
              }
            });
            if (contentChanged) variant.content_revision += 1;
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

      if (query.includes("DELETE FROM approvals WHERE id = $1")) {
        const approvalId = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          approvals,
          (approval) => approval.id === approvalId,
        );
        removeRows(
          agentApprovalCheckpoints,
          (checkpoint) => checkpoint.approval_id === approvalId,
        );
        return { lastInsertId: 0, rowsAffected };
      }

      if (query.includes("DELETE FROM agent_run_approval_checkpoints")) {
        const id = Number(values[0] ?? 0);
        const byApproval = query.includes("approval_id = $1");
        const rowsAffected = removeRows(
          agentApprovalCheckpoints,
          (checkpoint) =>
            byApproval
              ? checkpoint.approval_id === id
              : checkpoint.agent_run_id === id,
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
        for (const item of sourceImportItems) {
          if (item.candidate_post_id === id) item.candidate_post_id = null;
        }
        removeRows(
          draftGenerationRequests,
          (request) => request.candidate_post_id === id,
        );
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
        removeRows(agentApprovalCheckpoints, (checkpoint) =>
          approvalIds.includes(checkpoint.approval_id),
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

      if (query.includes("DELETE FROM candidate_policy_banned_topics")) {
        const campaignId = Number(values[0] ?? 0);
        const rowsAffected = removeRows(
          candidatePolicyBannedTopics,
          (row) => row.campaign_id === campaignId,
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
        removeRows(
          candidateIntakePolicies,
          (policy) => policy.campaign_id === id,
        );
        removeRows(
          candidatePolicyBannedTopics,
          (topic) => topic.campaign_id === id,
        );
        removeRows(candidatePosts, (candidate) => candidate.campaign_id === id);
        removeRows(dedupeKeys, (key) => key.campaign_id === id);
        const removedSourceBatchIds = sourceImportBatches
          .filter((batch) => batch.campaign_id === id)
          .map((batch) => batch.id);
        removeRows(sourceImportBatches, (batch) => batch.campaign_id === id);
        removeRows(sourceImportItems, (item) =>
          removedSourceBatchIds.includes(item.source_import_batch_id),
        );
        removeRows(drafts, (draft) => draft.campaign_id === id);
        removeRows(draftVariants, (variant) =>
          removedDraftIds.includes(variant.draft_id),
        );
        removeRows(approvals, (approval) => approval.campaign_id === id);
        removeRows(agentApprovalCheckpoints, (checkpoint) =>
          removedApprovalIds.includes(checkpoint.approval_id),
        );
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
        removeRows(agentApprovalCheckpoints, (checkpoint) =>
          removedAgentRunIds.includes(checkpoint.agent_run_id),
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

    function recordAutopilotPlannerEvent(
      eventType: AutopilotPlannerEventType,
      summary: string,
      options: {
        campaignId?: number | null;
        sourceImportBatchId?: number | null;
        autopilotPlanId?: number | null;
        severity?: AutopilotPlannerEvent["severity"];
        metadata?: Record<string, unknown>;
      } = {},
    ): void {
      autopilotPlannerEvents.push({
        id: nextAutopilotPlannerEventId,
        campaign_id: options.campaignId ?? null,
        source_import_batch_id: options.sourceImportBatchId ?? null,
        autopilot_plan_id: options.autopilotPlanId ?? null,
        event_type: eventType,
        severity: options.severity ?? "info",
        summary,
        metadata_json: JSON.stringify(options.metadata ?? {}),
        created_at: getNow(),
      });
      nextAutopilotPlannerEventId += 1;
    }

    function autopilotPlannerStatusPayload(): Record<string, unknown> {
      return {
        enabled: autopilotPlannerSettings.enabled === 1,
        running: autopilotPlannerRunning,
        runnerId: autopilotPlannerRunning ? "mock-autopilot" : null,
        settings: {
          enabled: autopilotPlannerSettings.enabled === 1,
          pollIntervalMinutes: autopilotPlannerSettings.poll_interval_minutes,
          maxBatchesPerTick: autopilotPlannerSettings.max_batches_per_tick,
          updatedAt: autopilotPlannerSettings.updated_at,
        },
      };
    }

    function runAutopilotPlannerTickMock(): Record<string, number> {
      const result = {
        claimed: 0,
        planned: 0,
        skipped: 0,
        failed: 0,
        blocked: 0,
      };
      recordAutopilotPlannerEvent(
        "tick_started",
        "Autopilot planner tick started.",
        { metadata: { runnerId: "mock-autopilot" } },
      );
      if (safetySettings.global_kill_switch === 1) {
        result.blocked = 1;
        recordAutopilotPlannerEvent(
          "planner_blocked",
          "Autopilot planner tick blocked by the global kill switch.",
          {
            severity: "warning",
            metadata: { reason: safetySettings.kill_switch_reason },
          },
        );
        recordAutopilotPlannerEvent(
          "tick_completed",
          "Autopilot planner tick completed without creating work.",
          { metadata: result },
        );
        return result;
      }

      const eligibleBatches = sourceImportBatches
        .filter(isEligibleAutopilotBatch)
        .sort((left, right) => {
          const createdDelta = left.created_at.localeCompare(right.created_at);
          return createdDelta !== 0 ? createdDelta : left.id - right.id;
        })
        .slice(0, autopilotPlannerSettings.max_batches_per_tick);

      for (const batch of eligibleBatches) {
        if (
          autopilotPlans.some(
            (plan) => plan.source_import_batch_id === batch.id,
          )
        ) {
          continue;
        }
        const plansSnapshot = cloneRows(autopilotPlans);
        const eventsSnapshot = cloneRows(autopilotPlannerEvents);
        const backlogSnapshot = cloneRows(campaignBacklogItems);
        const runsSnapshot = cloneRows(workflowRuns);
        const stepsSnapshot = cloneRows(workflowSteps);
        const workflowEventsSnapshot = cloneRows(workflowEvents);
        const workflowArtifactsSnapshot = cloneRows(workflowArtifacts);
        const idSnapshot = {
          plan: nextAutopilotPlanId,
          plannerEvent: nextAutopilotPlannerEventId,
          backlog: nextCampaignBacklogItemId,
          run: nextWorkflowRunId,
          step: nextWorkflowStepId,
          workflowEvent: nextWorkflowEventId,
          workflowArtifact: nextWorkflowArtifactId,
        };
        if (safetySettings.global_kill_switch === 1) {
          const reason = safetySettings.kill_switch_reason.trim()
            ? `Global kill switch is enabled: ${safetySettings.kill_switch_reason.trim()}`
            : "Global kill switch is enabled";
          result.blocked += 1;
          recordAutopilotPlannerEvent(
            "planner_blocked",
            "Source batch materialization blocked by the global kill switch.",
            {
              sourceImportBatchId: batch.id,
              severity: "warning",
              metadata: { reason },
            },
          );
          break;
        }
        try {
          if (w.__LINKGO_FAIL_AUTOPILOT_PLAN__ === true) {
            w.__LINKGO_FAIL_AUTOPILOT_PLAN__ = undefined;
            throw new Error("Injected autopilot planner failure");
          }
          const candidateCount = currentAutopilotCandidateCount(batch.id);
          const now = getNow();
          if (candidateCount === 0) {
            const plan: AutopilotPlan = {
              id: nextAutopilotPlanId,
              campaign_id: batch.campaign_id,
              source_import_batch_id: batch.id,
              source_type: batch.source_type,
              status: "skipped",
              campaign_backlog_item_id: null,
              workflow_run_id: null,
              candidate_count: 0,
              summary: `No current accepted candidates remain for source batch #${batch.id}.`,
              created_at: now,
              updated_at: now,
            };
            autopilotPlans.push(plan);
            nextAutopilotPlanId += 1;
            recordAutopilotPlannerEvent(
              "batch_skipped",
              "Source batch skipped because no current accepted candidates remain.",
              {
                campaignId: batch.campaign_id,
                sourceImportBatchId: batch.id,
                autopilotPlanId: plan.id,
                severity: "warning",
                metadata: { candidateCount: 0 },
              },
            );
            result.claimed += 1;
            result.skipped += 1;
            continue;
          }

          const workflowRunId = nextWorkflowRunId;
          workflowRuns.push({
            id: workflowRunId,
            campaign_id: batch.campaign_id,
            workflow_type: "content_pipeline",
            title: `Autopilot scoring for source batch #${batch.id}`,
            status: "queued",
            current_step_key: "score",
            context_summary: `Policy-enforced local_json source batch #${batch.id} has ${candidateCount} current accepted candidate(s). Research is complete; scoring awaits operator execution.`,
            started_at: null,
            completed_at: null,
            created_at: now,
            updated_at: now,
          });
          nextWorkflowRunId += 1;
          const canonicalSteps: Array<{
            key: WorkflowStepKey;
            title: string;
            description: string;
          }> = [
            {
              key: "research",
              title: "Research",
              description: "Research source posts and campaign context.",
            },
            {
              key: "score",
              title: "Score relevance",
              description: "Dedupe and score candidate relevance.",
            },
            {
              key: "draft",
              title: "Draft variants",
              description: "Create draft variants.",
            },
            {
              key: "audit",
              title: "Audit drafts",
              description: "Run deterministic/AI audit checks.",
            },
            {
              key: "approve",
              title: "Approve",
              description: "Wait for human review.",
            },
            {
              key: "schedule",
              title: "Schedule",
              description: "Schedule approved content.",
            },
            {
              key: "measure",
              title: "Measure",
              description: "Record metrics and learning.",
            },
          ];
          let researchStepId: number | null = null;
          let scoreStepId: number | null = null;
          canonicalSteps.forEach((stepDefinition, index) => {
            const research = stepDefinition.key === "research";
            const step: WorkflowStep = {
              id: nextWorkflowStepId,
              workflow_run_id: workflowRunId,
              step_key: stepDefinition.key,
              title: stepDefinition.title,
              description: stepDefinition.description,
              sort_order: index + 1,
              status: research ? "completed" : "pending",
              output_summary: research
                ? `Research completed from policy-enforced source batch #${batch.id} with ${candidateCount} current accepted candidate(s).`
                : "",
              error_message: "",
              started_at: research ? now : null,
              completed_at: research ? now : null,
              created_at: now,
              updated_at: now,
            };
            workflowSteps.push(step);
            if (research) researchStepId = step.id;
            if (stepDefinition.key === "score") scoreStepId = step.id;
            nextWorkflowStepId += 1;
          });
          if (scoreStepId === null) {
            throw new Error("Planner score step was not created");
          }
          sourceImportItems
            .filter(
              (item) =>
                item.source_import_batch_id === batch.id &&
                item.status === "accepted" &&
                item.candidate_post_id !== null &&
                candidatePosts.some(
                  (candidate) =>
                    candidate.id === item.candidate_post_id &&
                    candidate.campaign_id === batch.campaign_id,
                ),
            )
            .forEach((item) => {
              workflowArtifacts.push({
                id: nextWorkflowArtifactId,
                workflow_run_id: workflowRunId,
                workflow_step_id: scoreStepId,
                artifact_type: "candidate_post",
                artifact_id: item.candidate_post_id as number,
                summary: `Planner scoring candidate from source batch #${batch.id}`,
                created_at: now,
                updated_at: now,
              });
              nextWorkflowArtifactId += 1;
            });
          workflowEvents.push(
            {
              id: nextWorkflowEventId,
              workflow_run_id: workflowRunId,
              workflow_step_id: null,
              event_type: "run_created",
              summary: "Workflow run created",
              created_at: now,
            },
            {
              id: nextWorkflowEventId + 1,
              workflow_run_id: workflowRunId,
              workflow_step_id: researchStepId,
              event_type: "step_completed",
              summary: "Research completed from source batch",
              created_at: now,
            },
          );
          nextWorkflowEventId += 2;

          const backlogId = nextCampaignBacklogItemId;
          campaignBacklogItems.push({
            id: backlogId,
            campaign_id: batch.campaign_id,
            recurrence_parent_id: null,
            work_type: "scoring",
            title: `Score source batch #${batch.id}`,
            details: `Score ${candidateCount} current accepted candidate(s) from source batch #${batch.id}. Queued workflow #${workflowRunId}; no model or external action has started.`,
            owner_type: "linkgo",
            status: "pending",
            due_at: now,
            recurrence: "none",
            recurrence_timezone: "",
            completed_at: null,
            cancelled_at: null,
            created_at: now,
            updated_at: now,
          });
          nextCampaignBacklogItemId += 1;

          const plan: AutopilotPlan = {
            id: nextAutopilotPlanId,
            campaign_id: batch.campaign_id,
            source_import_batch_id: batch.id,
            source_type: batch.source_type,
            status: "planned",
            campaign_backlog_item_id: backlogId,
            workflow_run_id: workflowRunId,
            candidate_count: candidateCount,
            summary: `Created backlog item #${backlogId} and queued workflow #${workflowRunId} from ${candidateCount} current accepted candidate(s).`,
            created_at: now,
            updated_at: now,
          };
          autopilotPlans.push(plan);
          nextAutopilotPlanId += 1;
          recordAutopilotPlannerEvent(
            "batch_planned",
            "Source batch converted into a Linkgo backlog item and queued workflow.",
            {
              campaignId: batch.campaign_id,
              sourceImportBatchId: batch.id,
              autopilotPlanId: plan.id,
              metadata: {
                candidateCount,
                campaignBacklogItemId: backlogId,
                workflowRunId,
              },
            },
          );
          result.claimed += 1;
          result.planned += 1;
          const killSwitchReason =
            w.__LINKGO_ENABLE_KILL_SWITCH_AFTER_AUTOPILOT_PLAN__;
          if (typeof killSwitchReason === "string") {
            safetySettings.global_kill_switch = 1;
            safetySettings.kill_switch_reason = killSwitchReason;
            safetySettings.updated_at = getNow();
            w.__LINKGO_ENABLE_KILL_SWITCH_AFTER_AUTOPILOT_PLAN__ = undefined;
          }
        } catch {
          restoreRows(autopilotPlans, plansSnapshot);
          restoreRows(autopilotPlannerEvents, eventsSnapshot);
          restoreRows(campaignBacklogItems, backlogSnapshot);
          restoreRows(workflowRuns, runsSnapshot);
          restoreRows(workflowSteps, stepsSnapshot);
          restoreRows(workflowEvents, workflowEventsSnapshot);
          restoreRows(workflowArtifacts, workflowArtifactsSnapshot);
          nextAutopilotPlanId = idSnapshot.plan;
          nextAutopilotPlannerEventId = idSnapshot.plannerEvent;
          nextCampaignBacklogItemId = idSnapshot.backlog;
          nextWorkflowRunId = idSnapshot.run;
          nextWorkflowStepId = idSnapshot.step;
          nextWorkflowEventId = idSnapshot.workflowEvent;
          nextWorkflowArtifactId = idSnapshot.workflowArtifact;
          result.claimed += 1;
          result.failed += 1;
          recordAutopilotPlannerEvent(
            "batch_failed",
            `Source batch #${batch.id} could not be planned due to a local database error.`,
            {
              campaignId: batch.campaign_id,
              sourceImportBatchId: batch.id,
              severity: "error",
            },
          );
        }
      }
      recordAutopilotPlannerEvent(
        "tick_completed",
        "Autopilot planner tick completed.",
        { metadata: result },
      );
      persistReloadSnapshot();
      return result;
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
    w.__LINKGO_SQL_AGENT_RUN_EVENTS__ = () => cloneRows(agentRunEvents);
    w.__LINKGO_SQL_AGENT_APPROVAL_CHECKPOINTS__ = () =>
      cloneRows(agentApprovalCheckpoints);
    w.__LINKGO_SQL_DRAFTS__ = () => cloneRows(drafts);
    w.__LINKGO_SQL_DRAFT_VARIANTS__ = () => cloneRows(draftVariants);
    w.__LINKGO_SQL_DRAFT_AI_AUDIT_RUNS__ = () => cloneRows(draftAiAuditRuns);
    w.__LINKGO_SQL_DRAFT_AI_AUDIT_FINDINGS__ = () =>
      cloneRows(draftAiAuditFindings);
    w.__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_VARIANT__ = () => {
      const now = getNow();
      let campaign = campaigns[0];
      if (campaign === undefined) {
        campaign = {
          id: nextCampaignId,
          name: "AI audit campaign",
          product: "Linkgo",
          audience: "Operators",
          voice: "Practical",
          tone: "Direct",
          auto_pilot: 0,
          status: "active",
          daily_post_limit: 1,
          daily_comment_limit: 3,
          created_at: now,
          updated_at: now,
        };
        campaigns.push(campaign);
        nextCampaignId += 1;
      }
      const draft: Draft = {
        id: nextDraftId,
        campaign_id: campaign.id,
        candidate_post_id: 0,
        angle: "AI audit runtime fixture",
        notes: "",
        content_intent: "idea",
        status: "drafting",
        created_at: now,
        updated_at: now,
      };
      drafts.push(draft);
      nextDraftId += 1;
      const variant: DraftVariant = {
        id: nextDraftVariantId,
        draft_id: draft.id,
        variant_number: 1,
        hook: "Exact revision hook",
        body: "Exact revision body with a concrete operator detail.",
        cta: "Review the exact revision.",
        hashtags: "#Linkgo",
        content_revision: 1,
        status: "draft",
        created_at: now,
        updated_at: now,
      };
      draftVariants.push(variant);
      nextDraftVariantId += 1;
      return { ...variant };
    };
    w.__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_RECOVERY__ = () => {
      const staleAt = "2000-01-01T00:00:00.000Z";
      const seedVariant =
        w.__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_VARIANT__ as () => DraftVariant;
      const labels: Record<string, number> = {};

      function createAudit(label: string): DraftAiAuditRun {
        const variant = seedVariant();
        const audit: DraftAiAuditRun = {
          id: nextDraftAiAuditRunId,
          draft_variant_id: variant.id,
          content_revision: variant.content_revision,
          agent_run_id: null,
          provider_key: "dry_run",
          model_name: "recovery-fixture",
          status: "pending",
          summary: "",
          error_message: "",
          started_at: staleAt,
          completed_at: null,
          created_at: staleAt,
          updated_at: staleAt,
        };
        draftAiAuditRuns.push(audit);
        nextDraftAiAuditRunId += 1;
        labels[label] = audit.id;
        return audit;
      }

      function createAgent(
        label: string,
        audit: DraftAiAuditRun,
        status: AgentRunStatus,
        updatedAt = staleAt,
      ): AgentRun {
        const variant = draftVariants.find(
          (candidate) => candidate.id === audit.draft_variant_id,
        );
        const draft = drafts.find(
          (candidate) => candidate.id === variant?.draft_id,
        );
        const agent: AgentRun = {
          id: nextAgentRunId,
          campaign_id: draft?.campaign_id ?? 1,
          workflow_run_id: null,
          workflow_step_id: null,
          agent_role: "auditor",
          provider_key: "dry_run",
          model_name: "recovery-fixture",
          playbook_key: "linkedin_humanizer",
          status,
          input_summary: `Recovery fixture ${label}`,
          input_context_json: JSON.stringify({
            auditRequest: { auditRunId: audit.id },
          }),
          output_summary:
            status === "completed"
              ? "Preserved terminal provider evidence."
              : "",
          error_message: "",
          iteration_count: status === "queued" ? 0 : 1,
          started_at: status === "queued" ? null : staleAt,
          completed_at: status === "completed" ? staleAt : null,
          created_at: staleAt,
          updated_at: updatedAt,
        };
        agentRuns.push(agent);
        nextAgentRunId += 1;
        labels[label] = agent.id;
        return agent;
      }

      createAudit("reservedAudit");

      const unlinkedAudit = createAudit("unlinkedAudit");
      createAgent("orphanAgent", unlinkedAudit, "queued");

      const queuedAudit = createAudit("queuedAudit");
      const queuedAgent = createAgent("queuedAgent", queuedAudit, "queued");
      queuedAudit.agent_run_id = queuedAgent.id;

      const runningAudit = createAudit("runningAudit");
      const runningAgent = createAgent("runningAgent", runningAudit, "running");
      runningAudit.agent_run_id = runningAgent.id;

      const waitingAudit = createAudit("waitingAudit");
      const waitingAgent = createAgent(
        "waitingAgent",
        waitingAudit,
        "waiting_approval",
      );
      waitingAudit.agent_run_id = waitingAgent.id;
      const waitingToolCall: AgentToolCall = {
        id: nextAgentToolCallId,
        agent_run_id: waitingAgent.id,
        provider_tool_call_id: "recovery-waiting-tool",
        tool_name: "audit_post",
        status: "waiting_approval",
        requires_approval: 1,
        input_json: "{}",
        output_json: "{}",
        error_message: "",
        started_at: staleAt,
        completed_at: null,
        created_at: staleAt,
      };
      agentToolCalls.push(waitingToolCall);
      nextAgentToolCallId += 1;
      agentApprovalCheckpoints.push({
        agent_run_id: waitingAgent.id,
        pending_tool_call_id: waitingToolCall.id,
        approval_id: 1,
        phase: "waiting_approval",
        messages_json: "[]",
        iteration_count: 1,
        created_at: staleAt,
        updated_at: staleAt,
      });

      const completedAudit = createAudit("completedAudit");
      completedAudit.summary = "Preserved audit-side evidence.";
      const completedAgent = createAgent(
        "completedAgent",
        completedAudit,
        "completed",
      );
      completedAudit.agent_run_id = completedAgent.id;
      agentToolCalls.push({
        id: nextAgentToolCallId,
        agent_run_id: completedAgent.id,
        provider_tool_call_id: "recovery-completed-tool",
        tool_name: "audit_post",
        status: "completed",
        requires_approval: 0,
        input_json: JSON.stringify({ evidence: "preserve me" }),
        output_json: JSON.stringify({ evidence: "preserved" }),
        error_message: "",
        started_at: staleAt,
        completed_at: staleAt,
        created_at: staleAt,
      });
      labels.completedToolCall = nextAgentToolCallId;
      nextAgentToolCallId += 1;

      const freshAudit = createAudit("freshAudit");
      const freshAgent = createAgent(
        "freshAgent",
        freshAudit,
        "running",
        getNow(),
      );
      freshAudit.agent_run_id = freshAgent.id;

      const unrelatedAudit = createAudit("unrelatedAudit");
      unrelatedAudit.status = "failed";
      unrelatedAudit.completed_at = staleAt;
      const unrelatedAgent = createAgent(
        "unrelatedAgent",
        unrelatedAudit,
        "running",
      );
      unrelatedAgent.input_context_json = "{}";

      return { ...labels };
    };
    w.__LINKGO_SQL_DRAFT_GENERATION_REQUESTS__ = () =>
      cloneRows(draftGenerationRequests);
    w.__LINKGO_SQL_WORKFLOW_ARTIFACTS__ = () => cloneRows(workflowArtifacts);
    w.__LINKGO_SQL_WORKFLOW_RUNS__ = () => cloneRows(workflowRuns);
    w.__LINKGO_SQL_WORKFLOW_STEPS__ = () => cloneRows(workflowSteps);
    w.__LINKGO_SQL_WORKFLOW_EVENTS__ = () => cloneRows(workflowEvents);
    w.__LINKGO_SQL_WORKFLOW_STEP_EXECUTIONS__ = () =>
      cloneRows(workflowStepExecutions);
    w.__LINKGO_SQL_DELETE_CANDIDATE__ = (id: number) => {
      const index = candidatePosts.findIndex(
        (candidate) => candidate.id === id,
      );
      if (index < 0) throw new Error("Candidate was not found");
      candidatePosts.splice(index, 1);
    };
    w.__LINKGO_SQL_MUTATE_WORKFLOW_RUN__ = (
      id: number,
      patch: Partial<WorkflowRun>,
    ) => {
      const run = workflowRuns.find((candidate) => candidate.id === id);
      if (!run) throw new Error("Workflow run was not found");
      Object.assign(run, patch);
    };
    w.__LINKGO_SQL_MUTATE_DRAFT_GENERATION_REQUEST__ = (
      id: number,
      patch: Partial<DraftGenerationRequest>,
    ) => {
      const request = draftGenerationRequests.find(
        (candidate) => candidate.id === id,
      );
      if (!request) throw new Error("Draft generation request was not found");
      Object.assign(request, patch);
    };
    w.__LINKGO_SQL_SEED_LINKED_DRAFT_CANDIDATE_DELETE__ = () => {
      const candidate = candidatePosts.at(-1);
      if (candidate === undefined) throw new Error("Candidate was not found");
      const now = getNow();
      const workflowRunId = nextWorkflowRunId++;
      const workflowStepId = nextWorkflowStepId++;
      const requestId = nextDraftGenerationRequestId++;

      workflowRuns.push({
        id: workflowRunId,
        campaign_id: candidate.campaign_id,
        workflow_type: "content_pipeline",
        title: "Linked candidate deletion fixture",
        status: "running",
        current_step_key: "draft",
        context_summary: "Generated draft awaiting an operator decision",
        started_at: now,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
      workflowSteps.push({
        id: workflowStepId,
        workflow_run_id: workflowRunId,
        step_key: "draft",
        title: "Draft variants",
        description: "Create draft variants.",
        sort_order: 3,
        status: "running",
        output_summary: "Waiting for operator to save generated variants",
        error_message: "",
        started_at: now,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
      workflowArtifacts.push({
        id: nextWorkflowArtifactId++,
        workflow_run_id: workflowRunId,
        workflow_step_id: workflowStepId,
        artifact_type: "candidate_post",
        artifact_id: candidate.id,
        summary: `Candidate #${candidate.id} selected for drafting`,
        created_at: now,
        updated_at: now,
      });
      draftGenerationRequests.push({
        id: requestId,
        campaign_id: candidate.campaign_id,
        candidate_post_id: candidate.id,
        agent_run_id: null,
        provider_key: "openai",
        model_name: "mock-drafter",
        playbook_key: "linkedin_writer",
        variant_count: 3,
        content_intent: "idea",
        workflow_run_id: workflowRunId,
        workflow_step_id: workflowStepId,
        angle: "Generated workflow fixture",
        voice_notes: "",
        status: "generated",
        summary: "Three generated variants await a decision",
        generated_variants_json: "[]",
        error_message: "",
        created_draft_id: null,
        created_at: now,
        updated_at: now,
      });
      persistReloadSnapshot();
      return {
        candidateId: candidate.id,
        requestId,
        workflowRunId,
        workflowStepId,
      };
    };
    w.__LINKGO_SQL_SEED_PENDING_DRAFT_GENERATION__ = (
      withAgentRun: boolean,
    ) => {
      const draftStep = [...workflowSteps]
        .reverse()
        .find((step) => step.step_key === "draft");
      const workflowRun =
        draftStep === undefined
          ? undefined
          : workflowRuns.find((run) => run.id === draftStep.workflow_run_id);
      const candidateArtifact =
        workflowRun === undefined
          ? undefined
          : workflowArtifacts.find(
              (artifact) =>
                artifact.workflow_run_id === workflowRun.id &&
                artifact.artifact_type === "candidate_post",
            );
      const candidate =
        candidateArtifact === undefined
          ? undefined
          : candidatePosts.find(
              (row) => row.id === candidateArtifact.artifact_id,
            );
      if (
        workflowRun === undefined ||
        draftStep === undefined ||
        candidate === undefined
      ) {
        throw new Error("Planner draft scope was not found");
      }
      if (
        draftGenerationRequests.some(
          (request) =>
            request.workflow_step_id === draftStep.id &&
            ["pending", "generated"].includes(request.status),
        )
      ) {
        throw new Error("Planner draft scope already has an active request");
      }

      const now = getNow();
      workflowRun.status = "running";
      workflowRun.current_step_key = "draft";
      workflowRun.completed_at = null;
      workflowRun.updated_at = now;
      draftStep.status = "running";
      draftStep.error_message = "";
      draftStep.completed_at = null;
      draftStep.updated_at = now;

      let agentRunId: number | null = null;
      if (withAgentRun) {
        agentRunId = nextAgentRunId;
        agentRuns.push({
          id: agentRunId,
          campaign_id: workflowRun.campaign_id,
          workflow_run_id: workflowRun.id,
          workflow_step_id: null,
          agent_role: "drafter",
          provider_key: "openai",
          model_name: "mock-drafter",
          playbook_key: "linkedin_writer",
          status: "running",
          input_summary: "Interrupted durable draft generation fixture",
          input_context_json: "{}",
          output_summary: "",
          error_message: "",
          iteration_count: 0,
          started_at: now,
          completed_at: null,
          created_at: now,
          updated_at: now,
        });
        nextAgentRunId += 1;
      }

      const requestId = nextDraftGenerationRequestId;
      draftGenerationRequests.push({
        id: requestId,
        campaign_id: workflowRun.campaign_id,
        candidate_post_id: candidate.id,
        agent_run_id: agentRunId,
        provider_key: "openai",
        model_name: "mock-drafter",
        playbook_key: "linkedin_writer",
        variant_count: 3,
        content_intent: "idea",
        workflow_run_id: workflowRun.id,
        workflow_step_id: draftStep.id,
        angle: "Interrupted workflow recovery",
        voice_notes: "",
        status: "pending",
        summary: "",
        generated_variants_json: "[]",
        error_message: "",
        created_draft_id: null,
        created_at: now,
        updated_at: now,
      });
      nextDraftGenerationRequestId += 1;
      persistReloadSnapshot();
      return {
        requestId,
        agentRunId,
        workflowRunId: workflowRun.id,
        workflowStepId: draftStep.id,
      };
    };
    w.__LINKGO_SQL_PLAYBOOK_OVERRIDES__ = () =>
      cloneRows(agentPlaybookOverrides);
    w.__LINKGO_SQL_KEYWORDS__ = () => cloneRows(keywords);
    w.__LINKGO_SQL_CANDIDATE_POSTS__ = () => cloneRows(candidatePosts);
    w.__LINKGO_SQL_MUTATE_CANDIDATE__ = (
      id: number,
      patch: Partial<{
        campaign_id: number;
        status: CandidateStatus;
        relevance_score: number | null;
      }>,
    ) => {
      const candidate = candidatePosts.find((row) => row.id === id);
      if (!candidate) throw new Error("Candidate was not found");
      if (patch.campaign_id !== undefined)
        candidate.campaign_id = patch.campaign_id;
      if (patch.status !== undefined) candidate.status = patch.status;
      if (patch.relevance_score !== undefined) {
        candidate.relevance_score = patch.relevance_score;
      }
      candidate.updated_at = getNow();
    };
    w.__LINKGO_SQL_CANDIDATE_POLICIES__ = () =>
      cloneRows(candidateIntakePolicies);
    w.__LINKGO_SQL_CANDIDATE_POLICY_TOPICS__ = () =>
      cloneRows(candidatePolicyBannedTopics);
    w.__LINKGO_SQL_SOURCE_IMPORT_BATCHES__ = () =>
      cloneRows(sourceImportBatches);
    w.__LINKGO_SQL_SOURCE_IMPORT_ITEMS__ = () => cloneRows(sourceImportItems);
    w.__LINKGO_SQL_AUTOPILOT_PLANS__ = () => cloneRows(autopilotPlans);
    w.__LINKGO_SQL_AUTOPILOT_EVENTS__ = () => cloneRows(autopilotPlannerEvents);
    w.__LINKGO_SQL_AUTOPILOT_SETTINGS__ = () => ({
      ...autopilotPlannerSettings,
      running: autopilotPlannerRunning,
    });
    w.__LINKGO_SQL_SEED_AUTOPILOT_BATCH__ = (
      campaignId: number,
      options: {
        status?: SourceImportBatchStatus;
        currentCandidate?: boolean;
        acceptedCount?: number;
        createdAt?: string;
        candidateContent?: string;
      } = {},
    ) => {
      const campaign = campaigns.find((row) => row.id === campaignId);
      if (!campaign) throw new Error("Campaign was not found");
      const now = options.createdAt ?? getNow();
      const acceptedCount = options.acceptedCount ?? 1;
      const batchId = nextSourceImportBatchId;
      sourceImportBatches.push({
        id: batchId,
        campaign_id: campaignId,
        source_type: "local_json",
        status: options.status ?? "completed",
        total_count: Math.max(1, acceptedCount),
        accepted_count: acceptedCount,
        duplicate_count: 0,
        rejected_count: acceptedCount === 0 ? 1 : 0,
        error_message: "",
        created_at: now,
        updated_at: now,
      });
      nextSourceImportBatchId += 1;
      if (acceptedCount > 0) {
        let candidateId: number | null = null;
        if (options.currentCandidate !== false) {
          const targetId = nextTargetPostId;
          targetPosts.push({
            id: targetId,
            platform: "linkedin",
            url: `https://www.linkedin.com/posts/autopilot-${batchId}`,
            normalized_url: `https://www.linkedin.com/posts/autopilot-${batchId}`,
            platform_resource_urn: "",
            author_name: "Planner source",
            author_profile_url: "",
            posted_at: now,
            content: options.candidateContent ?? `Autopilot source ${batchId}`,
            content_hash: `autopilot-source-${batchId}`,
            created_at: now,
            updated_at: now,
          });
          nextTargetPostId += 1;
          candidateId = nextCandidatePostId;
          candidatePosts.push({
            id: candidateId,
            campaign_id: campaignId,
            target_post_id: targetId,
            source_keyword: "autopilot",
            status: "new",
            relevance_score: null,
            score_reason: "",
            notes: "",
            created_at: now,
            updated_at: now,
          });
          nextCandidatePostId += 1;
        }
        sourceImportItems.push({
          id: nextSourceImportItemId,
          source_import_batch_id: batchId,
          row_number: 1,
          status: "accepted",
          input_json: "{}",
          candidate_post_id: candidateId,
          reason: "Accepted",
          policy_rule_key: "",
          created_at: now,
          updated_at: now,
        });
        nextSourceImportItemId += 1;
      }
      persistReloadSnapshot();
      return batchId;
    };
    w.__LINKGO_SQL_CANDIDATE_DISCOVERY_ITEMS__ = () =>
      cloneRows(candidateDiscoveryItems);
    w.__LINKGO_SQL_CONTENT_CALENDAR_SLOTS__ = () =>
      cloneRows(contentCalendarSlots);
    w.__LINKGO_SQL_COMMENT_THREADS__ = () => cloneRows(commentThreads);
    w.__LINKGO_SQL_COMMENT_VARIANTS__ = () => cloneRows(commentVariants);
    w.__LINKGO_SQL_COMMENT_AUDITS__ = () => cloneRows(commentAudits);
    w.__LINKGO_SQL_COMMENT_ATTEMPTS__ = () => cloneRows(commentAttempts);
    w.__LINKGO_SQL_SAFETY_SETTINGS__ = () => ({ ...safetySettings });
    w.__LINKGO_SQL_SET_KILL_SWITCH__ = (enabled: boolean, reason = "") => {
      safetySettings.global_kill_switch = enabled ? 1 : 0;
      safetySettings.kill_switch_reason = enabled ? reason : "";
      safetySettings.updated_at = getNow();
      persistReloadSnapshot();
    };
    w.__LINKGO_SQL_SAFETY_AUDIT_EVENTS__ = () => cloneRows(safetyAuditEvents);
    w.__LINKGO_SQL_RATE_LIMIT_EVENTS__ = () => cloneRows(rateLimitEvents);
    w.__LINKGO_SQL_ERROR_QUEUE_ITEMS__ = () => cloneRows(errorQueueItems);
    w.__LINKGO_SQL_SCHEDULE_JOBS__ = () => cloneRows(scheduleJobs);
    w.__LINKGO_SQL_PUBLISH_ATTEMPTS__ = () => cloneRows(publishAttempts);
    w.__LINKGO_SQL_SCHEDULER_SETTINGS__ = () => ({ ...schedulerSettings });
    w.__LINKGO_SQL_SCHEDULER_EVENTS__ = () => cloneRows(schedulerEvents);
    w.__LINKGO_SQL_APP_SETTINGS__ = () => ({ ...appSettings });
    w.__LINKGO_SQL_BACKLOG_ITEMS__ = () => cloneRows(campaignBacklogItems);
    w.__LINKGO_SQL_SEED_BACKLOG_ITEM__ = (
      input: Partial<CampaignBacklogItem> &
        Pick<CampaignBacklogItem, "campaign_id" | "title">,
    ) => {
      const now = getNow();
      const item: CampaignBacklogItem = {
        id: nextCampaignBacklogItemId,
        campaign_id: input.campaign_id,
        recurrence_parent_id: input.recurrence_parent_id ?? null,
        work_type: input.work_type ?? "other",
        title: input.title,
        details: input.details ?? "",
        owner_type: input.owner_type ?? "operator",
        status: input.status ?? "pending",
        due_at: input.due_at ?? new Date(Date.now() + 3_600_000).toISOString(),
        recurrence: input.recurrence ?? "none",
        recurrence_timezone:
          input.recurrence_timezone ??
          (input.recurrence === "daily" || input.recurrence === "weekly"
            ? "UTC"
            : ""),
        completed_at: input.completed_at ?? null,
        cancelled_at: input.cancelled_at ?? null,
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      };
      campaignBacklogItems.push(item);
      nextCampaignBacklogItemId += 1;
      persistReloadSnapshot();
      return item.id;
    };
    w.__LINKGO_SQL_DELAY_BACKLOG_SELECTS__ = (
      campaignId: number | null,
      owner: "all" | "operator" | "linkgo" = "all",
    ) => {
      const key = `${campaignId ?? "all"}:${owner}`;
      backlogSelectGates.get(key)?.release();
      let release = (): void => {};
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      backlogSelectGates.set(key, { promise, release, pending: 0 });
    };
    w.__LINKGO_SQL_RELEASE_BACKLOG_SELECTS__ = (
      campaignId: number | null,
      owner: "all" | "operator" | "linkgo" = "all",
    ) => {
      backlogSelectGates.get(`${campaignId ?? "all"}:${owner}`)?.release();
    };
    w.__LINKGO_SQL_DELAYED_BACKLOG_SELECT_COUNT__ = (
      campaignId: number | null,
      owner: "all" | "operator" | "linkgo" = "all",
    ) =>
      backlogSelectGates.get(`${campaignId ?? "all"}:${owner}`)?.pending ?? 0;
    w.__LINKGO_DELAY_BACKLOG_MUTATIONS__ = () => {
      backlogMutationGate?.release();
      let release = (): void => {};
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      backlogMutationGate = { promise, release, pending: 0 };
    };
    w.__LINKGO_RELEASE_BACKLOG_MUTATIONS__ = () => {
      backlogMutationGate?.release();
    };
    w.__LINKGO_DELAYED_BACKLOG_MUTATION_COUNT__ = () =>
      backlogMutationGate?.pending ?? 0;
    w.__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__ = (campaignId: number) => {
      campaignSelectGates.get(campaignId)?.release();
      let release = (): void => {};
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      campaignSelectGates.set(campaignId, { promise, release, pending: 0 });
    };
    w.__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__ = (campaignId: number) => {
      campaignSelectGates.get(campaignId)?.release();
    };
    w.__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__ = (campaignId: number) =>
      campaignSelectGates.get(campaignId)?.pending ?? 0;
    w.__LINKGO_SQL_SET_CAMPAIGN_STATUS__ = (
      campaignId: number,
      status: Campaign["status"],
    ) => {
      const campaign = campaigns.find((row) => row.id === campaignId);
      if (!campaign) return;
      campaign.status = status;
      campaign.updated_at = getNow();
      persistReloadSnapshot();
    };
    w.__LINKGO_SQL_CREATE_CONTACT_ATTEMPT__ = (
      campaignId: number,
      identity: {
        normalizedUrl: string;
        platformResourceUrn?: string;
        authorProfileUrl?: string;
      },
      status: CommentAttemptStatus = "succeeded",
    ) => {
      if (!campaigns.some((campaign) => campaign.id === campaignId)) {
        throw new Error("Campaign was not found");
      }
      const now = getNow();
      const targetId = nextTargetPostId;
      targetPosts.push({
        id: targetId,
        platform: "linkedin",
        url: identity.normalizedUrl,
        normalized_url: identity.normalizedUrl,
        platform_resource_urn: identity.platformResourceUrn ?? "",
        author_name: "Prior contact",
        author_profile_url: identity.authorProfileUrl ?? "",
        posted_at: now,
        content: `Prior contacted target ${targetId}`,
        content_hash: `prior-contact-${targetId}`,
        created_at: now,
        updated_at: now,
      });
      nextTargetPostId += 1;
      const candidateId = nextCandidatePostId;
      candidatePosts.push({
        id: candidateId,
        campaign_id: campaignId,
        target_post_id: targetId,
        source_keyword: "",
        status: "shortlisted",
        relevance_score: null,
        score_reason: "",
        notes: "",
        created_at: now,
        updated_at: now,
      });
      nextCandidatePostId += 1;
      const threadId = nextCommentThreadId;
      commentThreads.push({
        id: threadId,
        campaign_id: campaignId,
        candidate_post_id: candidateId,
        status: status === "succeeded" ? "posted" : "approved",
        operator_notes: "",
        reviewer_notes: "",
        approved_at: now,
        rejected_at: null,
        posted_at: status === "succeeded" ? now : null,
        created_at: now,
        updated_at: now,
      });
      nextCommentThreadId += 1;
      commentAttempts.push({
        id: nextCommentAttemptId,
        comment_thread_id: threadId,
        platform: "linkedin",
        status,
        external_comment_url: "",
        platform_comment_id: "",
        idempotency_key: `contact-attempt-${nextCommentAttemptId}`,
        error_message: status === "failed" ? "Injected failure" : "",
        created_at: now,
      });
      nextCommentAttemptId += 1;
      persistReloadSnapshot();
    };
    w.__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__ = () => {
      reloadPersistenceEnabled = true;
      persistReloadSnapshot();
    };
    w.__LINKGO_SQL_CREATE_STALE_SOURCE_IMPORT__ = (
      campaignId: number,
      totalCount = 2,
    ) => {
      if (!campaigns.some((campaign) => campaign.id === campaignId)) {
        throw new Error("Campaign was not found");
      }
      const now = getNow();
      const batchId = nextSourceImportBatchId;
      sourceImportBatches.push({
        id: batchId,
        campaign_id: campaignId,
        source_type: "local_json",
        status: "processing",
        total_count: totalCount,
        accepted_count: 0,
        duplicate_count: 0,
        rejected_count: 0,
        error_message: "",
        created_at: now,
        updated_at: now,
      });
      nextSourceImportBatchId += 1;
      for (let index = 0; index < totalCount; index += 1) {
        const rowNumber = index + 1;
        sourceImportItems.push({
          id: nextSourceImportItemId,
          source_import_batch_id: batchId,
          row_number: rowNumber,
          status: "pending",
          input_json: JSON.stringify({
            url: `https://www.linkedin.com/posts/interrupted-${rowNumber}`,
            content: `Interrupted source row ${rowNumber}`,
          }),
          candidate_post_id: null,
          reason: "",
          policy_rule_key: "",
          created_at: now,
          updated_at: now,
        });
        nextSourceImportItemId += 1;
      }
      persistReloadSnapshot();
      return batchId;
    };

    w.__LINKGO_SQL_STATE_COUNTS__ = () => ({
      campaigns: campaigns.length,
      campaignBacklogItems: campaignBacklogItems.length,
      keywords: keywords.length,
      targetPosts: targetPosts.length,
      candidatePosts: candidatePosts.length,
      dedupeKeys: dedupeKeys.length,
      candidateIntakePolicies: candidateIntakePolicies.length,
      candidatePolicyBannedTopics: candidatePolicyBannedTopics.length,
      sourceImportBatches: sourceImportBatches.length,
      sourceImportItems: sourceImportItems.length,
      autopilotPlans: autopilotPlans.length,
      autopilotPlannerEvents: autopilotPlannerEvents.length,
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
      workflowStepExecutions: workflowStepExecutions.length,
      agentRuns: agentRuns.length,
      agentToolCalls: agentToolCalls.length,
      agentRunEvents: agentRunEvents.length,
      agentApprovalCheckpoints: agentApprovalCheckpoints.length,
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

    w.__LINKGO_AUTH_CLEAR_BASE_URL_OVERRIDE__ = (
      providerKey = "custom",
    ): void => {
      const account = connectedAccounts.find(
        (candidate) => candidate.provider_key === providerKey,
      );
      if (account === undefined)
        throw new Error("Connected account unavailable");
      account.has_base_url_override = false;
      const secret = providerSecrets[providerKey];
      if (secret !== undefined) delete secret.baseUrl;
    };

    function nativeScoringInput<T>(args?: unknown): T {
      return ((args as { input?: T } | undefined)?.input ?? {}) as T;
    }

    const KILL_SWITCH_SCORE_ERROR_PREFIX =
      "Global kill switch is enabled; candidate score application was blocked";

    class CommittedNativeScoringError extends Error {}

    function runNativeScoringMutation<T>(mutation: () => T): Promise<T> {
      const snapshot = createTransactionSnapshot();
      try {
        const result = mutation();
        persistReloadSnapshot();
        return Promise.resolve(result);
      } catch (error) {
        if (error instanceof CommittedNativeScoringError) {
          persistReloadSnapshot();
          return Promise.reject(new Error(error.message));
        }
        restoreTransactionSnapshot(snapshot, false);
        return Promise.reject(error);
      }
    }

    function plannerScoringScope(workflowRunId: number) {
      const run = workflowRuns.find((row) => row.id === workflowRunId);
      const campaign = run
        ? campaigns.find((row) => row.id === run.campaign_id)
        : undefined;
      const step = workflowSteps.find(
        (row) =>
          row.workflow_run_id === workflowRunId && row.step_key === "score",
      );
      const plan = autopilotPlans.find(
        (row) => row.workflow_run_id === workflowRunId,
      );
      if (!run || !campaign || !step || !plan) {
        throw new Error("Planner scoring workflow scope was not found");
      }
      if (plan.status !== "planned") {
        throw new Error("Autopilot plan is not available for scoring");
      }
      if (campaign.status === "archived")
        throw new Error("Campaign is archived");
      if (run.status === "cancelled") throw new Error("Workflow is cancelled");
      const artifacts = workflowArtifacts.filter(
        (artifact) =>
          artifact.workflow_run_id === workflowRunId &&
          artifact.artifact_type === "candidate_post",
      );
      if (artifacts.length === 0) {
        throw new Error("No candidate scope is attached to this score step");
      }
      const current = artifacts.flatMap((artifact) => {
        if (artifact.workflow_step_id !== step.id) {
          throw new Error(
            "Candidate scope is attached to a different workflow step",
          );
        }
        const candidate = candidatePosts.find(
          (row) => row.id === artifact.artifact_id,
        );
        if (!candidate) return [];
        if (candidate.campaign_id !== campaign.id) {
          throw new Error("Candidate scope contains a cross-campaign artifact");
        }
        return [candidate];
      });
      return {
        run,
        campaign,
        step,
        plan,
        artifacts,
        current,
        unscored: current.filter(
          (candidate) =>
            candidate.status === "new" && candidate.relevance_score === null,
        ),
      };
    }

    function syncNativeScoringBacklog(
      workflowRunId: number,
      stepStatus: WorkflowStepStatus,
    ): void {
      const plan = autopilotPlans.find(
        (row) => row.workflow_run_id === workflowRunId,
      );
      const item = campaignBacklogItems.find(
        (row) => row.id === plan?.campaign_backlog_item_id,
      );
      if (!item || ["completed", "cancelled"].includes(item.status)) return;
      const now = getNow();
      item.status =
        stepStatus === "running" || stepStatus === "waiting_approval"
          ? "in_progress"
          : stepStatus === "completed"
            ? "completed"
            : stepStatus === "skipped"
              ? "cancelled"
              : stepStatus === "pending"
                ? "pending"
                : "blocked";
      item.completed_at = item.status === "completed" ? now : null;
      item.cancelled_at = item.status === "cancelled" ? now : null;
      item.updated_at = now;
    }

    function addNativeWorkflowEvent(
      workflowRunId: number,
      workflowStepId: number,
      eventType: WorkflowEventType,
      summary: string,
    ): void {
      workflowEvents.push({
        id: nextWorkflowEventId,
        workflow_run_id: workflowRunId,
        workflow_step_id: workflowStepId,
        event_type: eventType,
        summary,
        created_at: getNow(),
      });
      nextWorkflowEventId += 1;
    }

    function failNativeScoringExecution(
      execution: WorkflowStepExecution,
      errorSummary: string,
    ): void {
      if (
        !["claimed", "running", "waiting_approval"].includes(execution.status)
      ) {
        return;
      }
      const now = getNow();
      const step = workflowSteps.find(
        (row) => row.id === execution.workflow_step_id,
      );
      const run = step
        ? workflowRuns.find((row) => row.id === step.workflow_run_id)
        : undefined;
      if (!step || !run)
        throw new Error("Workflow score execution was not found");
      execution.status = "failed";
      execution.error_summary = errorSummary;
      execution.completed_at = now;
      execution.updated_at = now;
      const agentRun = agentRuns.find(
        (row) => row.id === execution.agent_run_id,
      );
      if (
        agentRun &&
        ["queued", "running", "waiting_approval"].includes(agentRun.status)
      ) {
        agentRun.status = "failed";
        agentRun.error_message = errorSummary;
        agentRun.completed_at = now;
        agentRun.updated_at = now;
      }
      step.status = "failed";
      step.error_message = errorSummary;
      step.completed_at = null;
      step.updated_at = now;
      run.status = "failed";
      run.current_step_key = "score";
      run.completed_at = null;
      run.updated_at = now;
      syncNativeScoringBacklog(run.id, "failed");
      addNativeWorkflowEvent(run.id, step.id, "step_failed", errorSummary);
    }

    function blockNativeScoringForKillSwitch(
      agentRun: AgentRun,
      reason: string,
    ): never {
      const compactReason = reason.trim().replace(/\s+/gu, " ");
      const errorSummary = (
        compactReason
          ? `${KILL_SWITCH_SCORE_ERROR_PREFIX}: ${compactReason}`
          : KILL_SWITCH_SCORE_ERROR_PREFIX
      ).slice(0, 1000);
      const execution = workflowStepExecutions.find(
        (row) => row.agent_run_id === agentRun.id,
      );
      const step = workflowSteps.find(
        (row) => row.id === agentRun.workflow_step_id,
      );
      const run = workflowRuns.find(
        (row) => row.id === agentRun.workflow_run_id,
      );
      if (!execution || !step || !run) {
        throw new Error("Planner scorer run was not found");
      }

      const now = getNow();
      agentRun.status = "failed";
      agentRun.output_summary = "";
      agentRun.error_message = errorSummary;
      agentRun.completed_at = now;
      agentRun.updated_at = now;
      execution.status = "blocked";
      execution.error_summary = errorSummary;
      execution.completed_at = now;
      execution.updated_at = now;
      step.status = "blocked";
      step.output_summary = "";
      step.error_message = errorSummary;
      step.completed_at = null;
      step.updated_at = now;
      run.status = "blocked";
      run.current_step_key = "score";
      run.completed_at = null;
      run.updated_at = now;
      syncNativeScoringBacklog(run.id, "blocked");
      addNativeWorkflowEvent(run.id, step.id, "step_blocked", errorSummary);
      agentRunEvents.push({
        id: nextAgentRunEventId,
        agent_run_id: agentRun.id,
        event_type: "run_failed",
        summary: errorSummary,
        created_at: now,
      });
      nextAgentRunEventId += 1;
      safetyAuditEvents.push({
        id: nextSafetyAuditEventId,
        campaign_id: agentRun.campaign_id,
        subject_type: "agent_run",
        subject_id: agentRun.id,
        event_type: "agent_run_failed",
        severity: "block",
        summary: errorSummary,
        metadata_json: JSON.stringify({
          boundary: "relevance_score_application",
          reason: reason.slice(0, 1000),
        }),
        created_at: now,
      });
      nextSafetyAuditEventId += 1;
      throw new CommittedNativeScoringError(errorSummary);
    }

    function claimNativeScoringCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const input = nativeScoringInput<{
          workflowRunId: number;
          providerKey: AgentProviderKey;
          modelName: string;
          playbookKey: AgentPlaybookKey | "";
          inputSummary: string;
          inputContext: {
            campaign: { id: number };
            sourceBatchId: number;
            autopilotPlanId: number;
            workflowRunId: number;
            workflowStepId: number;
            candidates: Array<{ id: number }>;
          };
        }>(args);
        const scope = plannerScoringScope(input.workflowRunId);
        if (scope.unscored.length === 0) {
          throw new Error("No unscored candidates remain to claim");
        }
        if (!["pending", "blocked", "failed"].includes(scope.step.status)) {
          throw new Error("Workflow score step is already active or complete");
        }
        if (
          workflowStepExecutions.some(
            (execution) =>
              execution.workflow_step_id === scope.step.id &&
              ["claimed", "running", "waiting_approval"].includes(
                execution.status,
              ),
          )
        ) {
          throw new Error("Workflow score execution is already active");
        }
        const expectedIds = scope.unscored.map((candidate) => candidate.id);
        const contextIds = input.inputContext.candidates.map(
          (candidate) => candidate.id,
        );
        if (
          input.inputContext.campaign.id !== scope.campaign.id ||
          input.inputContext.sourceBatchId !==
            scope.plan.source_import_batch_id ||
          input.inputContext.autopilotPlanId !== scope.plan.id ||
          input.inputContext.workflowRunId !== scope.run.id ||
          input.inputContext.workflowStepId !== scope.step.id ||
          expectedIds.length !== new Set(contextIds).size ||
          expectedIds.some((id) => !contextIds.includes(id))
        ) {
          throw new Error(
            "Scorer context does not match the current planner scope",
          );
        }
        const now = getNow();
        const previousStepStatus = scope.step.status;
        scope.step.status = "running";
        scope.step.error_message = "";
        scope.step.completed_at = null;
        scope.step.started_at = scope.step.started_at ?? now;
        scope.step.updated_at = now;
        scope.run.status = "running";
        scope.run.current_step_key = "score";
        scope.run.completed_at = null;
        scope.run.started_at = scope.run.started_at ?? now;
        scope.run.updated_at = now;
        const attemptCount =
          Math.max(
            0,
            ...workflowStepExecutions
              .filter((row) => row.workflow_step_id === scope.step.id)
              .map((row) => row.attempt_count),
          ) + 1;
        const execution: WorkflowStepExecution = {
          id: nextWorkflowStepExecutionId,
          workflow_step_id: scope.step.id,
          agent_run_id: nextAgentRunId,
          executor_role: "scorer",
          attempt_count: attemptCount,
          status: "claimed",
          error_summary: "",
          started_at: now,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        workflowStepExecutions.push(execution);
        nextWorkflowStepExecutionId += 1;
        const agentRun: AgentRun = {
          id: nextAgentRunId,
          campaign_id: scope.campaign.id,
          workflow_run_id: scope.run.id,
          workflow_step_id: scope.step.id,
          agent_role: "scorer",
          provider_key: input.providerKey,
          model_name: input.modelName,
          playbook_key: input.playbookKey,
          status: "queued",
          input_summary: input.inputSummary,
          input_context_json: JSON.stringify(input.inputContext),
          output_summary: "",
          error_message: "",
          iteration_count: 0,
          started_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        agentRuns.push(agentRun);
        nextAgentRunId += 1;
        agentRunEvents.push({
          id: nextAgentRunEventId,
          agent_run_id: agentRun.id,
          event_type: "run_created",
          summary: "Agent run created for scorer.",
          created_at: now,
        });
        nextAgentRunEventId += 1;
        workflowArtifacts.push({
          id: nextWorkflowArtifactId,
          workflow_run_id: scope.run.id,
          workflow_step_id: scope.step.id,
          artifact_type: "agent_run",
          artifact_id: agentRun.id,
          summary: `Scorer run for ${expectedIds.length} attached candidates`,
          created_at: now,
          updated_at: now,
        });
        nextWorkflowArtifactId += 1;
        addNativeWorkflowEvent(
          scope.run.id,
          scope.step.id,
          previousStepStatus === "pending" ? "step_started" : "step_resumed",
          previousStepStatus === "pending"
            ? "Score relevance started"
            : "Score relevance resumed",
        );
        syncNativeScoringBacklog(scope.run.id, "running");
        return {
          executionId: execution.id,
          agentRunId: agentRun.id,
          workflowRunId: scope.run.id,
          workflowStepId: scope.step.id,
        };
      });
    }

    function startNativeScoringCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const { agentRunId } = nativeScoringInput<{ agentRunId: number }>(args);
        const run = agentRuns.find((row) => row.id === agentRunId);
        const execution = workflowStepExecutions.find(
          (row) => row.agent_run_id === agentRunId,
        );
        if (!run || run.agent_role !== "scorer" || !execution) {
          throw new Error("Planner scorer run was not found");
        }
        if (run.status !== "queued") {
          throw new Error("Planner scorer run could not be claimed for start");
        }
        if (safetySettings.global_kill_switch === 1) {
          throw new Error("Global kill switch is enabled");
        }
        const now = getNow();
        run.status = "running";
        run.started_at = run.started_at ?? now;
        run.completed_at = null;
        run.error_message = "";
        run.updated_at = now;
        execution.status = "running";
        execution.updated_at = now;
        return undefined;
      });
    }

    function applyNativeScoresCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const input = nativeScoringInput<{
          agentRunId: number;
          campaignId: number;
          candidatePostIds: number[];
          minimumScore: number;
          autoRejectBelowMinimum: boolean;
          scores: Array<{
            candidatePostId: number;
            score: number;
            rationale: string;
          }>;
        }>(args);
        const run = agentRuns.find((row) => row.id === input.agentRunId);
        const campaign = campaigns.find((row) => row.id === input.campaignId);
        if (
          !run ||
          run.agent_role !== "scorer" ||
          run.status !== "running" ||
          run.campaign_id !== input.campaignId
        ) {
          throw new Error("Score request belongs to a different campaign");
        }
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        if (safetySettings.global_kill_switch === 1) {
          blockNativeScoringForKillSwitch(
            run,
            safetySettings.kill_switch_reason,
          );
        }
        const scoreIds = input.scores.map((score) => score.candidatePostId);
        if (
          input.candidatePostIds.length !== new Set(scoreIds).size ||
          input.candidatePostIds.some((id) => !scoreIds.includes(id))
        ) {
          throw new Error(
            "Score entries must match the requested candidate post IDs exactly",
          );
        }
        const context = JSON.parse(run.input_context_json) as {
          workflowRunId?: number;
          workflowStepId?: number;
          minimumScore?: number;
          autoRejectBelowMinimum?: boolean;
          candidates?: Array<{ id: number }>;
        };
        const plannerLinked = autopilotPlans.some(
          (plan) =>
            plan.workflow_run_id === run.workflow_run_id &&
            plan.status === "planned",
        );
        if (plannerLinked && !Array.isArray(context.candidates)) {
          throw new Error("Stored planner scorer context is invalid");
        }
        if (Array.isArray(context.candidates)) {
          const expectedIds = context.candidates.map(
            (candidate) => candidate.id,
          );
          if (
            context.workflowRunId !== run.workflow_run_id ||
            context.workflowStepId !== run.workflow_step_id ||
            context.minimumScore !== input.minimumScore ||
            context.autoRejectBelowMinimum !== input.autoRejectBelowMinimum ||
            expectedIds.length !== new Set(input.candidatePostIds).size ||
            expectedIds.some((id) => !input.candidatePostIds.includes(id))
          ) {
            throw new Error(
              "Score request does not match the attached workflow scope",
            );
          }
        }
        const owned = input.candidatePostIds.map((id) =>
          candidatePosts.find((candidate) => candidate.id === id),
        );
        if (
          owned.some(
            (candidate) =>
              !candidate || candidate.campaign_id !== input.campaignId,
          )
        ) {
          throw new Error(
            "Scoring scope contains a missing or foreign candidate",
          );
        }
        for (const candidate of owned) {
          if (
            candidate?.status !== "new" ||
            candidate.relevance_score !== null
          ) {
            throw new Error(
              `Candidate #${candidate?.id ?? 0} changed before scores were committed`,
            );
          }
        }
        const now = getNow();
        return input.scores.map((score) => {
          const candidate = candidatePosts.find(
            (row) => row.id === score.candidatePostId,
          );
          if (!candidate) throw new Error("Scoring candidate disappeared");
          const rationale = score.rationale
            .trim()
            .replace(/\s+/gu, " ")
            .slice(0, 500);
          candidate.relevance_score = score.score;
          candidate.score_reason = rationale;
          if (
            input.autoRejectBelowMinimum &&
            score.score < input.minimumScore
          ) {
            candidate.status = "rejected";
          }
          candidate.updated_at = now;
          return { ...score, rationale };
        });
      });
    }

    function settleNativeScoringCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const input = nativeScoringInput<{
          workflowRunId: number;
          outcome: "completed" | "blocked";
          summary: string;
        }>(args);
        const scope = plannerScoringScope(input.workflowRunId);
        if (input.outcome === "completed" && scope.unscored.length > 0) {
          throw new Error(
            "Unscored candidates appeared before no-work completion",
          );
        }
        const now = getNow();
        if (input.outcome === "blocked") {
          scope.step.status = "blocked";
          scope.step.error_message = input.summary;
          scope.step.completed_at = null;
          scope.run.status = "blocked";
          scope.run.current_step_key = "score";
          scope.run.completed_at = null;
          addNativeWorkflowEvent(
            scope.run.id,
            scope.step.id,
            "step_blocked",
            input.summary,
          );
        } else {
          scope.step.status = "completed";
          scope.step.output_summary = input.summary;
          scope.step.error_message = "";
          scope.step.started_at = scope.step.started_at ?? now;
          scope.step.completed_at = scope.step.completed_at ?? now;
          addNativeWorkflowEvent(
            scope.run.id,
            scope.step.id,
            "step_completed",
            input.summary,
          );
          const draft = workflowSteps.find(
            (step) =>
              step.workflow_run_id === scope.run.id &&
              step.step_key === "draft" &&
              step.status === "pending",
          );
          if (draft) {
            draft.status = "running";
            draft.started_at = draft.started_at ?? now;
            draft.updated_at = now;
            scope.run.status = "running";
            scope.run.current_step_key = "draft";
            addNativeWorkflowEvent(
              scope.run.id,
              draft.id,
              "step_started",
              "Draft variants started",
            );
          }
        }
        scope.step.updated_at = now;
        scope.run.updated_at = now;
        syncNativeScoringBacklog(scope.run.id, input.outcome);
        return undefined;
      });
    }

    function failNativeScoringCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const input = nativeScoringInput<{
          executionId: number;
          workflowRunId: number;
          workflowStepId: number;
          errorSummary: string;
        }>(args);
        const execution = workflowStepExecutions.find(
          (row) =>
            row.id === input.executionId &&
            row.workflow_step_id === input.workflowStepId,
        );
        const step = workflowSteps.find(
          (row) => row.id === input.workflowStepId,
        );
        if (!execution || step?.workflow_run_id !== input.workflowRunId) {
          throw new Error("Workflow score execution claim was not found");
        }
        failNativeScoringExecution(execution, input.errorSummary);
        return undefined;
      });
    }

    function reconcileNativeScoringCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const input = nativeScoringInput<{
          agentRunId: number;
          status: "completed" | "failed" | "waiting_approval";
          outputSummary: string;
          errorMessage: string;
          iterationCount: number;
          toolCalls: Array<{
            providerToolCallId: string;
            toolName: AgentToolName;
            status: AgentToolCallStatus;
            requiresApproval: boolean;
            input: unknown;
            output: unknown;
            errorMessage: string;
          }>;
        }>(args);
        if (!["completed", "failed"].includes(input.status)) {
          throw new Error("Planner scorer result must be completed or failed");
        }
        const agentRun = agentRuns.find((row) => row.id === input.agentRunId);
        const execution = workflowStepExecutions.find(
          (row) => row.agent_run_id === input.agentRunId,
        );
        if (!agentRun || !execution) {
          throw new Error("Planner scorer run is no longer active");
        }
        if (agentRun.status !== "running") {
          if (
            agentRun.status === "failed" &&
            input.status === "failed" &&
            agentRun.error_message.startsWith(KILL_SWITCH_SCORE_ERROR_PREFIX)
          ) {
            return undefined;
          }
          throw new Error("Planner scorer run is no longer active");
        }
        const scope = plannerScoringScope(agentRun.workflow_run_id ?? 0);
        if (input.status === "completed" && scope.unscored.length > 0) {
          throw new Error("Unscored candidates remain after scorer completion");
        }
        const now = getNow();
        for (const toolCall of input.toolCalls) {
          agentToolCalls.push({
            id: nextAgentToolCallId,
            agent_run_id: agentRun.id,
            provider_tool_call_id: toolCall.providerToolCallId,
            tool_name: toolCall.toolName,
            status: toolCall.status,
            requires_approval: toolCall.requiresApproval ? 1 : 0,
            input_json: JSON.stringify(toolCall.input),
            output_json: JSON.stringify(toolCall.output),
            error_message: toolCall.errorMessage,
            started_at: now,
            completed_at: ["completed", "failed", "rejected"].includes(
              toolCall.status,
            )
              ? now
              : null,
            created_at: now,
          });
          nextAgentToolCallId += 1;
        }
        agentRun.status = input.status;
        agentRun.output_summary = input.outputSummary;
        agentRun.error_message =
          input.status === "failed" ? input.errorMessage : "";
        agentRun.iteration_count = input.iterationCount;
        agentRun.completed_at = now;
        agentRun.updated_at = now;
        execution.status = input.status;
        execution.error_summary =
          input.status === "failed" ? input.errorMessage : "";
        execution.completed_at = now;
        execution.updated_at = now;
        scope.step.status = input.status;
        scope.step.output_summary =
          input.status === "completed" ? input.outputSummary : "";
        scope.step.error_message =
          input.status === "failed" ? input.errorMessage : "";
        scope.step.completed_at = input.status === "completed" ? now : null;
        scope.step.updated_at = now;
        addNativeWorkflowEvent(
          scope.run.id,
          scope.step.id,
          input.status === "completed" ? "step_completed" : "step_failed",
          input.status === "completed"
            ? input.outputSummary
            : input.errorMessage,
        );
        if (input.status === "completed") {
          const draft = workflowSteps.find(
            (step) =>
              step.workflow_run_id === scope.run.id &&
              step.step_key === "draft" &&
              step.status === "pending",
          );
          if (draft) {
            draft.status = "running";
            draft.started_at = draft.started_at ?? now;
            draft.updated_at = now;
            addNativeWorkflowEvent(
              scope.run.id,
              draft.id,
              "step_started",
              "Draft variants started",
            );
          }
          scope.run.status = "running";
          scope.run.current_step_key = "draft";
          syncNativeScoringBacklog(scope.run.id, "completed");
        } else {
          scope.run.status = "failed";
          scope.run.current_step_key = "score";
          syncNativeScoringBacklog(scope.run.id, "failed");
        }
        scope.run.completed_at = null;
        scope.run.updated_at = now;
        return undefined;
      });
    }

    function failNativeScoringAgentCommand(args?: unknown): Promise<unknown> {
      return runNativeScoringMutation(() => {
        const input = nativeScoringInput<{
          agentRunId: number;
          errorSummary: string;
        }>(args);
        const execution = workflowStepExecutions.find(
          (row) => row.agent_run_id === input.agentRunId,
        );
        if (!execution) throw new Error("Planner scorer run was not found");
        failNativeScoringExecution(execution, input.errorSummary);
        return undefined;
      });
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
        if (cmd === "linkgo_campaign_backlog_create") {
          return runCampaignBacklogCommand(() =>
            createCampaignBacklogCommand(args),
          );
        }
        if (cmd === "linkgo_campaign_backlog_update") {
          return runCampaignBacklogCommand(() =>
            updateCampaignBacklogCommand(args),
          );
        }
        if (cmd === "linkgo_campaign_backlog_set_status") {
          return runCampaignBacklogCommand(() =>
            setCampaignBacklogStatusCommand(args),
          );
        }
        if (cmd === "linkgo_relevance_scoring_claim") {
          return claimNativeScoringCommand(args);
        }
        if (cmd === "linkgo_relevance_scoring_start") {
          return startNativeScoringCommand(args);
        }
        if (cmd === "linkgo_relevance_scoring_apply_scores") {
          return applyNativeScoresCommand(args);
        }
        if (cmd === "linkgo_relevance_scoring_settle") {
          return settleNativeScoringCommand(args);
        }
        if (cmd === "linkgo_relevance_scoring_fail") {
          return failNativeScoringCommand(args);
        }
        if (cmd === "linkgo_relevance_scoring_reconcile") {
          return reconcileNativeScoringCommand(args);
        }
        if (cmd === "linkgo_relevance_scoring_fail_agent") {
          return failNativeScoringAgentCommand(args);
        }
        if (cmd === "plugin:sql|select")
          return selectSqlWithCampaignDelay(args);
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
        if (cmd === "linkgo_autopilot_planner_status") {
          const override = w.__LINKGO_AUTOPILOT_STATUS_RESULT__;
          return Promise.resolve(
            override === undefined ? autopilotPlannerStatusPayload() : override,
          );
        }
        if (cmd === "linkgo_autopilot_planner_start") {
          if (safetySettings.global_kill_switch === 1) {
            recordAutopilotPlannerEvent(
              "planner_blocked",
              "Autopilot planner start blocked by the global kill switch.",
              { severity: "warning" },
            );
            throw new Error(
              safetySettings.kill_switch_reason.trim()
                ? `Global kill switch is enabled: ${safetySettings.kill_switch_reason}`
                : "Global kill switch is enabled",
            );
          }
          autopilotPlannerSettings.enabled = 1;
          autopilotPlannerSettings.updated_at = getNow();
          autopilotPlannerRunning = true;
          recordAutopilotPlannerEvent(
            "planner_started",
            "Background autopilot planner started.",
            { metadata: { runnerId: "mock-autopilot" } },
          );
          queueMicrotask(() => runAutopilotPlannerTickMock());
          return Promise.resolve(autopilotPlannerStatusPayload());
        }
        if (cmd === "linkgo_autopilot_planner_stop") {
          autopilotPlannerSettings.enabled = 0;
          autopilotPlannerSettings.updated_at = getNow();
          autopilotPlannerRunning = false;
          recordAutopilotPlannerEvent(
            "planner_stopped",
            "Background autopilot planner stopped.",
            { metadata: { runnerId: "mock-autopilot" } },
          );
          return Promise.resolve(autopilotPlannerStatusPayload());
        }
        if (cmd === "linkgo_autopilot_planner_tick") {
          const error = w.__LINKGO_AUTOPILOT_TICK_ERROR__;
          if (typeof error === "string" && error.trim() !== "") {
            throw new Error(error);
          }
          return Promise.resolve(runAutopilotPlannerTickMock());
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
  }, MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH);
}
