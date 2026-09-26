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
      content_revision?: number;
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
      workflow_step_execution_id: number | null;
    };

    type DraftAiAuditFinding = {
      id: number;
      audit_run_id: number;
      rule_key: string;
      severity: DraftAuditSeverity;
      message: string;
      created_at: string;
    };

    type DraftQualityRun = {
      id: number;
      draft_variant_id: number;
      current_content_revision: number;
      provider_key: AgentProviderKey;
      model_name: string;
      status: "running" | "passed" | "needs_revision" | "failed";
      final_score: number | null;
      summary: string;
      applied_rewrite_count: number;
      active_agent_run_id: number | null;
      active_ai_audit_run_id: number | null;
      error_message: string;
      updated_at: string;
    };

    type DraftQualityAttempt = {
      id: number;
      run_id: number;
      attempt_number: number;
      content_revision: number;
      agent_run_id: number;
      status: "scoring" | "passed" | "rewritten" | "failed";
    };

    // Mirrors the native `draft_quality_category_scores` table columns.
    type DraftQualityCategoryScore = {
      id: number;
      attempt_id: number;
      category_key:
        | "hook_strength"
        | "authenticity"
        | "linkedin_fit"
        | "specificity"
        | "narrative_structure";
      score: number;
      feedback: string;
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
      reviewed_content_revision: number | null;
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
      draftQualityRuns: DraftQualityRun[];
      draftQualityAttempts: DraftQualityAttempt[];
      draftQualityCategoryScores?: DraftQualityCategoryScore[];
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
      nextCandidateDiscoveryItemId: number;
      nextDraftId: number;
      nextDraftVariantId: number;
      nextDraftAuditId: number;
      nextDraftAiAuditRunId: number;
      nextDraftAiAuditFindingId: number;
      nextDraftQualityRunId: number;
      nextDraftQualityAttemptId: number;
      nextDraftQualityCategoryScoreId?: number;
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
    const draftQualityRuns: DraftQualityRun[] = [];
    const draftQualityAttempts: DraftQualityAttempt[] = [];
    const draftQualityCategoryScores: DraftQualityCategoryScore[] = [];
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
    let agentContinuationSettlementInvocations = Number(
      sessionStorage.getItem("linkgo-agent-continuation-settlement-count") ??
        "0",
    );
    const activeAgentContinuationSettlements = new Set<number>();
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
    let nextDraftQualityRunId = 1;
    let nextDraftQualityAttemptId = 1;
    let nextDraftQualityCategoryScoreId = 1;
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
      const sqlArgs = (args ?? {}) as {
        query?: string;
        values?: unknown[];
        input?: { query?: string; values?: unknown[] };
        payload?: {
          query?: string;
          values?: unknown[];
          input?: { query?: string; values?: unknown[] };
        };
      };
      const input =
        sqlArgs.input ?? sqlArgs.payload?.input ?? sqlArgs.payload ?? sqlArgs;
      return {
        query: input.query ?? "",
        values: input.values ?? [],
      };
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
        draftQualityRuns: cloneRows(draftQualityRuns),
        draftQualityAttempts: cloneRows(draftQualityAttempts),
        draftQualityCategoryScores: cloneRows(draftQualityCategoryScores),
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
        nextDraftQualityRunId,
        nextDraftQualityAttemptId,
        nextDraftQualityCategoryScoreId,
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
      if (snapshot.draftQualityRuns !== draftQualityRuns)
        restoreRows(draftQualityRuns, snapshot.draftQualityRuns ?? []);
      if (snapshot.draftQualityAttempts !== draftQualityAttempts)
        restoreRows(draftQualityAttempts, snapshot.draftQualityAttempts ?? []);
      restoreRows(
        draftQualityCategoryScores,
        snapshot.draftQualityCategoryScores ?? [],
      );
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
      nextDraftQualityRunId = snapshot.nextDraftQualityRunId ?? 1;
      nextDraftQualityAttemptId = snapshot.nextDraftQualityAttemptId ?? 1;
      nextDraftQualityCategoryScoreId =
        snapshot.nextDraftQualityCategoryScoreId ?? 1;
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
        .filter((row) => row !== null)
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
      // Mirrors native `drafts_reads.rs` ORDER BY: status rank, then
      // updated_at DESC, then id DESC.
      const statusRank: Record<string, number> = {
        generated: 1,
        failed: 2,
        pending: 3,
        saved: 4,
        dismissed: 5,
      };
      const rankOf = (status: unknown): number =>
        statusRank[String(status)] ?? 6;
      return rows.sort(
        (left, right) =>
          rankOf(left.status) - rankOf(right.status) ||
          String(right.updated_at).localeCompare(String(left.updated_at)) ||
          Number(right.id) - Number(left.id),
      );
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
        reviewed_content_revision: approval.reviewed_content_revision,
        current_content_revision: variant.content_revision,
        readiness: isApprovalReady(variant) ? 1 : 0,
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

    const approvalAiAuditRuleKeys = new Set([
      "hook",
      "specificity",
      "generic_language",
      "authenticity",
      "clarity",
      "safety",
    ]);

    function isApprovalAiAuditReady(variant: DraftVariant): boolean {
      const latestRun = draftAiAuditRuns
        .filter(
          (run) =>
            run.draft_variant_id === variant.id &&
            run.content_revision === variant.content_revision,
        )
        .sort((left, right) => right.id - left.id)[0];
      if (latestRun?.status !== "completed") return false;
      const findings = draftAiAuditFindings.filter(
        (finding) => finding.audit_run_id === latestRun.id,
      );
      return (
        findings.length === 6 &&
        findings.every((finding) =>
          approvalAiAuditRuleKeys.has(finding.rule_key),
        ) &&
        !findings.some((finding) => finding.severity === "block")
      );
    }

    function latestQualityRun(
      variant: DraftVariant,
    ): DraftQualityRun | undefined {
      return draftQualityRuns
        .filter(
          (run) =>
            run.draft_variant_id === variant.id &&
            run.current_content_revision === variant.content_revision,
        )
        .sort((left, right) => right.id - left.id)[0];
    }

    function isApprovalQualityReady(variant: DraftVariant): boolean {
      const run = latestQualityRun(variant);
      return run?.status === "passed" && (run.final_score ?? 0) >= 70;
    }

    function requireCurrentQualityEvidence(
      run: DraftQualityRun,
      variant: DraftVariant,
    ): void {
      if (latestQualityRun(variant)?.id !== run.id)
        throw new Error("Draft quality run has been superseded");
      if (!isApprovalAiAuditReady(variant))
        throw new Error(
          "Current revision requires a completed canonical non-blocking latest AI audit",
        );
    }

    function isApprovalReady(variant: DraftVariant): boolean {
      const draft = drafts.find((row) => row.id === variant.draft_id);
      const campaign = campaigns.find((row) => row.id === draft?.campaign_id);
      return (
        !!draft &&
        !!campaign &&
        campaign.status !== "archived" &&
        ["ready_for_review", "needs_revision"].includes(draft.status) &&
        variant.status === "selected" &&
        draftVariants.filter(
          (row) => row.draft_id === draft.id && row.status === "selected",
        ).length === 1 &&
        isApprovalAiAuditReady(variant) &&
        isApprovalQualityReady(variant) &&
        [
          "required_text",
          "total_length",
          "external_link",
          "hashtag_limit",
        ].every((key) =>
          draftAudits.some(
            (audit) =>
              audit.draft_variant_id === variant.id &&
              audit.content_revision === variant.content_revision &&
              audit.rule_key === key,
          ),
        ) &&
        !draftAudits.some(
          (audit) =>
            audit.draft_variant_id === variant.id &&
            audit.content_revision === variant.content_revision &&
            audit.severity === "block",
        )
      );
    }

    function revokeEditedApproval(variant: DraftVariant): void {
      for (const approval of approvals) {
        if (
          approval.draft_variant_id !== variant.id ||
          !["needs_review", "approved", "scheduled"].includes(approval.status)
        )
          continue;
        approval.status = "changes_requested";
        for (const job of scheduleJobs) {
          if (job.approval_id === approval.id && job.status === "scheduled")
            job.status = "cancelled";
        }
      }
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
      if (
        selectedVariants.length !== 1 ||
        !variant ||
        !isApprovalReady(variant)
      )
        return null;
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
        .filter((row) => row !== null)
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
        .filter((row) => row !== null)
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
        .filter((row) => row !== null)
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
        .filter((row) => row !== null)
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
            approval_id: approval.id,
            publish_attempt_id: publishAttempt.id,
            publish_external_post_url: publishAttempt.external_post_url,
            publish_platform_post_id: publishAttempt.platform_post_id,
            publish_created_at: publishAttempt.created_at,
          };
        })
        .filter((row) => row !== null)
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
        .filter((row) => row !== null)
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
        .filter((row) => row !== null)
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

    /**
     * Mirrors native `draft_quality::quality_start_blocked_sql`: 1 when the
     * agent scores a quality attempt or runs its rewrite audit, and is not the
     * active agent of that attempt's running quality run.
     */
    function qualityStartBlocked(agentRunId: number): 0 | 1 {
      const blocked = draftQualityAttempts.some((attempt) => {
        const audit = draftAiAuditRuns.find(
          (row) => row.id === attempt.ai_audit_run_id,
        );
        const linked =
          attempt.agent_run_id === agentRunId ||
          audit?.agent_run_id === agentRunId;
        if (!linked) return false;
        return !draftQualityRuns.some(
          (run) =>
            run.id === attempt.run_id &&
            run.status === "running" &&
            run.active_agent_run_id === agentRunId,
        );
      });
      return blocked ? 1 : 0;
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
        .filter((row) => row !== null)
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

    /** Mirrors `src-tauri/src/playbooks.rs` and `settings.rs`. */
    function mockPlaybookAndSettingsCommand(
      cmd: string,
      args: unknown,
    ): unknown {
      if (cmd === "linkgo_playbook_override_list") {
        return Promise.resolve(
          [...agentPlaybookOverrides]
            .sort((left, right) =>
              left.playbook_key < right.playbook_key
                ? -1
                : left.playbook_key > right.playbook_key
                  ? 1
                  : 0,
            )
            .map((row) => ({ ...row })),
        );
      }
      if (cmd === "linkgo_playbook_override_upsert") {
        return runNativeMutation(() => {
          const input = nativeInput<{
            playbookKey: string;
            enabled: boolean;
            customInstructions?: string;
          }>(args);
          if (
            !VALID_AGENT_PLAYBOOK_KEYS.includes(
              input.playbookKey as AgentPlaybookKey,
            )
          )
            throw new Error("Unknown playbook");
          const customInstructions = (input.customInstructions ?? "").trim();
          if (customInstructions.length > 2000)
            throw new Error(
              "Custom instructions must be at most 2000 characters",
            );
          const key = input.playbookKey as AgentPlaybookKey;
          const enabled = input.enabled ? 1 : 0;
          const now = getNow();
          const existing = agentPlaybookOverrides.find(
            (override) => override.playbook_key === key,
          );
          if (existing) {
            existing.enabled = enabled;
            existing.custom_instructions = customInstructions;
            existing.updated_at = now;
          } else {
            agentPlaybookOverrides.push({
              playbook_key: key,
              enabled,
              custom_instructions: customInstructions,
              updated_at: now,
            });
          }
          return null;
        });
      }
      if (cmd === "linkgo_settings_launch_on_login_sync") {
        return runNativeMutation(() => {
          const input = nativeInput<{
            osEnabled: boolean;
            lastError?: string;
          }>(args);
          const now = getNow();
          appSettings.launch_on_login_enabled = input.osEnabled ? 1 : 0;
          appSettings.launch_on_login_last_synced_at = now;
          if (input.lastError !== undefined)
            appSettings.launch_on_login_last_error = input.lastError.slice(
              0,
              500,
            );
          appSettings.updated_at = now;
          return { ...appSettings };
        });
      }
      if (cmd === "linkgo_settings_launch_on_login_error_record") {
        return runNativeMutation(() => {
          const input = nativeInput<{ message: string }>(args);
          appSettings.launch_on_login_last_error = input.message.slice(0, 500);
          appSettings.updated_at = getNow();
          return null;
        });
      }
      return undefined;
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
        .filter((row) => row !== null)
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
      return (
        candidatePosts
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
          // Mirrors native `comment_reads.rs` ORDER BY: updated_at DESC, id DESC.
          .sort(
            (left, right) =>
              right.updated_at.localeCompare(left.updated_at) ||
              right.id - left.id,
          )
          .map(selectCommentCandidateRow)
          .filter((row) => row !== null)
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
        .filter((row) => row !== null)
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
          return selectSafetyErrorQueue([]).filter(
            (item) => Number((item as Record<string, unknown>).id) === id,
          );
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
        query.includes("FROM draft_variants dv") &&
        query.includes("approval_ready_variants")
      ) {
        const variantId = Number(values.at(-1) ?? 0);
        const variant = draftVariants.find((row) => row.id === variantId);
        const count = variant && isApprovalReady(variant) ? 1 : 0;
        return [
          {
            count,
          },
        ];
      }
      if (
        query.includes("COUNT(*) AS count FROM approval_ready_variants ready")
      ) {
        const approval = approvals.find((row) => row.id === Number(values[0]));
        const variant = draftVariants.find(
          (row) => row.id === approval?.draft_variant_id,
        );
        return [
          {
            count:
              variant &&
              variant.content_revision === Number(values[1]) &&
              isApprovalReady(variant)
                ? 1
                : 0,
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
      if (
        query.includes("FROM agent_runs ar") &&
        query.includes("WHERE ar.id = $1")
      ) {
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
        query.includes("dgr.created_draft_id") &&
        query.includes("artifact_type = 'draft'")
      ) {
        const workflowRunId = Number(values[0] ?? 0);
        const run = workflowRuns.find((row) => row.id === workflowRunId);
        const auditStep = workflowSteps.find(
          (row) =>
            row.workflow_run_id === workflowRunId && row.step_key === "audit",
        );
        const artifact = workflowArtifacts.find(
          (row) =>
            row.workflow_run_id === workflowRunId &&
            row.artifact_type === "draft",
        );
        const draft = drafts.find((row) => row.id === artifact?.artifact_id);
        const requests = draftGenerationRequests.filter(
          (row) => row.created_draft_id === draft?.id && row.status === "saved",
        );
        const plan = autopilotPlans.find(
          (row) =>
            row.workflow_run_id === workflowRunId && row.status === "planned",
        );
        if (!run || !auditStep || !artifact || !draft || !plan) return [];
        return requests.map((request) => ({
          campaign_id: run.campaign_id,
          workflow_step_id: auditStep.id,
          draft_id: draft.id,
          request_id: request.id,
          provider_key: request.provider_key,
          model_name: request.model_name,
          request_run_id: request.workflow_run_id,
          request_step_id: request.workflow_step_id,
          request_campaign_id: request.campaign_id,
          created_draft_id: request.created_draft_id,
          draft_campaign_id: draft.campaign_id,
        }));
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
      if (query.includes("FROM draft_quality_runs dqr")) {
        const variantIds = new Set(values.map(Number));
        return draftQualityRuns
          .filter((run) => {
            const variant = draftVariants.find(
              (row) => row.id === run.draft_variant_id,
            );
            return (
              variantIds.has(run.draft_variant_id) &&
              run.current_content_revision === variant?.content_revision
            );
          })
          .sort((left, right) => right.id - left.id);
      }
      if (query.includes("FROM draft_quality_attempts")) {
        const runIds = new Set(values.map(Number));
        return draftQualityAttempts
          .filter((attempt) => runIds.has(attempt.run_id))
          .sort((left, right) => left.attempt_number - right.attempt_number);
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
      if (
        query.includes("FROM draft_ai_audit_runs dar") &&
        query.includes("dar.content_revision = dv.content_revision")
      ) {
        const variantIds = new Set(values.map(Number));
        return draftAiAuditRuns
          .filter((run) => variantIds.has(run.draft_variant_id))
          .filter((run) => {
            const variant = draftVariants.find(
              (candidate) => candidate.id === run.draft_variant_id,
            );
            return run.content_revision === variant?.content_revision;
          })
          .sort((left, right) => right.id - left.id);
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
        const runIds = new Set(values.map(Number));
        return draftAiAuditFindings.filter((finding) =>
          runIds.has(finding.audit_run_id),
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
      if (
        query.includes("c.status AS campaign_status") &&
        query.includes("d.status AS draft_status")
      ) {
        const draft = drafts.find((row) => row.id === Number(values[0] ?? 0));
        const campaign = draft
          ? campaigns.find((row) => row.id === draft.campaign_id)
          : undefined;
        const selected = draftVariants.filter(
          (row) => row.draft_id === draft?.id && row.status === "selected",
        );
        return draft && campaign
          ? [
              {
                draft_id: draft.id,
                campaign_id: draft.campaign_id,
                campaign_status: campaign.status,
                draft_status: draft.status,
                draft_variant_id: selected[0]?.id ?? null,
                selected_count: selected.length,
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

    /** Holds a native list result behind the same per-campaign test gate. */
    function withCampaignGate<T>(
      campaignId: number | null | undefined,
      result: T,
    ): Promise<T> {
      const gate =
        campaignId === null || campaignId === undefined
          ? undefined
          : campaignSelectGates.get(campaignId);
      if (gate === undefined) return Promise.resolve(result);
      gate.pending += 1;
      return gate.promise.then(() => {
        gate.pending -= 1;
        return result;
      });
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
          workflow_step_execution_id: null,
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
          content_revision: draftVariants.find(
            (row) => row.id === Number(values[0]),
          )?.content_revision,
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
          reviewed_content_revision:
            draftVariants.find((row) => row.id === variantId)
              ?.content_revision ?? null,
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
        checkpoint.phase = query.includes("phase = 'continuation_ready'")
          ? "continuation_ready"
          : checkpoint.phase;
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
        const literalRunning = query.includes("SET status = 'running'");
        const literalCancelled = query.includes("SET status = 'cancelled'");
        const literalFailed = query.includes("SET status = 'failed'");
        const cancellationWithError =
          literalCancelled && query.includes("error_message = $1");
        const parameterizedStatus = query.includes("SET status = $1");
        const id = parameterizedStatus
          ? Number(values[4] ?? values.at(-1) ?? 0)
          : literalFailed
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
            const checkpoint = agentApprovalCheckpoints.find(
              (row) => row.agent_run_id === id,
            );
            if (checkpoint?.phase === "waiting_approval") {
              checkpoint.phase = "continuation_ready";
              const tool = agentToolCalls.find(
                (row) => row.id === checkpoint.pending_tool_call_id,
              );
              if (tool?.status === "waiting_approval")
                tool.status = "completed";
              const step = workflowSteps.find(
                (row) => row.id === run.workflow_step_id,
              );
              if (step?.status === "failed") step.status = "running";
            }
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
          const revisionMatch = query.match(
            /reviewed_content_revision = \$(\d+)/u,
          );
          if (revisionMatch)
            approval.reviewed_content_revision = Number(
              values[Number(revisionMatch[1]) - 1],
            );
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

      if (query.includes("DELETE FROM draft_ai_audit_runs")) {
        const deletedIds = new Set(draftAiAuditRuns.map((run) => run.id));
        draftAiAuditRuns.splice(0);
        for (
          let index = draftAiAuditFindings.length - 1;
          index >= 0;
          index -= 1
        ) {
          if (deletedIds.has(draftAiAuditFindings[index].audit_run_id)) {
            draftAiAuditFindings.splice(index, 1);
          }
        }
        return { lastInsertId: 0, rowsAffected: deletedIds.size };
      }

      if (query.includes("UPDATE draft_ai_audit_runs") && values.length === 0) {
        const nextStatus: DraftAiAuditRunStatus = query.includes("'running'")
          ? "running"
          : "failed";
        for (const run of draftAiAuditRuns) {
          run.status = nextStatus;
          run.completed_at = nextStatus === "running" ? null : run.completed_at;
          run.error_message = nextStatus === "failed" ? "Audit failed" : "";
          run.updated_at = now;
        }
        return { lastInsertId: 0, rowsAffected: draftAiAuditRuns.length };
      }

      if (
        query.includes("UPDATE draft_ai_audit_findings") &&
        values.length === 0
      ) {
        const finding = draftAiAuditFindings.find(
          (candidate) => candidate.rule_key === "safety",
        );
        if (!finding) return { lastInsertId: 0, rowsAffected: 0 };
        if (query.includes("rule_key = 'tone'")) finding.rule_key = "tone";
        if (query.includes("severity = 'block'")) {
          finding.severity = "block";
          finding.message = "AI audit blocked approval.";
        }
        return { lastInsertId: finding.id, rowsAffected: 1 };
      }

      if (
        query.includes("UPDATE draft_variants") &&
        query.includes("hook = hook || ' revised'")
      ) {
        let rowsAffected = 0;
        for (const variant of draftVariants) {
          if (variant.status !== "selected") continue;
          variant.hook += " revised";
          variant.content_revision += 1;
          revokeEditedApproval(variant);
          variant.updated_at = now;
          rowsAffected += 1;
        }
        return { lastInsertId: 0, rowsAffected };
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
            if (contentChanged) {
              variant.content_revision += 1;
              revokeEditedApproval(variant);
            }
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
        cascadeDeletedCampaign(id);
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
    w.__LINKGO_SQL_MUTATE_LINKED_AUDIT_ACTIVITY__ = (
      agentRunId: number,
      updatedAt: string,
    ) => {
      const agent = agentRuns.find((row) => row.id === agentRunId);
      const audit = draftAiAuditRuns.find(
        (row) => row.agent_run_id === agentRunId,
      );
      const execution = workflowStepExecutions.find(
        (row) => row.id === audit?.workflow_step_execution_id,
      );
      if (!agent || !audit || !execution)
        throw new Error("Linked audit was not found");
      agent.updated_at = updatedAt;
      audit.updated_at = updatedAt;
      execution.updated_at = updatedAt;
    };
    w.__LINKGO_SQL_MUTATE_DRAFT_VARIANT__ = (
      id: number,
      patch: Partial<DraftVariant>,
    ) => {
      const variant = draftVariants.find((row) => row.id === id);
      if (!variant) throw new Error("Draft variant was not found");
      Object.assign(variant, patch, { updated_at: getNow() });
    };
    w.__LINKGO_SQL_MUTATE_WORKFLOW_STEP__ = (
      id: number,
      patch: Partial<WorkflowStep>,
    ) => {
      const step = workflowSteps.find((row) => row.id === id);
      if (!step) throw new Error("Workflow step was not found");
      Object.assign(step, patch, { updated_at: getNow() });
    };
    w.__LINKGO_SQL_CLONE_LINKED_AUDIT_AS_FRESH__ = (agentRunId: number) => {
      const agent = agentRuns.find((row) => row.id === agentRunId);
      const audit = draftAiAuditRuns.find(
        (row) => row.agent_run_id === agentRunId,
      );
      const execution = workflowStepExecutions.find(
        (row) => row.id === audit?.workflow_step_execution_id,
      );
      const step = workflowSteps.find(
        (row) => row.id === agent?.workflow_step_id,
      );
      const run = workflowRuns.find((row) => row.id === agent?.workflow_run_id);
      if (!agent || !audit || !execution || !step || !run) {
        throw new Error("Linked audit was not found");
      }
      const now = getNow();
      const clonedRunId = nextWorkflowRunId++;
      const clonedStepId = nextWorkflowStepId++;
      const clonedAgentId = nextAgentRunId++;
      const clonedExecutionId = nextWorkflowStepExecutionId++;
      const clonedAuditId = nextDraftAiAuditRunId++;
      workflowRuns.push({
        ...run,
        id: clonedRunId,
        created_at: now,
        updated_at: now,
      });
      workflowSteps.push({
        ...step,
        id: clonedStepId,
        workflow_run_id: clonedRunId,
        created_at: now,
        updated_at: now,
      });
      agentRuns.push({
        ...agent,
        id: clonedAgentId,
        workflow_run_id: clonedRunId,
        workflow_step_id: clonedStepId,
        created_at: now,
        updated_at: now,
      });
      workflowStepExecutions.push({
        ...execution,
        id: clonedExecutionId,
        workflow_step_id: clonedStepId,
        agent_run_id: clonedAgentId,
        created_at: now,
        updated_at: now,
      });
      draftAiAuditRuns.push({
        ...audit,
        id: clonedAuditId,
        draft_variant_id: 999_000 + clonedAuditId,
        agent_run_id: clonedAgentId,
        workflow_step_execution_id: clonedExecutionId,
        created_at: now,
        updated_at: now,
      });
      return {
        workflowRunId: clonedRunId,
        auditRunId: clonedAuditId,
        agentRunId: clonedAgentId,
        executionId: clonedExecutionId,
      };
    };
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
      const targetPostId = nextTargetPostId++;
      const candidatePostId = nextCandidatePostId++;
      targetPosts.push({
        id: targetPostId,
        platform: "linkedin",
        url: `https://www.linkedin.com/posts/ai-audit-${targetPostId}`,
        normalized_url: `https://www.linkedin.com/posts/ai-audit-${targetPostId}`,
        platform_resource_urn: "",
        author_name: "AI audit author",
        author_profile_url: "",
        posted_at: now,
        content: "AI audit source content",
        content_hash: `ai-audit-${targetPostId}`,
        created_at: now,
        updated_at: now,
      });
      candidatePosts.push({
        id: candidatePostId,
        campaign_id: campaign.id,
        target_post_id: targetPostId,
        source_keyword: "ai audit",
        status: "new",
        relevance_score: 90,
        score_reason: "AI audit fixture",
        notes: "",
        created_at: now,
        updated_at: now,
      });
      const draft: Draft = {
        id: nextDraftId,
        campaign_id: campaign.id,
        candidate_post_id: candidatePostId,
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
    w.__LINKGO_SQL_SEED_QUALITY_RECOVERY__ = async (
      status: DraftQualityRun["status"],
      lastAttempt: number,
      stale: boolean,
    ) => {
      const seeded = (
        w.__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_VARIANT__ as () => DraftVariant
      )();
      const variant = draftVariants.find((row) => row.id === seeded.id)!;
      const now = getNow();
      const auditId = nextDraftAiAuditRunId++;
      draftAiAuditRuns.push({
        id: auditId,
        draft_variant_id: variant.id,
        content_revision: 1,
        agent_run_id: null,
        provider_key: "dry_run",
        model_name: "dry-run-local",
        status: "completed",
        summary: "Checked",
        error_message: "",
        started_at: now,
        completed_at: now,
        created_at: now,
        updated_at: now,
        workflow_step_execution_id: null,
      });
      for (const rule_key of [
        "hook",
        "specificity",
        "generic_language",
        "authenticity",
        "clarity",
        "safety",
      ]) {
        draftAiAuditFindings.push({
          id: nextDraftAiAuditFindingId++,
          audit_run_id: auditId,
          rule_key,
          severity: "pass",
          message: "Checked",
          created_at: now,
        });
      }
      const claim = (await claimDraftQualityCommand({
        input: {
          draftVariantId: variant.id,
          providerKey: "dry_run",
          modelName: "dry-run-local",
        },
      })) as { qualityRunId: number; attemptId: number };
      const run = draftQualityRuns.find(
        (row) => row.id === claim.qualityRunId,
      )!;
      run.status = status;
      const attempt = draftQualityAttempts.find(
        (row) => row.id === claim.attemptId,
      )!;
      attempt.status = "failed";
      attempt.attempt_number = lastAttempt;
      if (stale) variant.content_revision += 1;
      return { qualityRunId: run.id, draftVariantId: variant.id };
    };
    w.__LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__ = () =>
      createTransactionSnapshot();
    // Seeds approval_ready_variants evidence for a variant at its current
    // revision without creating agent runs: deterministic audits, a completed
    // canonical non-blocking AI audit, and a passed quality run.
    w.__LINKGO_SQL_SEED_APPROVAL_READINESS__ = (draftVariantId: number) => {
      const variant = draftVariants.find((row) => row.id === draftVariantId);
      if (variant === undefined) throw new Error("Draft variant was not found");
      const now = getNow();
      regenerateQualityRewriteAudits(variant);
      const auditId = nextDraftAiAuditRunId++;
      draftAiAuditRuns.push({
        id: auditId,
        draft_variant_id: variant.id,
        content_revision: variant.content_revision,
        agent_run_id: null,
        provider_key: "dry_run",
        model_name: "dry-run-local",
        status: "completed",
        summary: "Checked",
        error_message: "",
        started_at: now,
        completed_at: now,
        created_at: now,
        updated_at: now,
        workflow_step_execution_id: null,
      });
      for (const rule_key of approvalAiAuditRuleKeys) {
        draftAiAuditFindings.push({
          id: nextDraftAiAuditFindingId++,
          audit_run_id: auditId,
          rule_key,
          severity: "pass",
          message: "Checked",
          created_at: now,
        });
      }
      draftQualityRuns.push({
        id: nextDraftQualityRunId++,
        draft_variant_id: variant.id,
        current_content_revision: variant.content_revision,
        provider_key: "dry_run",
        model_name: "dry-run-local",
        status: "passed",
        final_score: 80,
        summary: "Passed",
        applied_rewrite_count: 0,
        active_agent_run_id: null,
        active_ai_audit_run_id: null,
        error_message: "",
        updated_at: now,
      });
      if (!isApprovalReady(variant))
        throw new Error("Seeded variant is not approval ready");
      persistReloadSnapshot();
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
          workflow_step_execution_id: null,
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
    w.__LINKGO_SQL_SEED_DRAFT_CAMPAIGN_LOAD__ = (
      campaignId: number,
      label: string,
    ) => {
      if (!campaigns.some((campaign) => campaign.id === campaignId)) {
        throw new Error("Campaign was not found");
      }

      const now = getNow();
      const targetPostId = nextTargetPostId++;
      const candidatePostId = nextCandidatePostId++;
      const draftId = nextDraftId++;
      const requestId = nextDraftGenerationRequestId++;
      const workflowRunId = nextWorkflowRunId++;
      const workflowStepId = nextWorkflowStepId++;

      targetPosts.push({
        id: targetPostId,
        platform: "linkedin",
        url: `https://www.linkedin.com/posts/${label.toLowerCase()}-${targetPostId}`,
        normalized_url: `https://www.linkedin.com/posts/${label.toLowerCase()}-${targetPostId}`,
        platform_resource_urn: "",
        author_name: `${label} draft author`,
        author_profile_url: "",
        posted_at: now,
        content: `${label} candidate content`,
        content_hash: `${label.toLowerCase()}-draft-load-${targetPostId}`,
        created_at: now,
        updated_at: now,
      });
      candidatePosts.push({
        id: candidatePostId,
        campaign_id: campaignId,
        target_post_id: targetPostId,
        source_keyword: "draft load race",
        status: "new",
        relevance_score: 91,
        score_reason: "Deferred campaign load fixture",
        notes: "",
        created_at: now,
        updated_at: now,
      });
      drafts.push({
        id: draftId,
        campaign_id: campaignId,
        candidate_post_id: candidatePostId,
        angle: `${label} draft angle`,
        notes: "",
        content_intent: "idea",
        status: "drafting",
        created_at: now,
        updated_at: now,
      });
      const draftVariantId = nextDraftVariantId++;
      draftVariants.push({
        id: draftVariantId,
        draft_id: draftId,
        variant_number: 1,
        hook: `${label} fixture hook`,
        body: `${label} fixture body`,
        cta: `${label} fixture CTA`,
        hashtags: "#Linkgo",
        content_revision: 1,
        status: "draft",
        created_at: now,
        updated_at: now,
      });
      draftAudits.push({
        id: nextDraftAuditId++,
        draft_variant_id: draftVariantId,
        rule_key: "fixture_pass",
        severity: "pass",
        message: "Deferred campaign load fixture passed.",
        created_at: now,
      });
      draftGenerationRequests.push({
        id: requestId,
        campaign_id: campaignId,
        candidate_post_id: candidatePostId,
        agent_run_id: null,
        provider_key: "dry_run",
        model_name: "local-deterministic",
        playbook_key: "linkedin_writer",
        variant_count: 1,
        content_intent: "idea",
        workflow_run_id: null,
        workflow_step_id: null,
        angle: "",
        voice_notes: "",
        status: "failed",
        summary: `${label} generation request`,
        generated_variants_json: "[]",
        error_message: `${label} deferred request fixture`,
        created_draft_id: null,
        created_at: now,
        updated_at: now,
      });
      workflowRuns.push({
        id: workflowRunId,
        campaign_id: campaignId,
        workflow_type: "content_pipeline",
        title: `${label} workflow`,
        status: "running",
        current_step_key: "draft",
        context_summary: "Deferred campaign load fixture",
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
        output_summary: "",
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
        artifact_id: candidatePostId,
        summary: `${label} candidate artifact`,
        created_at: now,
        updated_at: now,
      });
    };
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
    // Bulk-seeds scored `new` candidates so tests can exceed the 500-row
    // native list cap without driving the UI once per row.
    w.__LINKGO_SQL_SEED_CANDIDATES__ = (campaignId: number, count: number) => {
      const now = getNow();
      for (let index = 0; index < count; index += 1) {
        const targetId = nextTargetPostId++;
        targetPosts.push({
          id: targetId,
          platform: "linkedin",
          url: `https://www.linkedin.com/posts/seed-${targetId}`,
          normalized_url: `https://www.linkedin.com/posts/seed-${targetId}`,
          platform_resource_urn: "",
          author_name: `Seed author ${targetId}`,
          author_profile_url: "",
          posted_at: null,
          content: `Seeded candidate ${targetId}`,
          content_hash: `seed-${targetId}`,
          created_at: now,
          updated_at: now,
        });
        candidatePosts.push({
          id: nextCandidatePostId++,
          campaign_id: campaignId,
          target_post_id: targetId,
          source_keyword: "",
          status: "new",
          relevance_score: 50,
          score_reason: "",
          notes: "",
          created_at: now,
          updated_at: now,
        });
      }
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

    w.__LINKGO_AGENT_CONTINUATION_SETTLEMENT_COUNT__ = () =>
      agentContinuationSettlementInvocations;

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

    const authProviders: Record<string, unknown>[] = [
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

    // Mirrors native safe_status for a Base URL saved by an older build that
    // the destination policy now rejects.
    w.__LINKGO_AUTH_REQUIRE_REAUTH__ = (
      providerKey: string,
      lastError: string,
    ): void => {
      const account = connectedAccounts.find(
        (candidate) => candidate.provider_key === providerKey,
      );
      if (account === undefined)
        throw new Error("Connected account unavailable");
      account.status = "reauth_required";
      account.last_error = lastError;
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

    function plannerDraftAuditScope(workflowRunId: number) {
      const run = workflowRuns.find((row) => row.id === workflowRunId);
      const step = workflowSteps.find(
        (row) =>
          row.workflow_run_id === workflowRunId && row.step_key === "audit",
      );
      const draftStep = workflowSteps.find(
        (row) =>
          row.workflow_run_id === workflowRunId && row.step_key === "draft",
      );
      const artifact = workflowArtifacts.find(
        (row) =>
          row.workflow_run_id === workflowRunId &&
          row.artifact_type === "draft",
      );
      const draft = drafts.find((row) => row.id === artifact?.artifact_id);
      const requests = draftGenerationRequests.filter(
        (row) => row.created_draft_id === draft?.id && row.status === "saved",
      );
      const request = requests[0];
      const plan = autopilotPlans.find(
        (row) =>
          row.workflow_run_id === workflowRunId && row.status === "planned",
      );
      if (
        !run ||
        !step ||
        !draftStep ||
        !artifact ||
        !draft ||
        requests.length !== 1 ||
        !request ||
        !plan
      ) {
        throw new Error(
          "Planner audit requires one saved draft artifact with request provenance",
        );
      }
      if (
        artifact.workflow_step_id !== draftStep.id ||
        request.workflow_run_id !== run.id ||
        request.workflow_step_id !== draftStep.id ||
        request.campaign_id !== run.campaign_id ||
        draft.campaign_id !== run.campaign_id ||
        request.candidate_post_id !== draft.candidate_post_id ||
        request.created_draft_id !== draft.id ||
        run.current_step_key !== "audit" ||
        !["running", "blocked", "failed"].includes(run.status) ||
        !["pending", "running", "blocked", "failed"].includes(step.status)
      ) {
        throw new Error(
          "Saved draft request provenance does not match the planner audit scope",
        );
      }
      return { run, step, draftStep, artifact, draft, request };
    }

    function nativeAuditMutation<T>(mutation: () => T): Promise<T> {
      const snapshot = createTransactionSnapshot();
      try {
        const result = mutation();
        persistReloadSnapshot();
        return Promise.resolve(result);
      } catch (error) {
        restoreTransactionSnapshot(snapshot);
        return Promise.reject(error);
      }
    }

    function claimNativePlannerDraftAudit(args?: unknown): Promise<unknown> {
      return nativeAuditMutation(() => {
        const input = nativeScoringInput<{
          workflowRunId: number;
          workflowStepId: number;
          campaignId: number;
          draftId: number;
          draftGenerationRequestId: number;
          providerKey: AgentProviderKey;
          modelName: string;
        }>(args);
        const scope = plannerDraftAuditScope(input.workflowRunId);
        if (
          workflowStepExecutions.some(
            (row) =>
              row.workflow_step_id === scope.step.id &&
              ["claimed", "running", "waiting_approval"].includes(row.status),
          )
        )
          throw new Error("A planner draft audit execution is already active");
        const provider = scope.request.provider_key;
        const defaults: Partial<Record<AgentProviderKey, string>> = {
          dry_run: "dry-run-local",
          anthropic: "claude-sonnet-4-6",
          openai: "gpt-4.1-mini",
          gemini: "gemini-2.5-flash",
          custom: "custom-model",
        };
        const model = scope.request.model_name.trim() || defaults[provider];
        if (!model || model.length > 120)
          throw new Error("Saved planner audit provider is invalid");
        if (
          input.workflowStepId !== scope.step.id ||
          input.campaignId !== scope.run.campaign_id ||
          input.draftId !== scope.draft.id ||
          input.draftGenerationRequestId !== scope.request.id ||
          input.providerKey !== provider ||
          input.modelName !== model
        )
          throw new Error(
            "Caller planner audit provenance does not match saved provenance",
          );
        const variant = draftVariants
          .filter((row) => row.draft_id === scope.draft.id)
          .sort((a, b) => a.variant_number - b.variant_number)
          .find(
            (row) =>
              !draftAiAuditRuns.some(
                (audit) =>
                  audit.draft_variant_id === row.id &&
                  audit.content_revision === row.content_revision &&
                  audit.status === "completed",
              ),
          );
        if (!variant)
          throw new Error("All current draft revisions are already audited");
        if (
          draftAiAuditRuns.some(
            (audit) =>
              audit.draft_variant_id === variant.id &&
              audit.content_revision === variant.content_revision &&
              ["pending", "running"].includes(audit.status),
          )
        )
          throw new Error(
            "An active AI audit already exists for this draft revision",
          );
        const text = [variant.hook, variant.body, variant.cta, variant.hashtags]
          .filter(Boolean)
          .join("\n\n");
        if (!text.trim() || text.length > 4000)
          throw new Error(
            "Draft AI audit text does not satisfy the audit contract",
          );
        const now = getNow();
        const attempt =
          Math.max(
            0,
            ...workflowStepExecutions
              .filter((row) => row.workflow_step_id === scope.step.id)
              .map((row) => row.attempt_count),
          ) + 1;
        const execution: WorkflowStepExecution = {
          id: nextWorkflowStepExecutionId++,
          workflow_step_id: scope.step.id,
          agent_run_id: nextAgentRunId,
          executor_role: "auditor",
          attempt_count: attempt,
          status: "running",
          error_summary: "",
          started_at: now,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        workflowStepExecutions.push(execution);
        const audit: DraftAiAuditRun = {
          id: nextDraftAiAuditRunId++,
          draft_variant_id: variant.id,
          content_revision: variant.content_revision,
          agent_run_id: nextAgentRunId,
          provider_key: provider,
          model_name: model,
          status: "running",
          summary: "",
          error_message: "",
          started_at: now,
          completed_at: null,
          created_at: now,
          updated_at: now,
          workflow_step_execution_id: execution.id,
        };
        draftAiAuditRuns.push(audit);
        const agent: AgentRun = {
          id: nextAgentRunId++,
          campaign_id: scope.run.campaign_id,
          workflow_run_id: scope.run.id,
          workflow_step_id: scope.step.id,
          agent_role: "auditor",
          provider_key: provider,
          model_name: model,
          playbook_key: "linkedin_humanizer",
          status: "queued",
          input_summary: `Audit draft variant #${variant.id} revision ${variant.content_revision}.`,
          input_context_json: JSON.stringify({
            auditRequest: {
              campaignId: scope.run.campaign_id,
              draftVariantId: variant.id,
              contentRevision: variant.content_revision,
              auditRunId: audit.id,
              text,
            },
            planner: {
              workflowRunId: scope.run.id,
              workflowStepId: scope.step.id,
              draftId: scope.draft.id,
              draftGenerationRequestId: scope.request.id,
            },
          }),
          output_summary: "",
          error_message: "",
          iteration_count: 0,
          started_at: null,
          completed_at: null,
          created_at: now,
          updated_at: now,
        };
        agentRuns.push(agent);
        agentRunEvents.push({
          id: nextAgentRunEventId++,
          agent_run_id: agent.id,
          event_type: "run_created",
          summary: "Agent run created for planner draft audit.",
          created_at: now,
        });
        workflowArtifacts.push({
          id: nextWorkflowArtifactId++,
          workflow_run_id: scope.run.id,
          workflow_step_id: scope.step.id,
          artifact_type: "agent_run",
          artifact_id: agent.id,
          summary: `Auditor run for draft variant #${variant.id} revision ${variant.content_revision}`,
          created_at: now,
          updated_at: now,
        });
        const prior = scope.step.status;
        scope.step.status = "running";
        scope.step.error_message = "";
        scope.step.completed_at = null;
        scope.step.started_at ??= now;
        scope.step.updated_at = now;
        scope.run.status = "running";
        scope.run.current_step_key = "audit";
        scope.run.completed_at = null;
        scope.run.updated_at = now;
        addNativeWorkflowEvent(
          scope.run.id,
          scope.step.id,
          prior === "pending" ? "step_started" : "step_resumed",
          "Draft AI audit started",
        );
        return {
          executionId: execution.id,
          auditRunId: audit.id,
          agentRunId: agent.id,
          workflowRunId: scope.run.id,
          workflowStepId: scope.step.id,
          draftId: scope.draft.id,
          draftVariantId: variant.id,
          contentRevision: variant.content_revision,
        };
      });
    }

    function nativeAuditLink(agentRunId: number) {
      const agent = agentRuns.find(
        (row) => row.id === agentRunId && row.agent_role === "auditor",
      );
      const audit = draftAiAuditRuns.find(
        (row) => row.agent_run_id === agentRunId,
      );
      const execution = workflowStepExecutions.find(
        (row) =>
          row.id === audit?.workflow_step_execution_id &&
          row.agent_run_id === agentRunId,
      );
      const step = workflowSteps.find(
        (row) => row.id === agent?.workflow_step_id && row.step_key === "audit",
      );
      const run = workflowRuns.find((row) => row.id === agent?.workflow_run_id);
      if (!agent || !audit || !execution || !step || !run)
        throw new Error("Planner draft auditor run was not found");
      return { agent, audit, execution, step, run };
    }

    function failNativePlannerDraftAuditLink(
      agentRunId: number,
      reason: string,
    ): void {
      const link = nativeAuditLink(agentRunId);
      const now = getNow();
      if (!["pending", "running"].includes(link.audit.status))
        throw new Error("Planner draft audit is no longer active");
      link.audit.status = "failed";
      link.audit.error_message = reason;
      link.audit.completed_at = now;
      link.audit.updated_at = now;
      link.agent.status = "failed";
      link.agent.error_message = reason;
      link.agent.completed_at = now;
      link.agent.updated_at = now;
      link.execution.status = "failed";
      link.execution.error_summary = reason;
      link.execution.completed_at = now;
      link.execution.updated_at = now;
      link.step.status = "failed";
      link.step.error_message = reason;
      link.step.completed_at = now;
      link.step.updated_at = now;
      link.run.status = "failed";
      link.run.current_step_key = "audit";
      link.run.completed_at = now;
      link.run.updated_at = now;
      removeRows(
        agentApprovalCheckpoints,
        (row) => row.agent_run_id === agentRunId,
      );
      agentRunEvents.push({
        id: nextAgentRunEventId++,
        agent_run_id: agentRunId,
        event_type: "run_failed",
        summary: reason,
        created_at: now,
      });
      addNativeWorkflowEvent(link.run.id, link.step.id, "step_failed", reason);
    }

    function completeNativePlannerDraftAudit(args?: unknown): Promise<unknown> {
      return nativeAuditMutation(() => {
        const { agentRunId } = nativeScoringInput<{ agentRunId: number }>(args);
        const link = nativeAuditLink(agentRunId);
        // Like native: read the auditor's own persisted audit_post output.
        const snapshot = mockAu_loadDraftAiAuditSnapshot(
          link.audit.draft_variant_id,
        );
        const input = mockAu_consumeCompletedDraftAiAuditOutput(
          {
            campaignId: snapshot.campaign_id,
            draftVariantId: link.audit.draft_variant_id,
            contentRevision: link.audit.content_revision,
            auditRunId: link.audit.id,
            text: mockAu_parseCanonicalDraftAuditText(snapshot),
          },
          agentRunId,
        );
        const variant = draftVariants.find(
          (row) => row.id === link.audit.draft_variant_id,
        );
        if (variant?.content_revision !== link.audit.content_revision)
          throw new Error(
            "Draft content changed before the planner audit completed",
          );
        if (
          link.audit.status !== "running" ||
          link.agent.status !== "completed" ||
          link.execution.status !== "running"
        )
          throw new Error("Planner draft audit is no longer active");
        const now = getNow();
        for (const finding of input.findings)
          draftAiAuditFindings.push({
            id: nextDraftAiAuditFindingId++,
            audit_run_id: link.audit.id,
            rule_key: finding.ruleKey,
            severity: finding.severity,
            message: finding.message.trim().replace(/\s+/gu, " "),
            created_at: now,
          });
        link.audit.status = "completed";
        link.audit.summary = input.summary.trim();
        link.audit.error_message = "";
        link.audit.completed_at = now;
        link.audit.updated_at = now;
        link.agent.output_summary = link.audit.summary;
        link.agent.updated_at = now;
        link.execution.status = "completed";
        link.execution.error_summary = "";
        link.execution.completed_at = now;
        link.execution.updated_at = now;
        const draftIds = new Set(
          workflowArtifacts
            .filter(
              (row) =>
                row.workflow_run_id === link.run.id &&
                row.artifact_type === "draft",
            )
            .map((row) => row.artifact_id),
        );
        const remaining = draftVariants.filter(
          (row) =>
            draftIds.has(row.draft_id) &&
            !draftAiAuditRuns.some(
              (audit) =>
                audit.draft_variant_id === row.id &&
                audit.content_revision === row.content_revision &&
                audit.status === "completed",
            ),
        ).length;
        if (remaining) {
          link.step.status = "pending";
          link.step.output_summary = `${remaining} current draft revision(s) remain to audit.`;
          link.step.completed_at = null;
          link.step.updated_at = now;
          return { terminal: false };
        }
        const approve = workflowSteps.find(
          (row) =>
            row.workflow_run_id === link.run.id && row.step_key === "approve",
        );
        if (
          !approve ||
          !["pending", "blocked", "failed"].includes(approve.status) ||
          link.run.current_step_key !== "audit" ||
          link.run.status !== "running"
        )
          throw new Error("Planner workflow could not advance to approval");
        link.step.status = "completed";
        link.step.output_summary =
          "All current draft revisions passed through AI audit.";
        link.step.completed_at = now;
        link.step.updated_at = now;
        approve.status = "waiting_approval";
        approve.started_at ??= now;
        approve.completed_at = null;
        approve.error_message = "";
        approve.updated_at = now;
        link.run.status = "waiting_approval";
        link.run.current_step_key = "approve";
        link.run.updated_at = now;
        addNativeWorkflowEvent(
          link.run.id,
          link.step.id,
          "step_completed",
          "Draft AI audits completed",
        );
        addNativeWorkflowEvent(
          link.run.id,
          approve.id,
          "step_waiting_approval",
          "Drafts are waiting for approval",
        );
        return { terminal: true };
      });
    }

    function failNativePlannerDraftAudit(args?: unknown): Promise<unknown> {
      return nativeAuditMutation(() => {
        const input = nativeScoringInput<{
          agentRunId: number;
          errorSummary: string;
        }>(args);
        failNativePlannerDraftAuditLink(
          input.agentRunId,
          input.errorSummary.trim().slice(0, 1000),
        );
        return null;
      });
    }

    function reconcileNativePlannerDraftAudits(
      args?: unknown,
    ): Promise<unknown> {
      return nativeAuditMutation(() => {
        const limit = nativeScoringInput<{ limit?: number }>(args).limit ?? 25;
        if (limit < 1 || limit > 100)
          throw new Error("Reconcile limit is invalid");
        const cutoff = Date.now() - 15 * 60 * 1000;
        const links = draftAiAuditRuns
          .flatMap((audit) => {
            const agent = agentRuns.find(
              (row) => row.id === audit.agent_run_id,
            );
            const execution = workflowStepExecutions.find(
              (row) =>
                row.id === audit.workflow_step_execution_id &&
                row.agent_run_id === agent?.id,
            );
            return agent &&
              execution &&
              agent.agent_role === "auditor" &&
              agent.workflow_run_id !== null &&
              ["queued", "running", "waiting_approval", "completed"].includes(
                agent.status,
              ) &&
              ["pending", "running"].includes(audit.status) &&
              ["claimed", "running", "waiting_approval"].includes(
                execution.status,
              ) &&
              Math.max(
                Date.parse(agent.updated_at),
                Date.parse(audit.updated_at),
                Date.parse(execution.updated_at),
              ) <= cutoff
              ? [{ audit, agent, execution }]
              : [];
          })
          .sort(
            (a, b) =>
              Date.parse(a.audit.updated_at) - Date.parse(b.audit.updated_at) ||
              a.audit.id - b.audit.id,
          )
          .slice(0, limit);
        for (const link of links)
          failNativePlannerDraftAuditLink(
            link.agent.id,
            "Planner draft audit exceeded the 15-minute settlement window.",
          );
        return {
          failedAuditRunIds: links.map((x) => x.audit.id),
          failedAgentRunIds: links.map((x) => x.agent.id),
          failedExecutionIds: links.map((x) => x.execution.id),
          failedWorkflowRunIds: links.map(
            (x) => x.agent.workflow_run_id as number,
          ),
        };
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

    const OPEN_EXECUTION_MESSAGE =
      "Another publish for this item is in progress or awaiting reconciliation";
    type MockOpenPublishExecution = {
      id: number;
      kind: "post" | "comment";
      subjectId: number;
      campaignId: number;
      campaignName: string;
      scheduleJobId: number | null;
      caller: "manual" | "scheduler";
      status: "reserved" | "in_flight" | "outcome_unknown";
      fence: number;
      remoteOutcome: "" | "created" | "rejected" | "ambiguous";
      remoteStatusCode: number | null;
      errorMessage: string;
      reservedAt: string;
      sentAt: string | null;
      updatedAt: string;
    };
    // Read lazily: specs seed `__LINKGO_PUBLISH_EXECUTIONS__` in init scripts
    // that run after this mock is installed.
    const publishExecutionStore = (): MockOpenPublishExecution[] => {
      if (!Array.isArray(w.__LINKGO_PUBLISH_EXECUTIONS__)) {
        w.__LINKGO_PUBLISH_EXECUTIONS__ = [];
      }
      return w.__LINKGO_PUBLISH_EXECUTIONS__ as MockOpenPublishExecution[];
    };
    let nextPublishExecutionId = 1000;
    const hasOpenPublishExecution = (
      kind: "post" | "comment",
      subjectId: unknown,
    ): boolean =>
      publishExecutionStore().some(
        (execution) =>
          execution.kind === kind && execution.subjectId === subjectId,
      );

    const recordCommentAttemptCommand = (args: unknown) => {
      const invokes = Number(w.__LINKGO_COMMENT_RECORD_ATTEMPT_INVOKES__ ?? 0);
      w.__LINKGO_COMMENT_RECORD_ATTEMPT_INVOKES__ = invokes + 1;
      const threadId = (args as { input?: { commentThreadId?: number } })?.input
        ?.commentThreadId;
      if (hasOpenPublishExecution("comment", threadId)) {
        throw new Error(OPEN_EXECUTION_MESSAGE);
      }
      return settleCommentAttempt(args);
    };

    /** Native comment attempt settlement shared by record and publish. */
    const settleCommentAttempt = (args: unknown) => {
      const input = (
        args as {
          input?: {
            commentThreadId?: number;
            status?: CommentAttemptStatus;
            externalCommentUrl?: string;
            platformCommentId?: string;
            idempotencyKey?: string;
            errorMessage?: string;
          };
        }
      )?.input;
      if (
        input?.idempotencyKey &&
        commentAttempts.some(
          (attempt) => attempt.idempotency_key === input.idempotencyKey,
        )
      ) {
        throw new Error("Comment attempt was already recorded");
      }
      const thread = commentThreads.find(
        (row) => row.id === input?.commentThreadId,
      );
      if (!thread) throw new Error("Comment thread was not found");
      const campaign = campaigns.find((row) => row.id === thread.campaign_id);
      if (campaign?.status === "archived")
        throw new Error("Campaign is archived");
      if (thread.status !== "approved") {
        throw new Error("Only approved comments can record posting attempts");
      }
      if (input?.status === "succeeded") {
        const selected = commentVariants.filter(
          (variant) =>
            variant.comment_thread_id === thread.id &&
            variant.status === "selected",
        );
        if (selected.length === 0)
          throw new Error("Choose one comment variant before review");
        if (selected.length > 1)
          throw new Error("Choose exactly one selected comment variant");
        if (
          commentAudits.some(
            (audit) =>
              audit.comment_variant_id === selected[0]?.id &&
              audit.severity === "block",
          )
        ) {
          throw new Error("Blocked comment variants cannot be reviewed");
        }
        if (safetySettings.global_kill_switch === 1) {
          throw new Error(
            safetySettings.kill_switch_reason
              ? `Global kill switch is enabled: ${safetySettings.kill_switch_reason}`
              : "Global kill switch is enabled",
          );
        }
        const today = getNow().slice(0, 10);
        const currentCount = commentAttempts.filter((attempt) => {
          const attemptThread = commentThreads.find(
            (row) => row.id === attempt.comment_thread_id,
          );
          return (
            attemptThread?.campaign_id === thread.campaign_id &&
            attempt.status === "succeeded" &&
            attempt.created_at.slice(0, 10) === today
          );
        }).length;
        const limit = campaign?.daily_comment_limit ?? 0;
        if (currentCount >= limit) {
          const summary = `Daily comment limit reached for ${today}: ${currentCount}/${limit} used`;
          rateLimitEvents.push({
            id: nextRateLimitEventId++,
            campaign_id: thread.campaign_id,
            action: "comment",
            window_key: today,
            limit_value: limit,
            current_count: currentCount,
            decision: "blocked",
            summary,
            created_at: getNow(),
          });
          throw new Error(summary);
        }
        rateLimitEvents.push({
          id: nextRateLimitEventId++,
          campaign_id: thread.campaign_id,
          action: "comment",
          window_key: today,
          limit_value: limit,
          current_count: currentCount,
          decision: "allowed",
          summary: `Comment allowed for ${today}: ${currentCount}/${limit} used`,
          created_at: getNow(),
        });
      }
      const now = getNow();
      const attempt: CommentAttempt = {
        id: nextCommentAttemptId++,
        comment_thread_id: thread.id,
        platform: "linkedin",
        status: input?.status ?? "failed",
        external_comment_url: input?.externalCommentUrl ?? "",
        platform_comment_id: input?.platformCommentId ?? "",
        idempotency_key: input?.idempotencyKey ?? "",
        error_message: input?.errorMessage ?? "",
        created_at: now,
      };
      commentAttempts.push(attempt);
      thread.updated_at = now;
      if (attempt.status === "succeeded") {
        thread.status = "posted";
        thread.posted_at = now;
      } else {
        let errorItem = errorQueueItems.find(
          (item) =>
            item.source_type === "manual" &&
            item.source_id === thread.id &&
            ["open", "in_progress", "awaiting_review"].includes(item.status),
        );
        const eventType = errorItem
          ? "error_item_updated"
          : "error_item_created";
        if (errorItem) {
          errorItem.detail = attempt.error_message;
          errorItem.updated_at = now;
        } else {
          errorItem = {
            id: nextErrorQueueItemId++,
            campaign_id: thread.campaign_id,
            source_type: "manual",
            source_id: thread.id,
            title: "Comment attempt failed",
            detail: attempt.error_message,
            severity: "error",
            status: "open",
            resolution_notes: "",
            created_at: now,
            updated_at: now,
          };
          errorQueueItems.push(errorItem);
        }
        safetyAuditEvents.push({
          id: nextSafetyAuditEventId++,
          campaign_id: thread.campaign_id,
          subject_type: "error_queue_item",
          subject_id: errorItem.id,
          event_type: eventType,
          severity: "warning",
          summary: `Error item ${eventType === "error_item_created" ? "created" : "updated"}: Comment attempt failed`,
          metadata_json: JSON.stringify({
            sourceType: "manual",
            sourceId: thread.id,
          }),
          created_at: now,
        });
      }
      return Promise.resolve(attempt.id);
    };

    const recordPublishAttemptCommand = (args: unknown) => {
      const invokes = Number(w.__LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__ ?? 0);
      w.__LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__ = invokes + 1;
      const approvalId = (args as { input?: { approvalId?: number } })?.input
        ?.approvalId;
      if (hasOpenPublishExecution("post", approvalId)) {
        throw new Error(OPEN_EXECUTION_MESSAGE);
      }
      return settlePublishAttempt(args);
    };

    /** Native post attempt settlement shared by record and publish. */
    const settlePublishAttempt = (args: unknown) => {
      const input = (
        args as {
          input?: {
            approvalId?: number;
            scheduleJobId?: number;
            status?: PublishAttemptStatus;
            externalPostUrl?: string;
            platformPostId?: string;
            errorMessage?: string;
          };
        }
      )?.input;
      // Mirrors validate_record_publish_attempt in approvals.rs.
      const allowedKeys = [
        "approvalId",
        "scheduleJobId",
        "status",
        "externalPostUrl",
        "platformPostId",
        "errorMessage",
      ];
      const unknownKey = Object.keys(input ?? {}).find(
        (key) => !allowedKeys.includes(key),
      );
      if (unknownKey !== undefined)
        throw new Error(`unknown field \`${unknownKey}\``);
      const isPositiveId = (value: unknown) =>
        typeof value === "number" && Number.isInteger(value) && value > 0;
      if (!isPositiveId(input?.approvalId))
        throw new Error("Approval id must be a positive integer");
      if (
        input?.scheduleJobId !== undefined &&
        !isPositiveId(input.scheduleJobId)
      )
        throw new Error("Schedule job id must be a positive integer");
      if (input?.status !== "succeeded" && input?.status !== "failed")
        throw new Error("Publish attempt status must be succeeded or failed");
      const boundedText = (
        value: string | undefined,
        max: number,
        label: string,
      ) => {
        const trimmed = (value ?? "").trim();
        if (Array.from(trimmed).length > max)
          throw new Error(`${label} must be ${max} characters or fewer`);
        return trimmed;
      };
      const externalPostUrl = boundedText(
        input.externalPostUrl,
        1000,
        "LinkedIn post URL",
      );
      if (
        externalPostUrl !== "" &&
        !externalPostUrl.startsWith("https://www.linkedin.com/") &&
        !externalPostUrl.startsWith("https://linkedin.com/")
      )
        throw new Error(
          "LinkedIn post URL must start with https://www.linkedin.com/",
        );
      const platformPostId = boundedText(
        input.platformPostId,
        200,
        "Platform post ID",
      );
      const errorMessage = boundedText(
        input.errorMessage,
        1000,
        "Failure reason",
      );
      if (input.status === "failed" && errorMessage === "")
        throw new Error("Failure reason is required for failed attempts");
      if (
        input.status === "succeeded" &&
        externalPostUrl === "" &&
        platformPostId === ""
      )
        throw new Error(
          "LinkedIn URL or platform post ID is required for success",
        );
      const approval = approvals.find((row) => row.id === input.approvalId);
      if (approval === undefined) throw new Error("Approval was not found");
      const campaign = campaigns.find((row) => row.id === approval.campaign_id);
      if (campaign?.status === "archived")
        throw new Error("Campaign is archived");
      if (!["approved", "scheduled", "published"].includes(approval.status)) {
        throw new Error(
          "Only approved, scheduled, or published posts can record publish attempts",
        );
      }
      if (approval.status === "published" && input?.status !== "failed") {
        throw new Error(
          "Published approvals can only record failed follow-up attempts",
        );
      }
      const scheduleJob =
        input?.scheduleJobId === undefined
          ? undefined
          : scheduleJobs.find(
              (row) =>
                row.id === input.scheduleJobId &&
                row.approval_id === input.approvalId,
            );
      if (input?.scheduleJobId !== undefined && scheduleJob === undefined) {
        throw new Error("Schedule job was not found");
      }
      // Mirrors approvals.rs: successes need current readiness; failures are
      // always recorded and revoke an approval that is no longer ready.
      const ready =
        approval.status === "published" ||
        isApprovalReadyAtRevision(approval, approval.reviewed_content_revision);
      if (input?.status === "succeeded" && !ready) {
        throw new Error(STALE_APPROVAL_ERROR);
      }

      const now = new Date().toISOString();
      const attempt: PublishAttempt = {
        id: nextPublishAttemptId++,
        approval_id: approval.id,
        schedule_job_id: scheduleJob?.id ?? null,
        platform: "linkedin",
        status: input.status,
        external_post_url: externalPostUrl,
        platform_post_id: platformPostId,
        error_message: errorMessage,
        created_at: now,
      };
      publishAttempts.push(attempt);
      if (attempt.status === "succeeded") {
        approval.status = "published";
        if (scheduleJob !== undefined) scheduleJob.status = "completed";
      } else if (approval.status !== "published") {
        approval.status = ready ? "approved" : "changes_requested";
        if (scheduleJob !== undefined) scheduleJob.status = "failed";
      }
      safetyAuditEvents.push({
        id: nextSafetyAuditEventId++,
        campaign_id: approval.campaign_id,
        subject_type: "publish_attempt",
        subject_id: attempt.id,
        event_type:
          attempt.status === "succeeded"
            ? "publish_succeeded"
            : "publish_failed",
        severity: attempt.status === "succeeded" ? "info" : "warning",
        summary:
          attempt.status === "succeeded"
            ? "Publish attempt succeeded"
            : "Publish attempt failed",
        metadata_json: JSON.stringify({
          approvalId: approval.id,
          scheduleJobId: scheduleJob?.id ?? null,
          errorMessage: attempt.error_message,
        }),
        created_at: now,
      });
      if (attempt.status === "failed") {
        const errorItem: ErrorQueueItem = {
          id: nextErrorQueueItemId++,
          campaign_id: approval.campaign_id,
          source_type: "publish_attempt",
          source_id: attempt.id,
          title: "Publish attempt failed",
          detail: attempt.error_message,
          severity: "error",
          status: "open",
          resolution_notes: "",
          created_at: now,
          updated_at: now,
        };
        errorQueueItems.push(errorItem);
        safetyAuditEvents.push({
          id: nextSafetyAuditEventId++,
          campaign_id: approval.campaign_id,
          subject_type: "error_queue_item",
          subject_id: errorItem.id,
          event_type: "error_item_created",
          severity: "warning",
          summary: "Error item created: Publish attempt failed",
          metadata_json: JSON.stringify({
            sourceType: "publish_attempt",
            sourceId: attempt.id,
          }),
          created_at: now,
        });
      }
      return Promise.resolve(attempt.id);
    };

    // Mirrors src-tauri/src/approval_review.rs: one atomic settlement per
    // command, same rules, messages and rejection side effects.
    const APPROVAL_REVIEW_TRANSITIONS: Partial<
      Record<ApprovalStatus, ApprovalStatus[]>
    > = {
      needs_review: ["approved", "changes_requested", "rejected", "cancelled"],
      changes_requested: ["needs_review", "approved", "rejected", "cancelled"],
      approved: ["needs_review", "changes_requested", "cancelled"],
      cancelled: ["needs_review"],
    };
    const STALE_APPROVAL_ERROR =
      "Approval is stale or not ready. Reload and run current AI audit and quality checks.";

    function isApprovalReadyAtRevision(
      approval: Approval,
      revision: number | null | undefined,
    ): boolean {
      const variant = draftVariants.find(
        (row) => row.id === approval.draft_variant_id,
      );
      return (
        variant !== undefined &&
        typeof revision === "number" &&
        variant.content_revision === revision &&
        isApprovalReady(variant)
      );
    }

    function pushApprovalSafetyAudit(
      event: Omit<SafetyAuditEvent, "id" | "created_at">,
    ): void {
      safetyAuditEvents.push({
        ...event,
        id: nextSafetyAuditEventId++,
        created_at: getNow(),
      });
    }

    function projectRejectedWorkflow(run: AgentRun, errorMessage: string) {
      const step = workflowSteps.find((row) => row.id === run.workflow_step_id);
      const workflowRun = workflowRuns.find(
        (row) => row.id === run.workflow_run_id,
      );
      if (!step || !workflowRun || step.workflow_run_id !== workflowRun.id)
        return;
      if (workflowRun.status === "cancelled") return;
      const plannerAudit =
        step.step_key === "audit" &&
        autopilotPlans.some((plan) => plan.workflow_run_id === workflowRun.id);
      if (plannerAudit) return;
      if (
        !["running", "waiting_approval", "failed", "blocked"].includes(
          step.status,
        )
      )
        throw new Error("Unsupported workflow step transition");
      const now = getNow();
      workflowStepExecutions
        .filter(
          (row) =>
            row.agent_run_id === run.id && row.workflow_step_id === step.id,
        )
        .forEach((execution) => {
          execution.status = "cancelled";
          execution.error_summary = errorMessage;
          execution.completed_at = execution.completed_at ?? now;
          execution.updated_at = now;
        });
      const previousStatus = step.status;
      step.status = "blocked";
      step.output_summary = "";
      step.error_message = errorMessage;
      step.completed_at = null;
      step.updated_at = now;
      if (previousStatus !== "blocked")
        addNativeWorkflowEvent(
          workflowRun.id,
          step.id,
          "step_blocked",
          `${step.title} blocked`,
        );
      const current = workflowSteps
        .filter((row) => row.workflow_run_id === workflowRun.id)
        .sort((left, right) => left.sort_order - right.sort_order)
        .find((row) => !["completed", "skipped"].includes(row.status));
      const nextStatus = !current
        ? "completed"
        : current.status === "waiting_approval" ||
            current.status === "blocked" ||
            current.status === "failed"
          ? current.status
          : "running";
      workflowRun.status = nextStatus;
      workflowRun.current_step_key = current?.step_key ?? "measure";
      if (nextStatus === "running")
        workflowRun.started_at = workflowRun.started_at ?? now;
      workflowRun.completed_at =
        nextStatus === "completed" ? (workflowRun.completed_at ?? now) : null;
      workflowRun.updated_at = now;
      if (step.step_key === "score")
        syncNativeScoringBacklog(workflowRun.id, "blocked");
    }

    function rejectLinkedAgentRuns(approvalId: number, detail: string) {
      const errorMessage = `Approval rejected: ${detail}`;
      const now = getNow();
      for (const checkpoint of agentApprovalCheckpoints.filter(
        (row) => row.approval_id === approvalId,
      )) {
        const tool = agentToolCalls.find(
          (row) =>
            row.id === checkpoint.pending_tool_call_id &&
            ["waiting_approval", "running"].includes(row.status),
        );
        if (tool) {
          tool.status = "rejected";
          tool.error_message = errorMessage;
          tool.completed_at = now;
        }
        const run = agentRuns.find((row) => row.id === checkpoint.agent_run_id);
        if (!run) continue;
        run.status = "cancelled";
        run.error_message = errorMessage;
        run.completed_at = now;
        run.updated_at = now;
        projectRejectedWorkflow(run, errorMessage);
        agentRunEvents.push({
          id: nextAgentRunEventId++,
          agent_run_id: run.id,
          event_type: "run_cancelled",
          summary: `Agent run cancelled after approval rejection: ${detail}`,
          created_at: now,
        });
      }
      removeRows(
        agentApprovalCheckpoints,
        (row) => row.approval_id === approvalId,
      );
    }

    function upsertApprovalRejectionError(approval: Approval, detail: string) {
      const title = "Approval rejected";
      const now = getNow();
      let item = errorQueueItems.find(
        (row) =>
          row.source_type === "approval" &&
          row.source_id === approval.id &&
          ["open", "in_progress", "awaiting_review"].includes(row.status),
      );
      const eventType = item ? "error_item_updated" : "error_item_created";
      if (item) {
        Object.assign(item, {
          campaign_id: approval.campaign_id,
          title,
          detail,
          severity: "warning",
          updated_at: now,
        });
      } else {
        item = {
          id: nextErrorQueueItemId++,
          campaign_id: approval.campaign_id,
          source_type: "approval",
          source_id: approval.id,
          title,
          detail,
          severity: "warning",
          status: "open",
          resolution_notes: "",
          created_at: now,
          updated_at: now,
        };
        errorQueueItems.push(item);
      }
      pushApprovalSafetyAudit({
        campaign_id: approval.campaign_id,
        subject_type: "error_queue_item",
        subject_id: item.id,
        event_type: eventType,
        severity: "warning",
        summary: `Error item ${eventType === "error_item_created" ? "created" : "updated"}: ${title}`,
        metadata_json: JSON.stringify({
          sourceType: "approval",
          sourceId: approval.id,
        }),
      });
    }

    function createApprovalCommand(args?: unknown): Promise<unknown> {
      return nativeAuditMutation(() => {
        const input = (
          args as { input?: { draftId?: number; reviewerNotes?: string } }
        )?.input;
        const draftId = Number(input?.draftId ?? 0);
        const draft = drafts.find((row) => row.id === draftId);
        if (!draft) throw new Error("Draft was not found");
        const campaign = campaigns.find((row) => row.id === draft.campaign_id);
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        if (draft.status !== "ready_for_review")
          throw new Error("Draft is not ready for review");
        const selected = draftVariants.filter(
          (row) => row.draft_id === draftId && row.status === "selected",
        );
        const variant = selected[0];
        if (selected.length !== 1 || !variant)
          throw new Error("Select a draft variant before review");
        if (!isApprovalReady(variant))
          throw new Error(
            "Selected variant requires both a completed current-revision AI audit with six canonical non-blocking findings and a passed quality score of at least 70",
          );
        if (
          draftAudits.some(
            (audit) =>
              audit.draft_variant_id === variant.id &&
              audit.severity === "block",
          )
        )
          throw new Error("Blocked variants cannot be sent for approval");
        if (approvals.some((row) => row.draft_id === draftId))
          throw new Error("Draft already has an approval record");
        const now = getNow();
        const approval: Approval = {
          id: nextApprovalId++,
          campaign_id: draft.campaign_id,
          draft_id: draftId,
          draft_variant_id: variant.id,
          reviewed_content_revision: variant.content_revision,
          status: "needs_review",
          reviewer_notes: (input?.reviewerNotes ?? "").trim(),
          approved_at: null,
          rejected_at: null,
          created_at: now,
          updated_at: now,
        };
        approvals.push(approval);
        return approval.id;
      });
    }

    function setApprovalStatusCommand(args?: unknown): Promise<unknown> {
      return nativeAuditMutation(() => {
        const input = (
          args as {
            input?: {
              id?: number;
              status?: ApprovalStatus;
              contentRevision?: number;
              reviewerNotes?: string;
            };
          }
        )?.input;
        const approval = approvals.find((row) => row.id === input?.id);
        if (!approval) throw new Error("Approval was not found");
        const campaign = campaigns.find(
          (row) => row.id === approval.campaign_id,
        );
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        const next = input?.status as ApprovalStatus;
        if (
          !(APPROVAL_REVIEW_TRANSITIONS[approval.status] ?? []).includes(next)
        )
          throw new Error("Unsupported approval transition");
        if (
          next === "approved" &&
          !isApprovalReadyAtRevision(approval, input?.contentRevision)
        )
          throw new Error(STALE_APPROVAL_ERROR);
        const now = getNow();
        const notes = input?.reviewerNotes?.trim();
        approval.status = next;
        if (notes !== undefined) approval.reviewer_notes = notes;
        if (next === "approved") {
          approval.reviewed_content_revision = input?.contentRevision ?? null;
          approval.approved_at = now;
          approval.rejected_at = null;
        }
        if (next === "rejected") approval.rejected_at = now;
        approval.updated_at = now;
        const draft = drafts.find((row) => row.id === approval.draft_id);
        if (draft && next === "changes_requested") {
          draft.status = "needs_revision";
          draft.updated_at = now;
        }
        if (draft && next === "needs_review") {
          draft.status = "ready_for_review";
          draft.updated_at = now;
        }
        if (next === "rejected") {
          const detail = notes || "Approval rejected by operator review";
          rejectLinkedAgentRuns(approval.id, detail);
          pushApprovalSafetyAudit({
            campaign_id: approval.campaign_id,
            subject_type: "approval",
            subject_id: approval.id,
            event_type: "approval_rejected",
            severity: "warning",
            summary: "Approval rejected",
            metadata_json: JSON.stringify({ reviewerNotes: detail }),
          });
          upsertApprovalRejectionError(approval, detail);
        }
        return null;
      });
    }

    /** Mirrors `approval_reads.rs` list/eligible/preflight commands. */
    const SNAPSHOT_KEYS = [
      "campaign_id",
      "draft_id",
      "draft_variant_id",
      "draft_candidate_post_id",
      "draft_angle",
      "draft_notes",
      "draft_status",
      "campaign_name",
      "campaign_status",
      "candidate_source_keyword",
      "target_url",
      "target_author_name",
      "target_author_profile_url",
      "target_content",
      "variant_number",
      "variant_hook",
      "variant_body",
      "variant_cta",
      "variant_hashtags",
      "variant_status",
      "created_at",
      "updated_at",
    ];
    /** Calendar approval snapshot columns (`content_calendar.rs`). */
    const APPROVAL_SNAPSHOT_KEYS = [
      "approval_id",
      "campaign_id",
      "approval_status",
      "approval_reviewer_notes",
      "approval_approved_at",
      "campaign_name",
      "campaign_status",
      "draft_id",
      "draft_angle",
      "draft_notes",
      "candidate_post_id",
      "candidate_source_keyword",
      "target_url",
      "target_author_name",
      "target_author_profile_url",
      "target_content",
      "variant_id",
      "variant_number",
      "variant_hook",
      "variant_body",
      "variant_cta",
      "variant_hashtags",
      "schedule_job_id",
      "schedule_scheduled_for",
      "schedule_timezone",
      "schedule_status",
      "schedule_attempt_count",
      "schedule_last_error",
      "schedule_updated_at",
    ];
    const APPROVAL_KEYS = [
      ...SNAPSHOT_KEYS,
      "id",
      "status",
      "reviewed_content_revision",
      "current_content_revision",
      "readiness",
      "reviewer_notes",
      "approved_at",
      "rejected_at",
    ];
    const pickKeys = (
      row: Record<string, unknown>,
      keys: string[],
    ): Record<string, unknown> =>
      Object.fromEntries(keys.map((key) => [key, row[key]]));
    const auditsForVariants = (variantIds: number[]): unknown[] => {
      const ids = new Set(variantIds);
      return draftAudits
        .filter((audit) => ids.has(audit.draft_variant_id))
        .sort((left, right) => left.id - right.id)
        .map((audit) => ({
          id: audit.id,
          draft_variant_id: audit.draft_variant_id,
          rule_key: audit.rule_key,
          severity: audit.severity,
          message: audit.message,
          created_at: audit.created_at,
        }));
    };
    const approvalListCommand = (args: unknown): Promise<unknown> => {
      const input = nativeInput<{ campaignId?: number }>(args);
      const matching = selectApprovalJoin(
        input.campaignId === undefined ? [] : [input.campaignId],
      ) as Array<Record<string, unknown>>;
      const rows = matching
        .slice(0, 500)
        .map((row) => pickKeys(row, APPROVAL_KEYS));
      const approvalIds = new Set(rows.map((row) => Number(row.id)));
      const byNewest = <T extends { id: number }>(
        list: T[],
        at: (row: T) => string,
      ): T[] =>
        [...list].sort(
          (left, right) =>
            at(right).localeCompare(at(left)) || right.id - left.id,
        );
      const checkpointCounts = new Map<number, number>();
      for (const checkpoint of agentApprovalCheckpoints) {
        if (!approvalIds.has(checkpoint.approval_id)) continue;
        checkpointCounts.set(
          checkpoint.approval_id,
          (checkpointCounts.get(checkpoint.approval_id) ?? 0) + 1,
        );
      }
      return Promise.resolve({
        rows,
        scheduleJobs: byNewest(
          scheduleJobs.filter((job) => approvalIds.has(job.approval_id)),
          (job) => job.updated_at,
        ).map((job) => ({ ...job })),
        publishAttempts: byNewest(
          publishAttempts.filter((attempt) =>
            approvalIds.has(attempt.approval_id),
          ),
          (attempt) => attempt.created_at,
        ).map((attempt) => ({ ...attempt })),
        linkedAgentRunCounts: [...checkpointCounts.entries()]
          .sort(([left], [right]) => left - right)
          .map(([approval_id, count]) => ({ approval_id, count })),
        audits: auditsForVariants(
          rows.map((row) => Number(row.draft_variant_id)),
        ),
        // Tests can report a larger uncapped total without seeding 500+ rows.
        totalCount:
          typeof w.__LINKGO_APPROVAL_LIST_TOTAL__ === "number"
            ? w.__LINKGO_APPROVAL_LIST_TOTAL__
            : matching.length,
      });
    };
    const approvalEligibleDraftsCommand = (args: unknown): Promise<unknown> => {
      const input = nativeInput<{ campaignId?: number }>(args);
      const matching = selectApprovalEligibleDrafts(
        input.campaignId === undefined ? [] : [input.campaignId],
      ) as Array<Record<string, unknown>>;
      const rows = matching
        .slice(0, 200)
        .map((row) => pickKeys(row, SNAPSHOT_KEYS));
      return Promise.resolve({
        rows,
        audits: auditsForVariants(
          rows.map((row) => Number(row.draft_variant_id)),
        ),
        totalCount:
          typeof w.__LINKGO_APPROVAL_ELIGIBLE_TOTAL__ === "number"
            ? w.__LINKGO_APPROVAL_ELIGIBLE_TOTAL__
            : matching.length,
      });
    };
    /** Mirrors `content_calendar.rs` commands (validation already in Zod). */
    const calendarCommand = (
      cmd: string,
      args: unknown,
    ): Promise<unknown> | undefined => {
      const slotRowKeys = [
        ...APPROVAL_SNAPSHOT_KEYS,
        "id",
        "purpose",
        "slot_for",
        "timezone",
        "format",
        "angle",
        "visual_direction",
        "cta",
        "notes",
        "status",
        "created_at",
        "updated_at",
        "publish_attempt_id",
        "publish_status",
        "publish_external_post_url",
        "publish_platform_post_id",
        "publish_error_message",
        "publish_created_at",
      ];
      const slotForMutation = (id: number): ContentCalendarSlot => {
        const slot = contentCalendarSlots.find((row) => row.id === id);
        if (!slot) throw new Error("Calendar slot was not found");
        const campaign = campaigns.find((row) => row.id === slot.campaign_id);
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        return slot;
      };
      type SlotFields = {
        purpose: ContentCalendarPurpose;
        slotFor: string;
        timezone?: string;
        format: ContentCalendarFormat;
        angle: string;
        visualDirection: string;
        cta: string;
        notes?: string;
      };
      const applyFields = (
        slot: ContentCalendarSlot,
        input: SlotFields,
      ): void => {
        slot.purpose = input.purpose;
        slot.slot_for = input.slotFor.trim();
        slot.timezone = input.timezone?.trim() || "local";
        slot.format = input.format;
        slot.angle = input.angle.trim();
        slot.visual_direction = input.visualDirection.trim();
        slot.cta = input.cta.trim();
        slot.notes = (input.notes ?? "").trim();
      };
      if (cmd === "linkgo_content_calendar_list") {
        const input = nativeInput<{ campaignId?: number }>(args);
        const rows = (
          selectContentCalendarSlots(
            input.campaignId === undefined ? [] : [input.campaignId],
          ) as Array<Record<string, unknown>>
        )
          .slice(0, 500)
          .map((row) => pickKeys(row, slotRowKeys));
        return Promise.resolve({
          rows,
          audits: auditsForVariants(rows.map((row) => Number(row.variant_id))),
        });
      }
      if (cmd === "linkgo_content_calendar_eligible_approvals") {
        const input = nativeInput<{ campaignId?: number }>(args);
        const rows = (
          selectContentCalendarEligibleApprovals(
            input.campaignId === undefined ? [] : [input.campaignId],
          ) as Array<Record<string, unknown>>
        )
          .slice(0, 200)
          .map((row) => pickKeys(row, APPROVAL_SNAPSHOT_KEYS));
        return Promise.resolve({
          rows,
          audits: auditsForVariants(rows.map((row) => Number(row.variant_id))),
        });
      }
      if (cmd === "linkgo_content_calendar_create_slot") {
        return runNativeMutation(() => {
          const input = nativeInput<SlotFields & { approvalId: number }>(args);
          const approval = approvals.find((row) => row.id === input.approvalId);
          if (!approval) throw new Error("Approval was not found");
          const campaign = campaigns.find(
            (row) => row.id === approval.campaign_id,
          );
          if (campaign?.status === "archived")
            throw new Error("Campaign is archived");
          if (!["approved", "scheduled", "published"].includes(approval.status))
            throw new Error(
              "Approval must be approved before calendar planning",
            );
          if (
            contentCalendarSlots.some(
              (slot) => slot.approval_id === approval.id,
            )
          )
            throw new Error("Approval already has a calendar slot");
          const now = getNow();
          const slot: ContentCalendarSlot = {
            id: nextContentCalendarSlotId,
            campaign_id: approval.campaign_id,
            approval_id: approval.id,
            purpose: input.purpose,
            slot_for: "",
            timezone: "local",
            format: input.format,
            angle: "",
            visual_direction: "",
            cta: "",
            notes: "",
            status: "planned",
            created_at: now,
            updated_at: now,
          };
          applyFields(slot, input);
          contentCalendarSlots.push(slot);
          nextContentCalendarSlotId += 1;
          return slot.id;
        });
      }
      if (cmd === "linkgo_content_calendar_update_slot") {
        return runNativeMutation(() => {
          const input = nativeInput<SlotFields & { id: number }>(args);
          const slot = slotForMutation(input.id);
          if (slot.status !== "planned")
            throw new Error("Archived calendar slots cannot be edited");
          applyFields(slot, input);
          slot.updated_at = getNow();
          return null;
        });
      }
      if (cmd === "linkgo_content_calendar_archive_slot") {
        return runNativeMutation(() => {
          const slot = slotForMutation(nativeInput<{ id: number }>(args).id);
          slot.status = "archived";
          slot.updated_at = getNow();
          return null;
        });
      }
      if (cmd === "linkgo_content_calendar_schedule_preflight") {
        return runNativeMutation(() => {
          const slot = slotForMutation(nativeInput<{ id: number }>(args).id);
          if (slot.status === "archived")
            throw new Error("Archived slots cannot be scheduled");
          const approval = approvals.find((row) => row.id === slot.approval_id);
          if (approval?.status !== "approved")
            throw new Error("Only approved posts can be scheduled");
          return {
            approvalId: slot.approval_id,
            scheduledFor: slot.slot_for,
            timezone: slot.timezone,
          };
        });
      }
      return undefined;
    };

    /** Mirrors `approval_reads::publish_preflight` checks and messages. */
    const approvalPublishPreflightCommand = (
      args: unknown,
    ): Promise<unknown> => {
      try {
        const input = nativeInput<{
          approvalId: number;
          scheduleJobId?: number;
        }>(args);
        if (safetySettings.global_kill_switch === 1) {
          const reason = safetySettings.kill_switch_reason;
          throw new Error(
            reason
              ? `Global kill switch is enabled: ${reason}`
              : "Global kill switch is enabled",
          );
        }
        const approval = approvals.find((row) => row.id === input.approvalId);
        if (!approval) throw new Error("Approval was not found");
        const campaign = campaigns.find(
          (row) => row.id === approval.campaign_id,
        );
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        if (!["approved", "scheduled"].includes(approval.status))
          throw new Error(
            "Only approved or scheduled approvals can publish via LinkedIn",
          );
        if (
          publishAttempts.some(
            (attempt) =>
              attempt.approval_id === approval.id &&
              attempt.status === "succeeded",
          )
        )
          throw new Error("Approval already has a successful publish attempt");
        if (
          !isApprovalReadyAtRevision(
            approval,
            approval.reviewed_content_revision,
          )
        )
          throw new Error(STALE_APPROVAL_ERROR);
        if (input.scheduleJobId === undefined) {
          if (approval.status === "scheduled")
            throw new Error(
              "Scheduled approvals require the current schedule job",
            );
          return Promise.resolve(null);
        }
        const current = [...scheduleJobs]
          .filter((job) => job.approval_id === approval.id)
          .sort(
            (left, right) =>
              right.updated_at.localeCompare(left.updated_at) ||
              right.id - left.id,
          )[0];
        if (
          current?.id !== input.scheduleJobId ||
          current.status !== "scheduled"
        )
          throw new Error("Schedule job is not the current scheduled job");
        return Promise.resolve(null);
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    const scheduleApprovalCommand = (args?: unknown) => {
      const input = (
        args as {
          input?: {
            approvalId?: number;
            scheduledFor?: string;
            timezone?: string;
          };
        }
      )?.input;
      // Mirrors `validate_schedule` in src-tauri/src/approval_scheduling.rs.
      if (
        !input ||
        Object.keys(input).some(
          (key) => !["approvalId", "scheduledFor", "timezone"].includes(key),
        )
      )
        throw new Error("Invalid schedule input");
      if (!Number.isInteger(input.approvalId) || (input.approvalId ?? 0) <= 0)
        throw new Error("Approval id must be a positive integer");
      const scheduledFor = (input.scheduledFor ?? "").trim();
      if (scheduledFor.length > 80)
        throw new Error("Scheduled time must be 80 characters or fewer");
      if (
        !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(
          scheduledFor,
        ) ||
        !Number.isFinite(Date.parse(scheduledFor.replace(" ", "T")))
      )
        throw new Error("Scheduled time must be a valid date");
      const timezoneInput = (input.timezone ?? "").trim();
      if (timezoneInput.length > 80)
        throw new Error("Timezone must be 80 characters or fewer");
      const timezone = timezoneInput || "local";
      const approval = approvals.find((row) => row.id === input.approvalId);
      if (!approval) throw new Error("Approval was not found");
      const campaign = campaigns.find((row) => row.id === approval.campaign_id);
      if (campaign?.status === "archived")
        throw new Error("Campaign is archived");
      if (approval.status !== "approved")
        throw new Error("Only approved posts can be scheduled");
      if (
        !isApprovalReadyAtRevision(approval, approval.reviewed_content_revision)
      )
        throw new Error(STALE_APPROVAL_ERROR);
      const existing = scheduleJobs.find(
        (row) => row.approval_id === approval.id,
      );
      if (existing && !["cancelled", "failed"].includes(existing.status)) {
        throw new Error("Approval already has an active schedule job");
      }
      const windowKey = scheduledFor.slice(0, 10);
      const currentCount = scheduleJobs.filter((job) => {
        const owner = approvals.find((row) => row.id === job.approval_id);
        return (
          owner?.campaign_id === approval.campaign_id &&
          job.scheduled_for.slice(0, 10) === windowKey &&
          ["scheduled", "completed"].includes(job.status)
        );
      }).length;
      const limit = campaign?.daily_post_limit ?? 0;
      const now = getNow();
      if (safetySettings.global_kill_switch === 1) {
        const summary = `Post scheduling blocked by global kill switch for ${windowKey}: ${currentCount}/${limit} used`;
        safetyAuditEvents.push({
          id: nextSafetyAuditEventId++,
          campaign_id: approval.campaign_id,
          subject_type: "schedule_job",
          subject_id: existing?.id ?? null,
          event_type: "schedule_blocked",
          severity: "block",
          summary: "Post scheduling blocked by global kill switch",
          metadata_json: JSON.stringify({
            reason: safetySettings.kill_switch_reason,
          }),
          created_at: now,
        });
        rateLimitEvents.push({
          id: nextRateLimitEventId++,
          campaign_id: approval.campaign_id,
          action: "schedule_post",
          window_key: windowKey,
          limit_value: limit,
          current_count: currentCount,
          decision: "blocked",
          summary,
          created_at: now,
        });
        throw new Error(
          safetySettings.kill_switch_reason
            ? `Global kill switch is enabled: ${safetySettings.kill_switch_reason}`
            : "Global kill switch is enabled",
        );
      }
      const summary =
        currentCount < limit
          ? `Schedule allowed for ${windowKey}: ${currentCount}/${limit} used`
          : `Daily post scheduling limit reached for ${windowKey}: ${currentCount}/${limit} used`;
      if (currentCount >= limit) {
        rateLimitEvents.push({
          id: nextRateLimitEventId++,
          campaign_id: approval.campaign_id,
          action: "schedule_post",
          window_key: windowKey,
          limit_value: limit,
          current_count: currentCount,
          decision: "blocked",
          summary,
          created_at: now,
        });
        safetyAuditEvents.push({
          id: nextSafetyAuditEventId++,
          campaign_id: approval.campaign_id,
          subject_type: "approval",
          subject_id: approval.id,
          event_type: "schedule_blocked",
          severity: "block",
          summary,
          metadata_json: JSON.stringify({
            windowKey,
            limitValue: limit,
            currentCount,
          }),
          created_at: now,
        });
        throw new Error(summary);
      }
      const idempotencyKey = `approval:${approval.id}:linkedin:${scheduledFor}`;
      const job = existing ?? {
        id: nextScheduleJobId++,
        approval_id: approval.id,
        platform: "linkedin" as const,
        scheduled_for: scheduledFor,
        timezone,
        status: "scheduled" as const,
        idempotency_key: idempotencyKey,
        attempt_count: 0,
        max_attempts: 3,
        next_attempt_at: scheduledFor,
        last_attempted_at: null,
        last_error: "",
        locked_at: null,
        locked_by: null,
        created_at: now,
        updated_at: now,
      };
      if (!existing) scheduleJobs.push(job);
      Object.assign(job, {
        status: "scheduled",
        scheduled_for: scheduledFor,
        timezone,
        idempotency_key: idempotencyKey,
        updated_at: now,
      });
      approval.status = "scheduled";
      approval.updated_at = now;
      rateLimitEvents.push({
        id: nextRateLimitEventId++,
        campaign_id: approval.campaign_id,
        action: "schedule_post",
        window_key: windowKey,
        limit_value: limit,
        current_count: currentCount,
        decision: "allowed",
        summary,
        created_at: now,
      });
      safetyAuditEvents.push({
        id: nextSafetyAuditEventId++,
        campaign_id: approval.campaign_id,
        subject_type: "schedule_job",
        subject_id: job.id,
        event_type: "schedule_allowed",
        severity: "info",
        summary,
        metadata_json: JSON.stringify({
          approvalId: approval.id,
          scheduledFor,
        }),
        created_at: now,
      });
      return Promise.resolve(job.id);
    };

    const cancelScheduleCommand = (args?: unknown) => {
      const id = (args as { input?: { id?: number } })?.input?.id;
      if (!Number.isInteger(id) || (id ?? 0) <= 0)
        throw new Error("Schedule job id must be a positive integer");
      const job = scheduleJobs.find((row) => row.id === id);
      if (!job) throw new Error("Schedule job was not found");
      const approval = approvals.find((row) => row.id === job.approval_id);
      const campaign = campaigns.find(
        (row) => row.id === approval?.campaign_id,
      );
      if (campaign?.status === "archived")
        throw new Error("Campaign is archived");
      if (job.status === "completed")
        throw new Error("Completed schedules cannot be cancelled");
      const now = getNow();
      job.status = "cancelled";
      job.updated_at = now;
      if (approval && approval.status !== "published") {
        approval.status = "approved";
        approval.updated_at = now;
      }
      safetyAuditEvents.push({
        id: nextSafetyAuditEventId++,
        campaign_id: approval?.campaign_id ?? null,
        subject_type: "schedule_job",
        subject_id: job.id,
        event_type: "schedule_cancelled",
        severity: "info",
        summary: "Schedule cancelled",
        metadata_json: JSON.stringify({ approvalId: approval?.id }),
        created_at: now,
      });
      return Promise.resolve();
    };

    function createQualityAgent(
      run: DraftQualityRun,
      attempt: DraftQualityAttempt,
      variant: DraftVariant,
    ): number {
      const draft = drafts.find((row) => row.id === variant.draft_id);
      if (!draft) throw new Error("Draft variant was not found");
      const now = new Date().toISOString();
      const agentId = nextAgentRunId++;
      agentRuns.push({
        id: agentId,
        campaign_id: draft.campaign_id,
        workflow_run_id: null,
        workflow_step_id: null,
        agent_role: "auditor",
        provider_key: run.provider_key,
        model_name: run.model_name,
        playbook_key: "linkedin_humanizer",
        status: "queued",
        input_summary: `Score draft quality revision ${variant.content_revision}.`,
        input_context_json: JSON.stringify({
          qualityRequest: {
            campaignId: draft.campaign_id,
            draftVariantId: variant.id,
            qualityRunId: run.id,
            attemptId: attempt.id,
            contentRevision: variant.content_revision,
            hook: variant.hook,
            body: variant.body,
            cta: variant.cta,
            hashtags: variant.hashtags,
            threshold: 70,
            rewriteAllowed: run.applied_rewrite_count < 2,
            priorCategoryFeedback: [],
          },
        }),
        output_summary: "",
        error_message: "",
        iteration_count: 0,
        started_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
      attempt.agent_run_id = agentId;
      run.active_agent_run_id = agentId;
      return agentId;
    }

    function qualityScope(args: unknown): Record<string, unknown> {
      const scope = args as Record<string, unknown> | undefined;
      const payload = scope?.payload as Record<string, unknown> | undefined;
      return (
        (scope?.input as Record<string, unknown> | undefined) ??
        (payload?.input as Record<string, unknown> | undefined) ??
        payload ??
        scope ??
        {}
      );
    }

    function claimDraftQualityCommand(args: unknown): Promise<unknown> {
      const input = qualityScope(args);
      const variantId = Number(input.draftVariantId ?? 0);
      const variant = draftVariants.find((row) => row.id === variantId);
      const draft = variant
        ? drafts.find((row) => row.id === variant.draft_id)
        : undefined;
      if (!variant || !draft)
        return Promise.reject(new Error("Draft variant was not found"));
      if (!isApprovalAiAuditReady(variant))
        return Promise.reject(
          new Error(
            "Current revision requires a completed canonical non-blocking AI audit",
          ),
        );
      const now = new Date().toISOString();
      const run: DraftQualityRun = {
        id: nextDraftQualityRunId++,
        draft_variant_id: variant.id,
        current_content_revision: variant.content_revision,
        provider_key: (input.providerKey as AgentProviderKey) ?? "dry_run",
        model_name: String(input.modelName ?? "").trim(),
        status: "running",
        final_score: null,
        summary: "",
        applied_rewrite_count: 0,
        active_agent_run_id: null,
        active_ai_audit_run_id: null,
        error_message: "",
        updated_at: now,
      };
      const attempt: DraftQualityAttempt = {
        id: nextDraftQualityAttemptId++,
        run_id: run.id,
        attempt_number: 1,
        content_revision: variant.content_revision,
        agent_run_id: 0,
        status: "scoring",
      };
      draftQualityRuns.push(run);
      draftQualityAttempts.push(attempt);
      const agentRunId = createQualityAgent(run, attempt, variant);
      return Promise.resolve({
        qualityRunId: run.id,
        attemptId: attempt.id,
        agentRunId,
        campaignId: draft.campaign_id,
        draftVariantId: variant.id,
        contentRevision: variant.content_revision,
      });
    }

    function regenerateQualityRewriteAudits(variant: DraftVariant): void {
      const hook = variant.hook.trim();
      const body = variant.body.trim();
      const cta = variant.cta.trim();
      const hashtags = variant.hashtags.trim();
      const findings: Array<[string, DraftAuditSeverity, string]> = [
        !hook && !body
          ? [
              "required_text",
              "block",
              "Add a hook or body before this variant can be reviewed.",
            ]
          : ["required_text", "pass", "This variant has draft text to review."],
        `${hook}${body}${cta}${hashtags}`.length > 3000
          ? [
              "total_length",
              "block",
              "Keep the combined hook, body, CTA, and hashtags under 3,000 characters.",
            ]
          : [
              "total_length",
              "pass",
              "This variant stays under the 3,000 character limit.",
            ],
        /https?:\/\/|www\./iu.test(`${hook} ${body} ${cta}`)
          ? [
              "external_link",
              "block",
              "Remove external links from the hook, body, and CTA before review.",
            ]
          : [
              "external_link",
              "pass",
              "No external link was found in the hook, body, or CTA.",
            ],
        (hashtags.match(/#[\p{L}\p{N}_-]+/gu)?.length ?? 0) > 5
          ? ["hashtag_limit", "block", "Use five or fewer hashtags."]
          : [
              "hashtag_limit",
              "pass",
              "This variant uses five or fewer hashtags.",
            ],
      ];
      if (
        hook.length < 35 ||
        /^(excited to|in today's|i'm thrilled|quick update)/iu.test(hook)
      )
        findings.push([
          "weak_hook",
          "warning",
          "Strengthen the hook with a specific, curiosity-driving opening.",
        ]);
      const combined = `${hook} ${body} ${cta} ${hashtags}`.trim();
      if (!/\d/u.test(combined) && !/\b(i|we|my|our)\b/iu.test(combined))
        findings.push([
          "specificity",
          "warning",
          "Add a number or first-person signal so the draft feels specific.",
        ]);
      for (let index = draftAudits.length - 1; index >= 0; index -= 1) {
        if (draftAudits[index].draft_variant_id === variant.id)
          draftAudits.splice(index, 1);
      }
      for (const [rule_key, severity, message] of findings) {
        draftAudits.push({
          id: nextDraftAuditId++,
          draft_variant_id: variant.id,
          content_revision: variant.content_revision,
          rule_key,
          severity,
          message,
          created_at: getNow(),
        });
      }
    }

    function applyDraftQualityScoreCommand(args: unknown): Promise<unknown> {
      const input = qualityScope(args);
      // Mirror ApplyScoreInput's strict Serde boundary before touching mock state.
      const exactFields = (
        value: unknown,
        required: string[],
        optional: string[] = [],
      ): value is Record<string, unknown> =>
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        required.every((key) => Object.hasOwn(value, key)) &&
        Object.keys(value).every(
          (key) => required.includes(key) || optional.includes(key),
        );
      const identities = [
        "qualityRunId",
        "draftVariantId",
        "attemptId",
        "contentRevision",
        "agentRunId",
      ];
      if (
        !exactFields(
          input,
          [...identities, "categoryScores", "summary"],
          ["rewrite"],
        ) ||
        !identities.every((key) => Number.isSafeInteger(input[key])) ||
        typeof input.summary !== "string" ||
        !Array.isArray(input.categoryScores) ||
        !input.categoryScores.every(
          (score) =>
            exactFields(score, ["categoryKey", "score", "feedback"]) &&
            typeof score.categoryKey === "string" &&
            Number.isSafeInteger(score.score) &&
            typeof score.feedback === "string",
        ) ||
        (input.rewrite != null &&
          (!exactFields(input.rewrite, ["hook", "body", "cta", "hashtags"]) ||
            !Object.values(input.rewrite).every(
              (value) => typeof value === "string",
            )))
      )
        return Promise.reject(new Error("Invalid quality settlement DTO"));
      if (!input.summary.trim() || Array.from(input.summary).length > 1000)
        return Promise.reject(new Error("Quality summary is invalid"));
      const run = draftQualityRuns.find(
        (row) => row.id === Number(input.qualityRunId),
      );
      const attempt = draftQualityAttempts.find(
        (row) => row.id === Number(input.attemptId),
      );
      const variant = draftVariants.find(
        (row) => row.id === Number(input.draftVariantId),
      );
      const scores = Array.isArray(input.categoryScores)
        ? (input.categoryScores as Array<Record<string, unknown>>)
        : [];
      if (
        !run ||
        !attempt ||
        !variant ||
        scores.length !== 5 ||
        attempt.agent_run_id !== Number(input.agentRunId)
      )
        return Promise.reject(
          new Error("Quality settlement identity is stale or invalid"),
        );
      const categoryKeys: ReadonlyArray<
        DraftQualityCategoryScore["category_key"]
      > = [
        "hook_strength",
        "authenticity",
        "linkedin_fit",
        "specificity",
        "narrative_structure",
      ];
      const isCategoryKey = (
        value: unknown,
      ): value is DraftQualityCategoryScore["category_key"] =>
        categoryKeys.some((key) => key === value);
      if (
        new Set(scores.map((score) => score.categoryKey)).size !== 5 ||
        !scores.every(
          (score) =>
            isCategoryKey(score.categoryKey) &&
            Number.isInteger(score.score) &&
            Number(score.score) >= 0 &&
            Number(score.score) <= 100 &&
            String(score.feedback).trim() !== "",
        )
      )
        return Promise.reject(new Error("Quality category scores are invalid"));
      requireCurrentQualityEvidence(run, variant);
      const scoredAt = new Date().toISOString();
      restoreRows(
        draftQualityCategoryScores,
        draftQualityCategoryScores.filter(
          (row) => row.attempt_id !== attempt.id,
        ),
      );
      for (const score of scores) {
        if (!isCategoryKey(score.categoryKey)) continue;
        draftQualityCategoryScores.push({
          id: nextDraftQualityCategoryScoreId++,
          attempt_id: attempt.id,
          category_key: score.categoryKey,
          score: Number(score.score),
          feedback: String(score.feedback).trim(),
          created_at: scoredAt,
        });
      }
      const overall = Math.round(
        scores.reduce((total, score) => total + Number(score.score ?? 0), 0) /
          5,
      );
      const now = new Date().toISOString();
      if (overall >= 70) {
        attempt.status = "passed";
        run.status = "passed";
        run.summary = input.summary.trim();
        run.final_score = overall;
        run.active_agent_run_id = null;
        run.updated_at = now;
        persistReloadSnapshot();
        return Promise.resolve({
          status: "passed",
          overallScore: overall,
          contentRevision: variant.content_revision,
          aiAuditRunId: null,
          agentRunId: null,
        });
      }
      const rewrite = input.rewrite as Record<string, unknown> | undefined;
      if (!rewrite || run.applied_rewrite_count >= 2) {
        run.status = "needs_revision";
        run.summary = input.summary.trim();
        run.final_score = overall;
        return Promise.resolve({
          status: "needs_revision",
          overallScore: overall,
        });
      }
      attempt.status = "rewritten";
      variant.hook = String(rewrite.hook ?? "");
      variant.body = String(rewrite.body ?? "");
      variant.cta = String(rewrite.cta ?? "");
      variant.hashtags = String(rewrite.hashtags ?? "");
      variant.content_revision += 1;
      regenerateQualityRewriteAudits(variant);
      revokeEditedApproval(variant);
      variant.updated_at = now;
      run.current_content_revision = variant.content_revision;
      run.applied_rewrite_count += 1;
      const auditId = nextDraftAiAuditRunId++;
      run.active_ai_audit_run_id = auditId;
      run.active_agent_run_id = createQualityAgent(run, attempt, variant);
      const auditAgent = agentRuns.find(
        (row) => row.id === run.active_agent_run_id,
      );
      if (!auditAgent) throw new Error("Quality audit agent was not found");
      auditAgent.input_context_json = JSON.stringify({
        auditRequest: {
          campaignId: auditAgent.campaign_id,
          draftVariantId: variant.id,
          contentRevision: variant.content_revision,
          auditRunId: auditId,
          text: [
            variant.hook,
            variant.body,
            variant.cta,
            variant.hashtags,
          ].join("\n\n"),
        },
      });
      draftAiAuditRuns.push({
        id: auditId,
        draft_variant_id: variant.id,
        content_revision: variant.content_revision,
        agent_run_id: run.active_agent_run_id,
        provider_key: run.provider_key,
        model_name: run.model_name,
        status: "running",
        summary: "",
        error_message: "",
        started_at: now,
        completed_at: null,
        created_at: now,
        updated_at: now,
        workflow_step_execution_id: null,
      });
      return Promise.resolve({
        status: "awaiting_audit",
        overallScore: overall,
        contentRevision: variant.content_revision,
        aiAuditRunId: auditId,
        agentRunId: run.active_agent_run_id,
      });
    }

    function continueDraftQualityCommand(args: unknown): Promise<unknown> {
      const input = qualityScope(args);
      const run = draftQualityRuns.find(
        (row) => row.id === Number(input.qualityRunId),
      );
      const variant = draftVariants.find(
        (row) => row.id === Number(input.draftVariantId),
      );
      if (!run || !variant || run.status !== "running")
        return Promise.reject(new Error("Active quality run was not found"));
      requireCurrentQualityEvidence(run, variant);
      const audit = draftAiAuditRuns.find(
        (row) => row.id === run.active_ai_audit_run_id,
      );
      if (audit?.status !== "completed")
        return Promise.reject(new Error("Rewrite AI audit has not completed"));
      const attempt: DraftQualityAttempt = {
        id: nextDraftQualityAttemptId++,
        run_id: run.id,
        attempt_number:
          draftQualityAttempts.filter((row) => row.run_id === run.id).length +
          1,
        content_revision: variant.content_revision,
        agent_run_id: 0,
        status: "scoring",
      };
      draftQualityAttempts.push(attempt);
      const draft = drafts.find((row) => row.id === variant.draft_id)!;
      const agentRunId = createQualityAgent(run, attempt, variant);
      return Promise.resolve({
        qualityRunId: run.id,
        attemptId: attempt.id,
        agentRunId,
        campaignId: draft.campaign_id,
        draftVariantId: variant.id,
        contentRevision: variant.content_revision,
      });
    }

    function resumeDraftQualityCommand(args: unknown): Promise<unknown> {
      const input = qualityScope(args);
      const run = draftQualityRuns.find(
        (row) => row.id === Number(input.qualityRunId),
      );
      if (
        !run ||
        run.draft_variant_id !== Number(input.draftVariantId) ||
        run.status !== "failed"
      )
        return Promise.reject(
          new Error("Recoverable failed quality run was not found"),
        );
      const variant = draftVariants.find(
        (row) => row.id === Number(input.draftVariantId),
      );
      if (!variant)
        return Promise.reject(new Error("Draft variant was not found"));
      if (run.current_content_revision !== variant.content_revision)
        return Promise.reject(new Error("Draft changed before quality resume"));
      requireCurrentQualityEvidence(run, variant);
      const attemptNumber =
        Math.max(
          0,
          ...draftQualityAttempts
            .filter((row) => row.run_id === run.id)
            .map((row) => row.attempt_number),
        ) + 1;
      if (attemptNumber > 3)
        return Promise.reject(new Error("Quality rewrite limit is exhausted"));
      const draft = drafts.find((row) => row.id === variant.draft_id);
      if (!draft)
        return Promise.reject(new Error("Draft variant was not found"));
      // Resume scores directly; unlike continuation it needs no linked rewrite audit.
      const attempt: DraftQualityAttempt = {
        id: nextDraftQualityAttemptId++,
        run_id: run.id,
        attempt_number: attemptNumber,
        content_revision: variant.content_revision,
        agent_run_id: 0,
        status: "scoring",
      };
      draftQualityAttempts.push(attempt);
      const agentRunId = createQualityAgent(run, attempt, variant);
      run.status = "running";
      run.error_message = "";
      run.active_ai_audit_run_id = null;
      run.updated_at = getNow();
      return Promise.resolve({
        qualityRunId: run.id,
        attemptId: attempt.id,
        agentRunId,
        campaignId: draft.campaign_id,
        draftVariantId: variant.id,
        contentRevision: variant.content_revision,
      });
    }

    function failDraftQualityCommand(args: unknown): Promise<unknown> {
      const input = qualityScope(args);
      const run = draftQualityRuns.find(
        (row) => row.id === Number(input.qualityRunId),
      );
      const runAttempts = draftQualityAttempts
        .filter((attempt) => attempt.run_id === Number(input.qualityRunId))
        .sort((left, right) => left.attempt_number - right.attempt_number);
      // Mirrors native: only the loop owning the latest attempt may fail it.
      if (runAttempts.at(-1)?.id !== Number(input.attemptId))
        return Promise.reject(new Error("Quality attempt is no longer active"));
      if (!run || run.status !== "running")
        return Promise.reject(new Error("Active quality run was not found"));
      const message = String(input.errorMessage ?? "").trim();
      const now = new Date().toISOString();
      run.status = "failed";
      run.error_message = message;
      runAttempts
        .filter((attempt) => attempt.status === "scoring")
        .forEach((attempt) => (attempt.status = "failed"));
      // Mirrors native linked settlement: rewrite audits and agents fail too.
      const auditIds = new Set<number>(
        [
          run.active_ai_audit_run_id,
          ...runAttempts.map((attempt) => attempt.ai_audit_run_id),
        ].filter((id): id is number => id !== null),
      );
      const agentIds = new Set<number>(
        [
          run.active_agent_run_id,
          ...runAttempts.map((attempt) => attempt.agent_run_id),
        ].filter((id): id is number => id !== null),
      );
      for (const audit of draftAiAuditRuns) {
        if (!auditIds.has(audit.id)) continue;
        if (audit.agent_run_id !== null) agentIds.add(audit.agent_run_id);
        if (audit.status !== "pending" && audit.status !== "running") continue;
        audit.status = "failed";
        audit.error_message = message;
        audit.completed_at = now;
        audit.updated_at = now;
      }
      for (const agent of agentRuns) {
        if (!agentIds.has(agent.id)) continue;
        if (
          agent.status !== "queued" &&
          agent.status !== "running" &&
          agent.status !== "waiting_approval"
        )
          continue;
        agent.status = "failed";
        agent.error_message = message;
        agent.completed_at = now;
        agent.updated_at = now;
        removeRows(
          agentApprovalCheckpoints,
          (row) => row.agent_run_id === agent.id,
        );
        agentRunEvents.push({
          id: nextAgentRunEventId++,
          agent_run_id: agent.id,
          event_type: "run_failed",
          summary: message,
          created_at: now,
        });
      }
      run.active_agent_run_id = null;
      run.active_ai_audit_run_id = null;
      return Promise.resolve(null);
    }

    /** Emulates ON DELETE CASCADE for every campaign child table. */
    function cascadeDeletedCampaign(id: number): void {
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
    }

    /**
     * Emulates a pinned native transaction: every mock table is restored if
     * the mutation throws, and a successful mutation is persisted for reload.
     */
    function runNativeMutation<T>(mutation: () => T): Promise<T> {
      const snapshot = createTransactionSnapshot();
      try {
        const result = mutation();
        persistReloadSnapshot();
        return Promise.resolve(result);
      } catch (error) {
        restoreTransactionSnapshot(snapshot);
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    function nativeInput<T>(args: unknown): T {
      return (args as { input: T }).input;
    }

    function pushLearningEvent(
      event: Omit<LearningEvent, "id" | "created_at">,
    ): void {
      learningEvents.push({
        ...event,
        id: nextLearningEventId,
        created_at: getNow(),
      });
      nextLearningEventId += 1;
    }

    function requireMutableMetricsCampaign(campaignId: number): void {
      const campaign = campaigns.find((row) => row.id === campaignId);
      if (!campaign) throw new Error("Campaign was not found");
      if (campaign.status === "archived")
        throw new Error("Campaign is archived");
    }

    function recordPostMetricCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          campaignId: number;
          approvalId: number;
          publishAttemptId?: number;
          measuredAt: string;
          impressions: number;
          reactions: number;
          comments: number;
          reposts: number;
          profileVisits: number;
          linkClicks: number;
          ctr: number | null;
          notes: string;
        }>(args);
        const approval = approvals.find((row) => row.id === input.approvalId);
        if (!approval) throw new Error("Approval was not found");
        if (approval.campaign_id !== input.campaignId)
          throw new Error("Approval does not belong to this campaign");
        const campaign = campaigns.find(
          (row) => row.id === approval.campaign_id,
        );
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        if (approval.status !== "published")
          throw new Error("Only published approvals can record metrics");
        const attempt =
          input.publishAttemptId === undefined
            ? publishAttempts
                .filter(
                  (row) =>
                    row.approval_id === input.approvalId &&
                    row.status === "succeeded",
                )
                .sort(
                  (left, right) =>
                    right.created_at.localeCompare(left.created_at) ||
                    right.id - left.id,
                )[0]
            : publishAttempts.find(
                (row) =>
                  row.id === input.publishAttemptId &&
                  row.status === "succeeded",
              );
        if (!attempt || attempt.approval_id !== input.approvalId)
          throw new Error(
            "Published approval needs a successful publish attempt",
          );
        const now = getNow();
        const metric: PostMetric = {
          id: nextPostMetricId,
          campaign_id: input.campaignId,
          approval_id: input.approvalId,
          publish_attempt_id: attempt.id,
          platform: "linkedin",
          measured_at: input.measuredAt.trim(),
          impressions: input.impressions,
          reactions: input.reactions,
          comments: input.comments,
          reposts: input.reposts,
          profile_visits: input.profileVisits,
          link_clicks: input.linkClicks,
          ctr: input.ctr ?? null,
          notes: input.notes.trim(),
          collection_source: "manual",
          raw_payload_json: "",
          created_at: now,
          updated_at: now,
        };
        postMetrics.push(metric);
        nextPostMetricId += 1;
        pushLearningEvent({
          campaign_id: input.campaignId,
          post_metric_id: metric.id,
          campaign_memory_id: null,
          event_type: "metric_recorded",
          summary: `Metric snapshot recorded for approval #${input.approvalId}`,
        });
        return { id: metric.id };
      });
    }

    function createCampaignMemoryCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          campaignId: number;
          postMetricId?: number;
          signal: MemorySignal;
          summary: string;
          evidence: string;
          confidence: number;
        }>(args);
        requireMutableMetricsCampaign(input.campaignId);
        if (input.postMetricId !== undefined) {
          const metric = postMetrics.find(
            (row) => row.id === input.postMetricId,
          );
          if (!metric) throw new Error("Post metric was not found");
          if (metric.campaign_id !== input.campaignId)
            throw new Error("Post metric does not belong to this campaign");
        }
        const now = getNow();
        const summary = input.summary.trim();
        const memory: CampaignMemory = {
          id: nextCampaignMemoryId,
          campaign_id: input.campaignId,
          post_metric_id: input.postMetricId ?? null,
          signal: input.signal,
          summary,
          evidence: input.evidence.trim(),
          confidence: input.confidence,
          status: "active",
          created_at: now,
          updated_at: now,
        };
        campaignMemory.push(memory);
        nextCampaignMemoryId += 1;
        pushLearningEvent({
          campaign_id: input.campaignId,
          post_metric_id: input.postMetricId ?? null,
          campaign_memory_id: memory.id,
          event_type: "memory_created",
          summary: `Campaign memory created: ${summary}`,
        });
        return { id: memory.id };
      });
    }

    function setCampaignMemoryStatusCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          id: number;
          status: CampaignMemoryStatus;
        }>(args);
        const memory = campaignMemory.find((row) => row.id === input.id);
        if (!memory) throw new Error("Campaign memory was not found");
        const campaign = campaigns.find((row) => row.id === memory.campaign_id);
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        memory.status = input.status;
        memory.updated_at = getNow();
        const archived = input.status === "archived";
        pushLearningEvent({
          campaign_id: memory.campaign_id,
          post_metric_id: null,
          campaign_memory_id: memory.id,
          event_type: archived ? "memory_archived" : "memory_restored",
          summary: `Campaign memory ${archived ? "archived" : "restored"}`,
        });
        return { id: memory.id };
      });
    }

    // Mirrors src-tauri/src/comment_audit.rs (itself a port of the old
    // renderer rules); findings are computed where they are stored.
    function mockAuditComment(body: string): Array<{
      rule_key: string;
      severity: CommentAuditSeverity;
      message: string;
    }> {
      const text = body.trim();
      const out: Array<{
        rule_key: string;
        severity: CommentAuditSeverity;
        message: string;
      }> = [];
      const add = (
        rule_key: string,
        severity: CommentAuditSeverity,
        message: string,
      ): void => {
        out.push({ rule_key, severity, message });
      };
      if (text.length === 0)
        add("required_text", "block", "Add a comment before review.");
      else add("required_text", "pass", "This comment has text to review.");
      if (text.length > 1250)
        add(
          "comment_length",
          "block",
          "Keep comments under Linkgo's 1,250 character cap.",
        );
      else
        add(
          "comment_length",
          "pass",
          "This comment stays under Linkgo's 1,250 character cap.",
        );
      if (/https?:\/\/|www\./iu.test(text))
        add("external_link", "block", "Remove external links before review.");
      else add("external_link", "pass", "No external link was found.");
      if ((text.match(/#[\p{L}\p{N}_-]+/gu)?.length ?? 0) > 2)
        add("hashtag_limit", "block", "Use two or fewer hashtags.");
      else
        add(
          "hashtag_limit",
          "pass",
          "This comment uses two or fewer hashtags.",
        );
      if ((text.match(/@[\p{L}\p{N}_.-]+/gu)?.length ?? 0) > 1)
        add(
          "mention_limit",
          "warning",
          "Use at most one mention unless the reviewer confirms it is intentional.",
        );
      if (
        text.length < 40 ||
        /\b(great post|thanks for sharing|love this|insightful post|nice post)\b/iu.test(
          text,
        )
      )
        add(
          "generic_reply",
          "warning",
          "Make the reply more specific than a generic reaction.",
        );
      if (
        !(
          /\d/u.test(text) ||
          /[“"][^”"]+[”"]/u.test(text) ||
          /\b(i|we|my|our|i've|we've|i’m|we’re|i'd|we'd)\b/iu.test(text)
        )
      )
        add(
          "specificity",
          "warning",
          "Add a number, quoted phrase, or first-person signal.",
        );
      const rank = { block: 0, warning: 1, pass: 2 } as const;
      return out.sort(
        (left, right) =>
          rank[left.severity] - rank[right.severity] ||
          left.rule_key.localeCompare(right.rule_key),
      );
    }

    function writeMockCommentAudits(variantId: number, body: string): void {
      restoreRows(
        commentAudits,
        commentAudits.filter((row) => row.comment_variant_id !== variantId),
      );
      for (const finding of mockAuditComment(body)) {
        commentAudits.push({
          id: nextCommentAuditId,
          comment_variant_id: variantId,
          ...finding,
          created_at: getNow(),
        });
        nextCommentAuditId += 1;
      }
    }

    function mutableMockCommentThread(threadId: number): CommentThread {
      const thread = commentThreads.find((row) => row.id === threadId);
      if (!thread) throw new Error("Comment thread was not found");
      const campaign = campaigns.find((row) => row.id === thread.campaign_id);
      if (campaign?.status === "archived")
        throw new Error("Campaign is archived");
      return thread;
    }

    function mockThreadForVariant(variantId: number): {
      thread: CommentThread;
      variant: CommentVariant;
    } {
      const variant = commentVariants.find((row) => row.id === variantId);
      if (!variant) throw new Error("Comment variant was not found");
      return {
        thread: mutableMockCommentThread(variant.comment_thread_id),
        variant,
      };
    }

    function mockSelectedVariantReady(threadId: number): CommentVariant {
      const selected = commentVariants
        .filter(
          (row) =>
            row.comment_thread_id === threadId && row.status === "selected",
        )
        .sort((left, right) => left.id - right.id);
      if (selected.length > 1)
        throw new Error("Choose exactly one selected comment variant");
      const variant = selected[0];
      if (!variant) throw new Error("Choose one comment variant before review");
      if (
        commentAudits.some(
          (row) =>
            row.comment_variant_id === variant.id && row.severity === "block",
        )
      )
        throw new Error("Blocked comment variants cannot be reviewed");
      return variant;
    }

    function requestMockCommentChanges(thread: CommentThread): void {
      if (thread.status === "needs_review" || thread.status === "approved")
        thread.status = "changes_requested";
      thread.updated_at = getNow();
    }

    const MOCK_TERMINAL_COMMENT_STATUSES = ["posted", "rejected", "cancelled"];

    function createCommentThreadCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          candidateId: number;
          operatorNotes?: string;
          variants: Array<{ body: string }>;
        }>(args);
        const candidate = candidatePosts.find(
          (row) => row.id === input.candidateId,
        );
        if (!candidate) throw new Error("Candidate was not found");
        const campaign = campaigns.find(
          (row) => row.id === candidate.campaign_id,
        );
        if (campaign?.status === "archived")
          throw new Error("Campaign is archived");
        if (!["shortlisted", "drafted"].includes(candidate.status))
          throw new Error(
            "Only shortlisted or drafted candidates can become comments",
          );
        if (
          commentThreads.some(
            (row) => row.candidate_post_id === input.candidateId,
          )
        )
          throw new Error("Candidate already has a comment thread");
        const now = getNow();
        const thread: CommentThread = {
          id: nextCommentThreadId,
          campaign_id: candidate.campaign_id,
          candidate_post_id: candidate.id,
          status: "drafting",
          operator_notes: String(input.operatorNotes ?? "").trim(),
          reviewer_notes: "",
          approved_at: null,
          rejected_at: null,
          posted_at: null,
          created_at: now,
          updated_at: now,
        };
        commentThreads.push(thread);
        nextCommentThreadId += 1;
        input.variants.forEach((variantInput, index) => {
          const body = variantInput.body.trim();
          const variant: CommentVariant = {
            id: nextCommentVariantId,
            comment_thread_id: thread.id,
            variant_number: index + 1,
            body,
            status: "draft",
            created_at: now,
            updated_at: now,
          };
          commentVariants.push(variant);
          nextCommentVariantId += 1;
          writeMockCommentAudits(variant.id, body);
        });
        return { id: thread.id };
      });
    }

    function updateCommentThreadCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          id: number;
          operatorNotes?: string;
          reviewerNotes?: string;
        }>(args);
        const thread = mutableMockCommentThread(input.id);
        if (
          input.operatorNotes === undefined &&
          input.reviewerNotes === undefined
        )
          return { id: thread.id };
        if (input.operatorNotes !== undefined)
          thread.operator_notes = input.operatorNotes.trim();
        if (input.reviewerNotes !== undefined)
          thread.reviewer_notes = input.reviewerNotes.trim();
        thread.updated_at = getNow();
        return { id: thread.id };
      });
    }

    function updateCommentVariantCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{ id: number; body?: string }>(args);
        if (input.body === undefined) return { id: input.id };
        const { thread, variant } = mockThreadForVariant(input.id);
        if (MOCK_TERMINAL_COMMENT_STATUSES.includes(thread.status))
          throw new Error(
            "Posted, rejected, and cancelled comments cannot be edited",
          );
        variant.body = input.body.trim();
        variant.updated_at = getNow();
        writeMockCommentAudits(variant.id, variant.body);
        requestMockCommentChanges(thread);
        return { id: variant.id };
      });
    }

    function setCommentVariantStatusCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          id: number;
          status: CommentVariantStatus;
        }>(args);
        const { thread, variant } = mockThreadForVariant(input.id);
        if (MOCK_TERMINAL_COMMENT_STATUSES.includes(thread.status))
          throw new Error(
            "Posted, rejected, and cancelled comments cannot change variants",
          );
        const now = getNow();
        if (input.status === "selected") {
          if (
            commentAudits.some(
              (row) =>
                row.comment_variant_id === variant.id &&
                row.severity === "block",
            )
          )
            throw new Error("Blocked comment variants cannot be selected");
          for (const row of commentVariants) {
            if (row.comment_thread_id === thread.id && row.id !== variant.id) {
              row.status = "draft";
              row.updated_at = now;
            }
          }
        }
        variant.status = input.status;
        variant.updated_at = now;
        requestMockCommentChanges(thread);
        return { id: variant.id };
      });
    }

    function setCommentThreadStatusCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          id: number;
          status: CommentThreadStatus;
          reviewerNotes?: string;
        }>(args);
        const thread = mutableMockCommentThread(input.id);
        if (input.status === "needs_review" || input.status === "approved")
          mockSelectedVariantReady(thread.id);
        if (input.status === "posted")
          throw new Error("Use record posted to move comments to posted");
        if (input.status === "approved" && thread.status !== "needs_review")
          throw new Error("Only comments needing review can be approved");
        if (
          input.status === "changes_requested" &&
          thread.status !== "needs_review"
        )
          throw new Error("Only comments needing review can request changes");
        if (MOCK_TERMINAL_COMMENT_STATUSES.includes(thread.status))
          throw new Error("Terminal comment threads cannot change status");
        const now = getNow();
        thread.status = input.status;
        if (input.reviewerNotes !== undefined)
          thread.reviewer_notes = input.reviewerNotes.trim();
        if (input.status === "approved") thread.approved_at = now;
        if (input.status === "rejected") thread.rejected_at = now;
        thread.updated_at = now;
        return { id: thread.id };
      });
    }

    function mockResolveLinkedInTargetUrn(candidate: string): string {
      const normalize = (value: string): string => {
        let decoded = value.trim();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
          } catch {
            break;
          }
        }
        const urn = /urn:li:(ugcPost|share|activity):([A-Za-z0-9_-]+)/u.exec(
          decoded,
        );
        if (urn) return `urn:li:${urn[1]}:${urn[2]}`;
        const activity = /activity[-:]([0-9]+)/iu.exec(decoded);
        return activity?.[1] ? `urn:li:activity:${activity[1]}` : "";
      };
      const trimmed = candidate.trim();
      if (!trimmed) return "";
      const direct = normalize(trimmed);
      if (direct) return direct;
      try {
        const url = new URL(trimmed);
        for (const part of [url.pathname, url.search, url.hash]) {
          const resolved = normalize(part);
          if (resolved) return resolved;
        }
      } catch {
        return "";
      }
      return "";
    }

    function mockEscapeLinkedInLittleText(text: string): string {
      return text.replace(/[|{}@[\]()<>#\\*_~]/gu, "\\$&");
    }

    /**
     * Publish gate: rejections commit (a blocked rate-limit event survives),
     * matching the native Settlement::Rejected path.
     */
    function assertCommentCanPublishCommand(args: unknown): Promise<unknown> {
      const input = nativeInput<{
        commentThreadId: number;
        commentary: string;
        targetUrn: string;
        idempotencyKey: string;
      }>(args);
      let rejection = "";
      const settled = runNativeMutation(() => {
        const thread = mutableMockCommentThread(input.commentThreadId);
        if (thread.status !== "approved")
          throw new Error("Only approved comments can publish via LinkedIn");
        const selected = mockSelectedVariantReady(thread.id);
        if (mockEscapeLinkedInLittleText(selected.body) !== input.commentary)
          throw new Error(
            "Commentary does not match the approved comment variant",
          );
        const candidate = candidatePosts.find(
          (row) => row.id === thread.candidate_post_id,
        );
        const target = targetPosts.find(
          (row) => row.id === candidate?.target_post_id,
        );
        const expectedUrn = mockResolveLinkedInTargetUrn(
          target?.platform_resource_urn || target?.url || "",
        );
        if (!expectedUrn)
          throw new Error(
            "LinkedIn target URN could not be resolved from the candidate URL",
          );
        if (expectedUrn !== input.targetUrn)
          throw new Error(
            "LinkedIn target URN does not match the comment target",
          );
        if (
          input.idempotencyKey !== `comment-thread:${thread.id}:linkedin:manual`
        )
          throw new Error(
            "Comment idempotency key does not match thread state",
          );
        if (
          commentAttempts.some(
            (row) =>
              row.comment_thread_id === thread.id && row.status === "succeeded",
          )
        )
          throw new Error(
            "Comment thread already has a successful posting attempt",
          );
        const campaign = campaigns.find((row) => row.id === thread.campaign_id);
        const today = getNow().slice(0, 10);
        const limit = campaign?.daily_comment_limit ?? 0;
        const currentCount = commentAttempts.filter((attempt) => {
          const attemptThread = commentThreads.find(
            (row) => row.id === attempt.comment_thread_id,
          );
          return (
            attemptThread?.campaign_id === thread.campaign_id &&
            attempt.status === "succeeded" &&
            attempt.created_at.slice(0, 10) === today
          );
        }).length;
        const block = (summary: string, error: string): void => {
          rateLimitEvents.push({
            id: nextRateLimitEventId++,
            campaign_id: thread.campaign_id,
            action: "comment",
            window_key: today,
            limit_value: limit,
            current_count: currentCount,
            decision: "blocked",
            summary,
            created_at: getNow(),
          });
          rejection = error;
        };
        if (safetySettings.global_kill_switch === 1) {
          const reason = safetySettings.kill_switch_reason;
          block(
            reason
              ? `Comment posting blocked by global kill switch: ${reason}`
              : "Comment posting blocked by global kill switch",
            reason
              ? `Global kill switch is enabled: ${reason}`
              : "Global kill switch is enabled",
          );
          return undefined;
        }
        if (currentCount >= limit) {
          const summary = `Daily comment limit reached for ${today}: ${currentCount}/${limit} used`;
          block(summary, summary);
        }
        return undefined;
      });
      return settled.then(() =>
        rejection ? Promise.reject(new Error(rejection)) : undefined,
      );
    }

    // Native candidate-queue commands replay the statements the native module
    // runs through the existing SQL emulator, so its cascades and fault hooks
    // (dedupe insert, workflow event, discovery status) keep applying.
    function mockSqlSelect<T>(query: string, values: unknown[]): T[] {
      return selectSql({ query, values }) as T[];
    }

    function mockSqlExecute(
      query: string,
      values: unknown[],
    ): { lastInsertId: number; rowsAffected: number } {
      return executeSql({ query, values });
    }

    function mockContentHash(content: string): string {
      const normalized = content.trim().replace(/\s+/gu, " ");
      let hash = 0x811c9dc5;
      for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    }

    function mockAssertCandidateCampaignCanMutate(campaignId: number): void {
      const campaign = campaigns.find((row) => row.id === campaignId);
      if (!campaign) throw new Error("Campaign was not found");
      if (campaign.status === "archived")
        throw new Error("Campaign is archived");
    }

    interface MockCandidateInput {
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

    // Mirrors src-tauri/src/js_url.rs (the renderer's former WHATWG helper).
    function mockNormalizeUrl(value: string, clearSearch: boolean): string {
      const trimmed = value.trim();
      if (!trimmed) return "";
      try {
        const url = new URL(trimmed);
        url.protocol = url.protocol.toLocaleLowerCase();
        url.hostname = url.hostname.toLocaleLowerCase();
        url.hash = "";
        if (clearSearch) url.search = "";
        if (url.pathname.length > 1)
          url.pathname = url.pathname.replace(/\/+$/u, "");
        return url.toString();
      } catch {
        return trimmed.toLocaleLowerCase();
      }
    }

    function createCandidateCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => ({
        id: mockInsertCandidate(nativeInput<MockCandidateInput>(args)),
      }));
    }

    // ---- Source imports: mirrors src-tauri/src/source_imports.rs and the
    // native candidate-policy evaluator (formerly renderer code). ----
    const mockActiveImports = new Map<number, number>();
    const MOCK_IMPORT_REASONS = {
      duplicate: "Duplicate URL or post text for this campaign.",
      storage:
        "Candidate could not be stored. Review the row and retry the import.",
      skipped:
        "Not processed because the import stopped after a local storage error.",
      batch: "Import stopped after a local storage error.",
      interruptedItem:
        "Not processed because the previous app session ended before the import finished.",
      interruptedBatch:
        "Import stopped because the previous app session ended before processing finished.",
    } as const;

    function mockPolicyFindings(input: MockCandidateInput): Array<{
      ruleKey: string;
      message: string;
    }> {
      const findings: Array<{ ruleKey: string; message: string }> = [];
      const add = (ruleKey: string, message: string): void => {
        findings.push({ ruleKey, message: message.slice(0, 300) });
      };
      const policy = candidateIntakePolicies.find(
        (row) => row.campaign_id === input.campaignId,
      );
      const maxAge = policy?.max_post_age_days ?? 30;
      let allowed = false;
      try {
        const url = new URL(input.url);
        const host = url.hostname.toLocaleLowerCase();
        allowed =
          url.protocol === "https:" &&
          (host === "linkedin.com" || host.endsWith(".linkedin.com"));
      } catch {
        allowed = false;
      }
      if (!allowed)
        add(
          "source",
          "Source must be an HTTPS linkedin.com URL or LinkedIn subdomain.",
        );
      const trimmed = input.postedAt?.trim() ?? "";
      const parts =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/u.exec(
          trimmed,
        );
      // Reject calendar dates `Date` would silently roll over (e.g. Feb 30),
      // as the native evaluator does.
      const calendarOk = ((): boolean => {
        if (parts === null) return false;
        const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] =
          parts.slice(1, 7).map((part) => Number(part ?? "0"));
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [
          31,
          leap ? 29 : 28,
          31,
          30,
          31,
          30,
          31,
          31,
          30,
          31,
          30,
          31,
        ][month - 1];
        return (
          days !== undefined &&
          day >= 1 &&
          day <= days &&
          hour <= 23 &&
          minute <= 59 &&
          second <= 59
        );
      })();
      const posted = calendarOk ? Date.parse(trimmed) : Number.NaN;
      if (Number.isNaN(posted)) {
        add(
          "age",
          "Post timestamp must be an absolute ISO-8601 value with a timezone.",
        );
      } else {
        const ageMs = Date.now() - posted;
        if (ageMs < -5 * 60 * 1000)
          add("age", "Post timestamp is materially in the future.");
        else if (ageMs > maxAge * 86_400_000)
          add("age", `Post is older than the ${maxAge}-day campaign limit.`);
      }
      const text = [input.content, input.sourceKeyword ?? ""]
        .join("\n")
        .normalize("NFKC")
        .toLocaleLowerCase();
      const topic = candidatePolicyBannedTopics
        .filter((row) => row.campaign_id === input.campaignId)
        .sort((left, right) => left.id - right.id)
        .find((row) => {
          const normalized = row.topic
            .normalize("NFKC")
            .trim()
            .replace(/\s+/gu, " ")
            .toLocaleLowerCase();
          if (!normalized) return false;
          const phrase = normalized
            .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
            .replace(/\s+/gu, "\\s+");
          return new RegExp(
            `(?:^|[^\\p{L}\\p{N}])${phrase}(?=$|[^\\p{L}\\p{N}])`,
            "u",
          ).test(text);
        });
      if (topic)
        add("banned_topic", `Post matches banned topic: ${topic.topic}.`);
      const normalizedUrl = mockNormalizeUrl(input.url, false);
      const profile = mockNormalizeUrl(input.authorProfileUrl ?? "", true);
      const urn = (input.platformResourceUrn ?? "").trim();
      const contacts = mockSqlSelect<{
        normalized_url: string;
        platform_resource_urn: string;
        author_profile_url: string;
      }>(
        `SELECT tp.normalized_url, tp.platform_resource_urn, tp.author_profile_url
     FROM comment_attempts ca
     INNER JOIN comment_threads ct ON ct.id = ca.comment_thread_id
     INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
     INNER JOIN target_posts tp ON tp.id = cp.target_post_id
     WHERE ca.status = 'succeeded'
       AND (
         tp.normalized_url = $1
         OR ($2 <> '' AND tp.platform_resource_urn = $2)
         OR ($3 <> '' AND TRIM(tp.author_profile_url) <> '')
       )`,
        [normalizedUrl, urn, profile],
      );
      if (
        contacts.some(
          (contact) =>
            contact.normalized_url === normalizedUrl ||
            (urn !== "" && contact.platform_resource_urn === urn) ||
            (profile !== "" &&
              mockNormalizeUrl(contact.author_profile_url, true) === profile),
        )
      )
        add(
          "already_contacted",
          "A successful Linkgo comment already contacted this target or author profile.",
        );
      return findings;
    }

    function mockUpdateImportItem(
      batchId: number,
      rowNumber: number,
      status: "accepted" | "duplicate" | "rejected",
      candidateId: number | null,
      reason: string,
      ruleKey = "",
    ): void {
      const result = mockSqlExecute(
        `UPDATE source_import_items
      SET status = $1,
        candidate_post_id = $2,
        reason = $3,
        policy_rule_key = $4,
        updated_at = datetime('now')
      WHERE source_import_batch_id = $5
        AND row_number = $6`,
        [
          status,
          candidateId,
          reason.slice(0, 2000),
          ruleKey,
          batchId,
          rowNumber,
        ],
      );
      if (result.rowsAffected !== 1)
        throw new Error("Source import item outcome was not stored");
    }

    interface MockImportResult {
      batchId: number;
      status: string;
      totalCount: number;
      acceptedCount: number;
      duplicateCount: number;
      rejectedCount: number;
      errorMessage: string;
    }

    function mockUpdateImportBatch(result: MockImportResult): void {
      const updated = mockSqlExecute(
        `UPDATE source_import_batches
      SET status = $1,
        accepted_count = $2,
        duplicate_count = $3,
        rejected_count = $4,
        error_message = $5,
        updated_at = datetime('now')
      WHERE id = $6`,
        [
          result.status,
          result.acceptedCount,
          result.duplicateCount,
          result.rejectedCount,
          result.errorMessage,
          result.batchId,
        ],
      );
      if (updated.rowsAffected !== 1)
        throw new Error("Source import batch outcome was not stored");
    }

    /** Runs `work` atomically against every mock table. */
    function mockAtomic<T>(work: () => T): T {
      const snapshot = createTransactionSnapshot();
      try {
        return work();
      } catch (error) {
        restoreTransactionSnapshot(snapshot);
        throw error;
      }
    }

    function mockTerminalizeBatch(
      batchId: number,
      totalCount: number,
      failedRow: number | null,
      failedReason: string,
      remainingReason: string,
      batchError: string,
    ): MockImportResult {
      try {
        return mockAtomic(() => {
          const items = sourceImportItems
            .filter((item) => item.source_import_batch_id === batchId)
            .sort((left, right) => left.row_number - right.row_number);
          const counts = { accepted: 0, duplicate: 0, rejected: 0 };
          for (const item of items) {
            if (item.status === "pending") {
              mockUpdateImportItem(
                batchId,
                item.row_number,
                "rejected",
                null,
                failedRow === null || item.row_number === failedRow
                  ? failedReason
                  : remainingReason,
              );
            }
            if (item.status === "accepted") counts.accepted += 1;
            if (item.status === "duplicate") counts.duplicate += 1;
            if (item.status === "rejected") counts.rejected += 1;
          }
          const result: MockImportResult = {
            batchId,
            status: "failed",
            totalCount,
            acceptedCount: counts.accepted,
            duplicateCount: counts.duplicate,
            rejectedCount: counts.rejected,
            errorMessage: batchError,
          };
          mockUpdateImportBatch(result);
          return result;
        });
      } catch {
        throw new Error(
          "Source import failed and its outcome could not be recorded",
        );
      }
    }

    function writeSourceImportBatchCommand(args: unknown): Promise<unknown> {
      const input = nativeInput<{
        campaignId: number;
        connectorKey: string;
        rows: Array<{
          rowNumber: number;
          inputJson: string;
          value: Omit<MockCandidateInput, "campaignId"> | null;
          validationError: string;
        }>;
      }>(args);
      try {
        mockAssertCandidateCampaignCanMutate(input.campaignId);
      } catch (error) {
        return Promise.reject(error);
      }
      mockActiveImports.set(
        input.campaignId,
        (mockActiveImports.get(input.campaignId) ?? 0) + 1,
      );
      let batchId: number | null = null;
      let currentRow: number | null = null;
      try {
        try {
          batchId = mockAtomic(() => {
            const id = mockSqlExecute(
              `INSERT INTO source_import_batches (
        campaign_id,
        source_type,
        status,
        total_count,
        accepted_count,
        duplicate_count,
        rejected_count,
        error_message,
        updated_at
      ) VALUES ($1, $2, 'processing', $3, 0, 0, 0, '', datetime('now'))`,
              [input.campaignId, input.connectorKey, input.rows.length],
            ).lastInsertId;
            for (const row of input.rows)
              mockSqlExecute(
                `INSERT INTO source_import_items (
          source_import_batch_id,
          row_number,
          status,
          input_json,
          candidate_post_id,
          reason,
          policy_rule_key,
          updated_at
        ) VALUES ($1, $2, 'pending', $3, NULL, '', '', datetime('now'))`,
                [id, row.rowNumber, row.inputJson],
              );
            return id;
          });
        } catch {
          throw new Error("Source import could not be started");
        }
        const started = batchId;
        const counts = { accepted: 0, duplicate: 0, rejected: 0 };
        for (const row of input.rows) {
          currentRow = row.rowNumber;
          const value = row.value;
          if (value === null) {
            mockUpdateImportItem(
              started,
              row.rowNumber,
              "rejected",
              null,
              row.validationError,
            );
            counts.rejected += 1;
            continue;
          }
          const candidate = { ...value, campaignId: input.campaignId };
          const findings = mockPolicyFindings(candidate);
          const primary = findings[0];
          if (primary) {
            mockUpdateImportItem(
              started,
              row.rowNumber,
              "rejected",
              null,
              findings.map((finding) => finding.message).join(" "),
              primary.ruleKey,
            );
            counts.rejected += 1;
            continue;
          }
          try {
            mockAtomic(() => {
              const candidateId = mockInsertCandidate(candidate);
              mockUpdateImportItem(
                started,
                row.rowNumber,
                "accepted",
                candidateId,
                `Candidate ${candidateId} created.`,
              );
            });
            counts.accepted += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message !== "Candidate already exists for this campaign")
              throw error;
            mockUpdateImportItem(
              started,
              row.rowNumber,
              "duplicate",
              null,
              MOCK_IMPORT_REASONS.duplicate,
            );
            counts.duplicate += 1;
          }
        }
        currentRow = null;
        const result: MockImportResult = {
          batchId: started,
          status:
            counts.accepted === input.rows.length
              ? "completed"
              : "completed_with_errors",
          totalCount: input.rows.length,
          acceptedCount: counts.accepted,
          duplicateCount: counts.duplicate,
          rejectedCount: counts.rejected,
          errorMessage: "",
        };
        mockUpdateImportBatch(result);
        persistReloadSnapshot();
        return Promise.resolve(result);
      } catch (error) {
        if (batchId === null)
          return Promise.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        try {
          const failed = mockTerminalizeBatch(
            batchId,
            input.rows.length,
            currentRow,
            MOCK_IMPORT_REASONS.storage,
            MOCK_IMPORT_REASONS.skipped,
            MOCK_IMPORT_REASONS.batch,
          );
          persistReloadSnapshot();
          return Promise.resolve(failed);
        } catch (terminalError) {
          return Promise.reject(
            terminalError instanceof Error
              ? terminalError
              : new Error(String(terminalError)),
          );
        }
      } finally {
        const remaining = (mockActiveImports.get(input.campaignId) ?? 1) - 1;
        if (remaining <= 0) mockActiveImports.delete(input.campaignId);
        else mockActiveImports.set(input.campaignId, remaining);
      }
    }

    function recoverSourceImportsCommand(args: unknown): Promise<unknown> {
      const { campaignId } = nativeInput<{ campaignId: number }>(args);
      if (mockActiveImports.has(campaignId))
        return Promise.resolve({ recovered: 0 });
      try {
        const interrupted = sourceImportBatches
          .filter(
            (batch) =>
              batch.campaign_id === campaignId && batch.status === "processing",
          )
          .sort((left, right) => left.id - right.id);
        for (const batch of interrupted)
          mockTerminalizeBatch(
            batch.id,
            batch.total_count,
            null,
            MOCK_IMPORT_REASONS.interruptedItem,
            MOCK_IMPORT_REASONS.interruptedItem,
            MOCK_IMPORT_REASONS.interruptedBatch,
          );
        if (interrupted.length > 0) persistReloadSnapshot();
        return Promise.resolve({ recovered: interrupted.length });
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    // ---- Workflows: generated from the pre-migration renderer workflow code
    // (sync over the SQL emulator) so the browser suite exercises the same
    // statements and fault hooks the native commands replaced. ----
    type MockWfStepStatus =
      | "pending"
      | "running"
      | "waiting_approval"
      | "blocked"
      | "completed"
      | "failed"
      | "skipped";
    type CampaignStatus = string;
    type WorkflowArtifactType = "agent_run" | "candidate_post" | "draft";
    const TERMINAL_RUN_STATUSES: WorkflowRunStatus[] = [
      "completed",
      "cancelled",
    ];
    const CONTENT_PIPELINE_STEPS: ReadonlyArray<{
      step_key: WorkflowStepKey;
      title: string;
      description: string;
      sort_order: number;
    }> = [
      {
        step_key: "research",
        title: "Research",
        description: "Research source posts and campaign context.",
        sort_order: 1,
      },
      {
        step_key: "score",
        title: "Score relevance",
        description: "Dedupe and score candidate relevance.",
        sort_order: 2,
      },
      {
        step_key: "draft",
        title: "Draft variants",
        description: "Create draft variants.",
        sort_order: 3,
      },
      {
        step_key: "audit",
        title: "Audit drafts",
        description: "Run deterministic/AI audit checks.",
        sort_order: 4,
      },
      {
        step_key: "approve",
        title: "Approve",
        description: "Wait for human review.",
        sort_order: 5,
      },
      {
        step_key: "schedule",
        title: "Schedule",
        description: "Schedule approved content.",
        sort_order: 6,
      },
      {
        step_key: "measure",
        title: "Measure",
        description: "Record metrics and learning.",
        sort_order: 7,
      },
    ];
    interface WorkflowStepValidationRow extends WorkflowStep {
      run_status: WorkflowRunStatus;
      campaign_id: number;
      campaign_status: CampaignStatus;
      autopilot_plan_id: number | null;
    }
    interface WorkflowRunValidationRow {
      id: number;
      campaign_id: number;
      status: WorkflowRunStatus;
      current_step_key: string;
      started_at: string | null;
      campaign_status: CampaignStatus;
      autopilot_plan_id: number | null;
    }
    interface CampaignStatusRow {
      id: number;
      status: CampaignStatus;
    }
    interface WorkflowArtifactOwnershipRow {
      [key: string]: unknown;
    }
    interface WorkflowAgentRunLinkRow {
      workflow_run_id: number | null;
      workflow_step_id: number | null;
    }
    interface WorkflowLinkedAgentRow {
      id: number;
      status: AgentRunStatus;
      output_summary: string;
      error_message: string;
    }
    interface ReconcileWorkflowAgentRunInput {
      agentRunId: number;
      status: AgentRunStatus;
      outputSummary: string;
      errorMessage: string;
    }
    type CreateWorkflowRunInput = {
      campaignId: number;
      title: string;
      contextSummary: string;
    };
    type StartWorkflowRunInput = { id: number };
    type CancelWorkflowRunInput = { id: number };
    type AddWorkflowNoteInput = { workflowRunId: number; note: string };
    type SetWorkflowStepStatusInput = {
      stepId: number;
      status: MockWfStepStatus;
      outputSummary: string;
      errorMessage: string;
    };
    type CreateWorkflowArtifactInput = {
      workflowRunId: number;
      workflowStepId?: number;
      artifactType: WorkflowArtifactType;
      artifactId: number;
      summary: string;
    };
    const mockWf_FINISHED_STEP_STATUSES: WorkflowStepStatus[] = [
      "completed",
      "skipped",
    ];

    const mockWf_PLANNER_DRAFT_SAVE_ONLY_MESSAGE =
      "Planner-linked draft steps are save-only. Open Drafts, generate variants, and save a generated draft to continue to audit.";

    const mockWf_STEP_TRANSITIONS: Record<
      WorkflowStepStatus,
      WorkflowStepStatus[]
    > = {
      pending: ["running", "skipped"],
      running: [
        "completed",
        "waiting_approval",
        "blocked",
        "failed",
        "skipped",
      ],
      waiting_approval: ["completed", "blocked", "failed", "running"],
      blocked: ["running", "failed", "skipped"],
      failed: ["running", "blocked", "skipped"],
      completed: ["running"],
      skipped: ["running"],
    };

    function mockWf_assertStepTransition(
      currentStatus: WorkflowStepStatus,
      nextStatus: WorkflowStepStatus,
    ): void {
      if (!mockWf_STEP_TRANSITIONS[currentStatus].includes(nextStatus)) {
        throw new Error("Unsupported workflow step transition");
      }
    }

    function mockWf_getStepEventType(
      currentStatus: WorkflowStepStatus,
      nextStatus: WorkflowStepStatus,
    ): WorkflowEventType {
      if (nextStatus === "running") {
        return currentStatus === "pending" ? "step_started" : "step_resumed";
      }
      if (nextStatus === "waiting_approval") return "step_waiting_approval";
      if (nextStatus === "blocked") return "step_blocked";
      if (nextStatus === "completed") return "step_completed";
      if (nextStatus === "failed") return "step_failed";
      if (nextStatus === "skipped") return "step_skipped";
      return "note_added";
    }

    function mockWf_getStepEventSummary(
      step: WorkflowStep,
      nextStatus: WorkflowStepStatus,
    ): string {
      if (nextStatus === "running") {
        return step.status === "pending"
          ? `${step.title} started`
          : `${step.title} resumed`;
      }
      if (nextStatus === "waiting_approval") {
        return `${step.title} waiting for approval`;
      }
      if (nextStatus === "blocked") return `${step.title} blocked`;
      if (nextStatus === "completed") return `${step.title} completed`;
      if (nextStatus === "failed") return `${step.title} failed`;
      if (nextStatus === "skipped") return `${step.title} skipped`;
      return `${step.title} updated`;
    }

    function mockWf_getCurrentStepKey(steps: WorkflowStep[]): WorkflowStepKey {
      return (
        steps.find(
          (step) => !mockWf_FINISHED_STEP_STATUSES.includes(step.status),
        )?.step_key ?? "measure"
      );
    }

    function mockWf_getRunStatusFromSteps(
      steps: WorkflowStep[],
    ): WorkflowRunStatus {
      const currentStep = steps.find(
        (step) => !mockWf_FINISHED_STEP_STATUSES.includes(step.status),
      );
      if (currentStep?.status === "waiting_approval") return "waiting_approval";
      if (currentStep?.status === "blocked") return "blocked";
      if (currentStep?.status === "failed") return "failed";
      if (currentStep === undefined) return "completed";
      return "running";
    }

    function mockWf_loadWorkflowSteps(workflowRunId: number): WorkflowStep[] {
      return mockSqlSelect<WorkflowStep>(
        `SELECT * FROM workflow_steps
    WHERE workflow_run_id = $1
    ORDER BY sort_order ASC`,
        [workflowRunId],
      );
    }

    function mockWf_insertWorkflowEvent(
      workflowRunId: number,
      workflowStepId: number | null,
      eventType: WorkflowEventType,
      summary: string,
    ): void {
      mockSqlExecute(
        `INSERT INTO workflow_events (
      workflow_run_id,
      workflow_step_id,
      event_type,
      summary
    ) VALUES ($1, $2, $3, $4)`,
        [workflowRunId, workflowStepId, eventType, summary],
      );
    }

    function mockWf_getWorkflowRunValidation(
      id: number,
    ): WorkflowRunValidationRow {
      const rows = mockSqlSelect<WorkflowRunValidationRow>(
        `SELECT
      wr.*,
      c.status AS campaign_status,
      ap.id AS autopilot_plan_id
    FROM workflow_runs wr
    INNER JOIN campaigns c ON c.id = wr.campaign_id
    LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
    WHERE wr.id = $1
    LIMIT 1`,
        [id],
      );
      const run = rows[0];
      if (run === undefined) throw new Error("Workflow run was not found");
      return run;
    }

    function mockWf_updateRunFromSteps(
      workflowRunId: number,
      previousRunStatus: WorkflowRunStatus,
    ): void {
      const steps = mockWf_loadWorkflowSteps(workflowRunId);
      const nextStatus = mockWf_getRunStatusFromSteps(steps);
      const currentStepKey = mockWf_getCurrentStepKey(steps);
      mockSqlExecute(
        `UPDATE workflow_runs
    SET status = $1,
      current_step_key = $2,
      started_at = CASE WHEN $1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
      completed_at = CASE WHEN $1 = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
      updated_at = datetime('now')
    WHERE id = $3`,
        [nextStatus, currentStepKey, workflowRunId],
      );
      if (nextStatus === "completed" && previousRunStatus !== "completed") {
        mockWf_insertWorkflowEvent(
          workflowRunId,
          null,
          "run_completed",
          "Workflow run completed",
        );
      }
    }

    function mockWf_syncPlannerScoringBacklogInTransaction(
      workflowRunId: number,
      scoreStepStatus: WorkflowStepStatus,
    ): void {
      const backlogStatus =
        scoreStepStatus === "pending"
          ? "pending"
          : scoreStepStatus === "running" ||
              scoreStepStatus === "waiting_approval"
            ? "in_progress"
            : scoreStepStatus === "completed"
              ? "completed"
              : scoreStepStatus === "skipped"
                ? "cancelled"
                : "blocked";
      mockSqlExecute(
        `UPDATE campaign_backlog_items
      SET status = $1,
        completed_at = CASE
          WHEN $1 = 'completed' THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          ELSE NULL
        END,
        cancelled_at = CASE
          WHEN $1 = 'cancelled' THEN COALESCE(cancelled_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          ELSE NULL
        END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = (
        SELECT ap.campaign_backlog_item_id
        FROM autopilot_plans ap
        INNER JOIN workflow_steps ws
          ON ws.workflow_run_id = ap.workflow_run_id
         AND ws.step_key = 'score'
        WHERE ap.workflow_run_id = $2
          AND ap.status = 'planned'
          AND ws.status = $3
        LIMIT 1
      )
        AND owner_type = 'linkgo'
        AND work_type = 'scoring'
        AND recurrence = 'none'
        AND status NOT IN ('completed', 'cancelled')`,
        [backlogStatus, workflowRunId, scoreStepStatus],
      );
    }

    function mockWf_startNextPendingWorkflowStep(step: WorkflowStep): void {
      const steps = mockWf_loadWorkflowSteps(step.workflow_run_id);
      const nextStep = steps.find(
        (candidate) =>
          candidate.sort_order === step.sort_order + 1 &&
          candidate.status === "pending",
      );
      if (nextStep === undefined) return;

      mockWf_assertStepTransition(nextStep.status, "running");
      mockSqlExecute(
        `UPDATE workflow_steps
    SET status = 'running',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
        [nextStep.id],
      );
      mockWf_insertWorkflowEvent(
        step.workflow_run_id,
        nextStep.id,
        "step_started",
        `${nextStep.title} started`,
      );
    }

    function mockWf_getWorkflowProjectionFromAgentStatus(
      status: AgentRunStatus,
    ): {
      stepStatus: WorkflowStepStatus;
      executionStatus:
        | "running"
        | "completed"
        | "waiting_approval"
        | "failed"
        | "blocked"
        | "cancelled";
    } {
      if (status === "completed") {
        return { stepStatus: "completed", executionStatus: "completed" };
      }
      if (status === "waiting_approval") {
        return {
          stepStatus: "waiting_approval",
          executionStatus: "waiting_approval",
        };
      }
      if (status === "failed") {
        return { stepStatus: "failed", executionStatus: "failed" };
      }
      if (status === "cancelled") {
        return { stepStatus: "blocked", executionStatus: "cancelled" };
      }
      return { stepStatus: "running", executionStatus: "running" };
    }

    function mockWf_reconcileWorkflowAgentRunInTransaction(
      input: ReconcileWorkflowAgentRunInput,
    ): boolean {
      const linkRows = mockSqlSelect<WorkflowAgentRunLinkRow>(
        `SELECT workflow_run_id, workflow_step_id
    FROM agent_runs
    WHERE id = $1
    LIMIT 1`,
        [input.agentRunId],
      );
      const link = linkRows[0];
      if (
        link?.workflow_run_id === null ||
        link?.workflow_run_id === undefined ||
        link.workflow_step_id === null
      ) {
        return false;
      }

      const stepRows = mockSqlSelect<WorkflowStepValidationRow>(
        `SELECT
      ws.*,
      wr.status AS run_status,
      wr.campaign_id,
      c.status AS campaign_status,
      ap.id AS autopilot_plan_id
    FROM workflow_steps ws
    INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
    INNER JOIN campaigns c ON c.id = wr.campaign_id
    LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
    WHERE ws.id = $1
    LIMIT 1`,
        [link.workflow_step_id],
      );
      const step = stepRows[0];
      if (
        step === undefined ||
        step.workflow_run_id !== link.workflow_run_id ||
        step.run_status === "cancelled"
      ) {
        return false;
      }

      // Planner draft audits are settled atomically by their native complete/fail
      // commands after the generic agent runtime has persisted provider output.
      if (step.step_key === "audit" && step.autopilot_plan_id !== null) {
        return false;
      }

      const projection = mockWf_getWorkflowProjectionFromAgentStatus(
        input.status,
      );
      mockSqlExecute(
        `UPDATE workflow_step_executions
    SET status = $1,
      error_summary = $2,
      completed_at = CASE
        WHEN $1 IN ('completed', 'failed', 'blocked', 'cancelled') THEN COALESCE(completed_at, datetime('now'))
        ELSE NULL
      END,
      updated_at = datetime('now')
    WHERE agent_run_id = $3
      AND workflow_step_id = $4`,
        [
          projection.executionStatus,
          input.errorMessage,
          input.agentRunId,
          step.id,
        ],
      );

      if (step.status !== projection.stepStatus) {
        mockWf_assertStepTransition(step.status, projection.stepStatus);
      }
      mockSqlExecute(
        `UPDATE workflow_steps
    SET status = $1,
      output_summary = $2,
      error_message = $3,
      started_at = CASE WHEN $1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
      completed_at = CASE
        WHEN $1 IN ('completed', 'skipped') THEN COALESCE(completed_at, datetime('now'))
        WHEN $1 IN ('running', 'blocked', 'failed', 'waiting_approval') THEN NULL
        ELSE completed_at
      END,
      updated_at = datetime('now')
    WHERE id = $4`,
        [
          projection.stepStatus,
          input.outputSummary,
          input.errorMessage,
          step.id,
        ],
      );

      if (step.status !== projection.stepStatus) {
        mockWf_insertWorkflowEvent(
          step.workflow_run_id,
          step.id,
          mockWf_getStepEventType(step.status, projection.stepStatus),
          mockWf_getStepEventSummary(step, projection.stepStatus),
        );
        if (projection.stepStatus === "completed") {
          mockWf_startNextPendingWorkflowStep(step);
        }
      }

      mockWf_updateRunFromSteps(step.workflow_run_id, step.run_status);
      if (step.step_key === "score") {
        mockWf_syncPlannerScoringBacklogInTransaction(
          step.workflow_run_id,
          projection.stepStatus,
        );
      }
      return true;
    }

    function mockWf_createWorkflowRun(input: CreateWorkflowRunInput): number {
      const parsed = input;
      try {
        const campaignRows = mockSqlSelect<CampaignStatusRow>(
          `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
          [parsed.campaignId],
        );
        const campaign = campaignRows[0];
        if (campaign === undefined) throw new Error("Campaign was not found");
        if (campaign.status === "archived")
          throw new Error("Campaign is archived");

        const result = mockSqlExecute(
          `INSERT INTO workflow_runs (
        campaign_id,
        workflow_type,
        title,
        status,
        current_step_key,
        context_summary,
        updated_at
      ) VALUES ($1, 'content_pipeline', $2, 'queued', 'research', $3, datetime('now'))`,
          [parsed.campaignId, parsed.title, parsed.contextSummary],
        );

        for (const step of CONTENT_PIPELINE_STEPS) {
          mockSqlExecute(
            `INSERT INTO workflow_steps (
          workflow_run_id,
          step_key,
          title,
          description,
          sort_order,
          status,
          output_summary,
          error_message,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', '', '', datetime('now'))`,
            [
              result.lastInsertId,
              step.step_key,
              step.title,
              step.description,
              step.sort_order,
            ],
          );
        }

        mockWf_insertWorkflowEvent(
          result.lastInsertId,
          null,
          "run_created",
          `Run created: ${parsed.title}`,
        );
        return result.lastInsertId;
      } catch (error) {
        throw error;
      }
    }

    function mockWf_startWorkflowRun(input: StartWorkflowRunInput): void {
      const parsed = input;
      try {
        const run = mockWf_getWorkflowRunValidation(parsed.id);
        if (run.campaign_status === "archived")
          throw new Error("Campaign is archived");
        if (TERMINAL_RUN_STATUSES.includes(run.status)) {
          throw new Error("Terminal workflow runs cannot be started");
        }

        mockSqlExecute(
          `UPDATE workflow_runs
      SET status = 'running',
        started_at = COALESCE(started_at, datetime('now')),
        updated_at = datetime('now')
      WHERE id = $1`,
          [parsed.id],
        );

        mockWf_insertWorkflowEvent(
          parsed.id,
          null,
          "run_started",
          run.started_at === null
            ? "Workflow run started"
            : "Workflow run resumed",
        );

        const steps = mockWf_loadWorkflowSteps(parsed.id);
        const resumableStep =
          steps.find(
            (step) =>
              step.step_key === run.current_step_key &&
              ["blocked", "failed"].includes(step.status),
          ) ??
          steps.find((step) => ["blocked", "failed"].includes(step.status));

        if (resumableStep !== undefined) {
          mockSqlExecute(
            `UPDATE workflow_steps
        SET status = 'running',
          started_at = COALESCE(started_at, datetime('now')),
          completed_at = NULL,
          updated_at = datetime('now')
        WHERE id = $1`,
            [resumableStep.id],
          );
          mockWf_insertWorkflowEvent(
            parsed.id,
            resumableStep.id,
            "step_resumed",
            `${resumableStep.title} resumed`,
          );
        } else {
          const hasActiveStep = steps.some((step) =>
            ["running", "waiting_approval"].includes(step.status),
          );
          if (!hasActiveStep) {
            const firstRunnableStep =
              steps.find(
                (step) =>
                  step.step_key === run.current_step_key &&
                  step.status === "pending",
              ) ?? steps.find((step) => step.status === "pending");
            if (firstRunnableStep !== undefined) {
              mockSqlExecute(
                `UPDATE workflow_steps
            SET status = 'running',
              started_at = COALESCE(started_at, datetime('now')),
              completed_at = NULL,
              updated_at = datetime('now')
            WHERE id = $1`,
                [firstRunnableStep.id],
              );
              mockWf_insertWorkflowEvent(
                parsed.id,
                firstRunnableStep.id,
                "step_started",
                `${firstRunnableStep.title} started`,
              );
            }
          }
        }

        const scoreStatusRows = mockSqlSelect<{ status: WorkflowStepStatus }>(
          `SELECT status FROM workflow_steps
        WHERE workflow_run_id = $1 AND step_key = 'score' LIMIT 1`,
          [parsed.id],
        );
        const scoreStatus = scoreStatusRows[0]?.status;
        if (scoreStatus !== undefined) {
          mockWf_syncPlannerScoringBacklogInTransaction(parsed.id, scoreStatus);
        }
      } catch (error) {
        throw error;
      }
    }

    function mockWf_getWorkflowArtifactOwnership(
      artifactType: WorkflowArtifactType,
      artifactId: number,
      workflowStepId: number | undefined,
      workflowRunId: number,
      campaignId: number,
      campaignStatus: CampaignStatus,
    ): WorkflowArtifactOwnershipRow {
      if (campaignStatus === "archived")
        throw new Error("Campaign is archived");

      if (workflowStepId !== undefined) {
        const stepRows = mockSqlSelect<WorkflowArtifactOwnershipRow>(
          `SELECT
        wr.campaign_id,
        ws.workflow_run_id,
        NULL AS workflow_step_id
      FROM workflow_steps ws
      INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
      WHERE ws.id = $1
      LIMIT 1`,
          [workflowStepId],
        );
        const step = stepRows[0];
        if (step === undefined) throw new Error("Workflow step was not found");
        if (step.workflow_run_id !== workflowRunId) {
          throw new Error("Workflow step belongs to a different workflow run");
        }
        if (step.campaign_id !== campaignId) {
          throw new Error("Workflow step belongs to a different campaign");
        }
      }

      let artifactRows: WorkflowArtifactOwnershipRow[];
      if (artifactType === "agent_run") {
        artifactRows = mockSqlSelect<WorkflowArtifactOwnershipRow>(
          `SELECT campaign_id, workflow_run_id, workflow_step_id
      FROM agent_runs
      WHERE id = $1
      LIMIT 1`,
          [artifactId],
        );
      } else if (artifactType === "draft") {
        artifactRows = mockSqlSelect<WorkflowArtifactOwnershipRow>(
          `SELECT
        campaign_id,
        NULL AS workflow_run_id,
        NULL AS workflow_step_id
      FROM drafts
      WHERE id = $1
      LIMIT 1`,
          [artifactId],
        );
      } else {
        artifactRows = mockSqlSelect<WorkflowArtifactOwnershipRow>(
          `SELECT
        campaign_id,
        NULL AS workflow_run_id,
        NULL AS workflow_step_id
      FROM candidate_posts
      WHERE id = $1
      LIMIT 1`,
          [artifactId],
        );
      }
      const artifact = artifactRows[0];
      if (artifact === undefined)
        throw new Error("Workflow artifact was not found");
      if (artifact.campaign_id !== campaignId) {
        throw new Error("Artifact belongs to a different campaign");
      }
      if (
        artifact.workflow_run_id !== null &&
        artifact.workflow_run_id !== workflowRunId
      ) {
        throw new Error("Artifact belongs to a different workflow run");
      }
      if (
        workflowStepId !== undefined &&
        artifact.workflow_step_id !== null &&
        artifact.workflow_step_id !== workflowStepId
      ) {
        throw new Error("Artifact belongs to a different workflow step");
      }

      return artifact;
    }

    function mockWf_createWorkflowArtifact(
      input: CreateWorkflowArtifactInput,
    ): number {
      const parsed = input;
      try {
        const run = mockWf_getWorkflowRunValidation(parsed.workflowRunId);
        mockWf_getWorkflowArtifactOwnership(
          parsed.artifactType,
          parsed.artifactId,
          parsed.workflowStepId,
          parsed.workflowRunId,
          run.campaign_id,
          run.campaign_status,
        );

        mockSqlExecute(
          `INSERT INTO workflow_artifacts (
        workflow_run_id,
        workflow_step_id,
        artifact_type,
        artifact_id,
        summary,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, datetime('now'))
      ON CONFLICT(workflow_run_id, artifact_type, artifact_id) DO UPDATE SET
        workflow_step_id = excluded.workflow_step_id,
        summary = excluded.summary,
        updated_at = datetime('now')`,
          [
            parsed.workflowRunId,
            parsed.workflowStepId ?? null,
            parsed.artifactType,
            parsed.artifactId,
            parsed.summary,
          ],
        );
        const artifactRows = mockSqlSelect<{ id: number }>(
          `SELECT id
      FROM workflow_artifacts
      WHERE workflow_run_id = $1
        AND artifact_type = $2
        AND artifact_id = $3
      LIMIT 1`,
          [parsed.workflowRunId, parsed.artifactType, parsed.artifactId],
        );
        const artifact = artifactRows[0];
        if (artifact === undefined) {
          throw new Error("Workflow artifact was not found after upsert");
        }
        mockSqlExecute(
          `UPDATE workflow_runs
      SET updated_at = datetime('now')
      WHERE id = $1`,
          [parsed.workflowRunId],
        );
        return artifact.id;
      } catch (error) {
        throw error;
      }
    }

    function mockWf_resumeWorkflowRun(input: StartWorkflowRunInput): {
      linkedAgentIsActive: boolean;
    } {
      const parsed = input;
      let linkedAgentIsActive = false;
      try {
        const run = mockWf_getWorkflowRunValidation(parsed.id);
        if (
          run.autopilot_plan_id !== null &&
          run.current_step_key === "draft"
        ) {
          throw new Error(mockWf_PLANNER_DRAFT_SAVE_ONLY_MESSAGE);
        }
        const steps = mockWf_loadWorkflowSteps(parsed.id);
        const waitingStep =
          steps.find(
            (step) =>
              step.step_key === run.current_step_key &&
              step.status === "waiting_approval",
          ) ?? steps.find((step) => step.status === "waiting_approval");

        if (waitingStep !== undefined) {
          const agentRows = mockSqlSelect<WorkflowLinkedAgentRow>(
            `SELECT id, status, output_summary, error_message
        FROM agent_runs
        WHERE workflow_run_id = $1
          AND workflow_step_id = $2
        ORDER BY id DESC
        LIMIT 1`,
            [parsed.id, waitingStep.id],
          );
          const agentRun = agentRows[0];
          if (agentRun !== undefined) {
            mockWf_reconcileWorkflowAgentRunInTransaction({
              agentRunId: agentRun.id,
              status: agentRun.status,
              outputSummary: agentRun.output_summary,
              errorMessage: agentRun.error_message,
            });
            linkedAgentIsActive = [
              "queued",
              "running",
              "waiting_approval",
            ].includes(agentRun.status);
          }
        }
      } catch (error) {
        throw error;
      }

      return { linkedAgentIsActive };
    }

    function mockWf_setWorkflowStepStatus(
      input: SetWorkflowStepStatusInput,
    ): void {
      const parsed = input;
      try {
        const rows = mockSqlSelect<WorkflowStepValidationRow>(
          `SELECT
        ws.*,
        wr.status AS run_status,
        wr.campaign_id,
        c.status AS campaign_status,
        ap.id AS autopilot_plan_id
      FROM workflow_steps ws
      INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
      INNER JOIN campaigns c ON c.id = wr.campaign_id
      LEFT JOIN autopilot_plans ap ON ap.workflow_run_id = wr.id
      WHERE ws.id = $1
      LIMIT 1`,
          [parsed.stepId],
        );
        const step = rows[0];
        if (step === undefined) throw new Error("Workflow step was not found");
        if (step.campaign_status === "archived")
          throw new Error("Campaign is archived");
        if (step.run_status === "cancelled") {
          throw new Error("Cancelled workflow runs cannot change steps");
        }
        if (step.run_status === "completed" && parsed.status !== "running") {
          throw new Error("Completed workflow runs can only reopen steps");
        }
        if (
          step.autopilot_plan_id !== null &&
          step.step_key === "draft" &&
          mockWf_FINISHED_STEP_STATUSES.includes(parsed.status)
        ) {
          throw new Error(mockWf_PLANNER_DRAFT_SAVE_ONLY_MESSAGE);
        }

        mockWf_assertStepTransition(step.status, parsed.status);

        mockSqlExecute(
          `UPDATE workflow_steps
      SET status = $1,
        output_summary = $2,
        error_message = $3,
        started_at = CASE WHEN $1 = 'running' THEN COALESCE(started_at, datetime('now')) ELSE started_at END,
        completed_at = CASE
          WHEN $1 IN ('completed', 'skipped') THEN datetime('now')
          WHEN $1 IN ('running', 'blocked', 'failed', 'waiting_approval') THEN NULL
          ELSE completed_at
        END,
        updated_at = datetime('now')
      WHERE id = $4`,
          [
            parsed.status,
            parsed.outputSummary,
            parsed.errorMessage,
            parsed.stepId,
          ],
        );

        mockWf_insertWorkflowEvent(
          step.workflow_run_id,
          step.id,
          mockWf_getStepEventType(step.status, parsed.status),
          mockWf_getStepEventSummary(step, parsed.status),
        );

        if (parsed.status === "completed") {
          mockWf_startNextPendingWorkflowStep(step);
        }

        mockWf_updateRunFromSteps(step.workflow_run_id, step.run_status);
        if (step.step_key === "score") {
          mockWf_syncPlannerScoringBacklogInTransaction(
            step.workflow_run_id,
            parsed.status,
          );
        }
      } catch (error) {
        throw error;
      }
    }

    function mockWf_cancelWorkflowRun(input: CancelWorkflowRunInput): void {
      const parsed = input;
      try {
        const run = mockWf_getWorkflowRunValidation(parsed.id);
        if (run.campaign_status === "archived")
          throw new Error("Campaign is archived");

        mockSqlExecute(
          `UPDATE workflow_runs
      SET status = 'cancelled',
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $1`,
          [parsed.id],
        );
        mockWf_insertWorkflowEvent(
          parsed.id,
          null,
          "run_cancelled",
          "Workflow run cancelled",
        );
        const scoreRows = mockSqlSelect<{
          id: number;
          status: WorkflowStepStatus;
        }>(
          `SELECT id, status FROM workflow_steps
        WHERE workflow_run_id = $1 AND step_key = 'score' LIMIT 1`,
          [parsed.id],
        );
        const scoreStep = scoreRows[0];
        if (
          scoreStep !== undefined &&
          !["completed", "skipped"].includes(scoreStep.status)
        ) {
          mockSqlExecute(
            `UPDATE workflow_steps
          SET status = 'skipped',
            completed_at = COALESCE(completed_at, datetime('now')),
            updated_at = datetime('now')
          WHERE id = $1`,
            [scoreStep.id],
          );
          mockWf_syncPlannerScoringBacklogInTransaction(parsed.id, "skipped");
        }
      } catch (error) {
        throw error;
      }
    }

    function mockWf_addWorkflowNote(input: AddWorkflowNoteInput): void {
      const parsed = input;
      try {
        const run = mockWf_getWorkflowRunValidation(parsed.workflowRunId);
        if (run.campaign_status === "archived")
          throw new Error("Campaign is archived");

        mockWf_insertWorkflowEvent(
          parsed.workflowRunId,
          null,
          "note_added",
          parsed.note,
        );
        mockSqlExecute(
          `UPDATE workflow_runs
      SET updated_at = datetime('now')
      WHERE id = $1`,
          [parsed.workflowRunId],
        );
      } catch (error) {
        throw error;
      }
    }

    function runWorkflowCommand(
      args: unknown,
      work: (input: never) => unknown,
    ): Promise<unknown> {
      return runNativeMutation(() => work(nativeInput<never>(args)));
    }

    function mockWorkflowCommand(
      cmd: string,
      args: unknown,
    ): Promise<unknown> | undefined {
      switch (cmd) {
        case "linkgo_workflow_create_run":
          return runWorkflowCommand(args, (input: CreateWorkflowRunInput) => ({
            id: mockWf_createWorkflowRun(input),
          }));
        case "linkgo_workflow_start_run":
          return runWorkflowCommand(args, (input: StartWorkflowRunInput) => {
            mockWf_startWorkflowRun(input);
            return { id: input.id };
          });
        case "linkgo_workflow_resume_run":
          return runWorkflowCommand(args, (input: StartWorkflowRunInput) =>
            mockWf_resumeWorkflowRun(input),
          );
        case "linkgo_workflow_set_step_status":
          return runWorkflowCommand(
            args,
            (input: SetWorkflowStepStatusInput) => {
              mockWf_setWorkflowStepStatus(input);
              return { id: input.stepId };
            },
          );
        case "linkgo_workflow_cancel_run":
          return runWorkflowCommand(args, (input: CancelWorkflowRunInput) => {
            mockWf_cancelWorkflowRun(input);
            return { id: input.id };
          });
        case "linkgo_workflow_add_note":
          return runWorkflowCommand(args, (input: AddWorkflowNoteInput) => {
            mockWf_addWorkflowNote(input);
            return { id: input.workflowRunId };
          });
        case "linkgo_workflow_create_artifact":
          return runWorkflowCommand(
            args,
            (input: CreateWorkflowArtifactInput) => ({
              id: mockWf_createWorkflowArtifact(input),
            }),
          );
        default:
          return undefined;
      }
    }

    // ---- Agent runs: generated from the pre-migration renderer agent-runtime
    // and safety code (sync over the SQL emulator); mirrors the native
    // agent_run_store commands. ----
    interface AgentRunValidationRow extends AgentRun {
      campaign_status: string;
    }
    interface ApprovalLinkRow {
      id: number;
      campaign_id: number;
      status: string;
    }
    interface WorkflowRunValidationRow {
      id: number;
      campaign_id: number;
    }
    interface WorkflowStepValidationRow {
      id: number;
      workflow_run_id: number;
      campaign_id: number;
    }
    interface MockArToolCall {
      providerToolCallId: string;
      toolName: string;
      status: string;
      requiresApproval: boolean;
      input: unknown;
      output: unknown;
      errorMessage: string;
    }
    interface AgentLoopResult {
      status: "completed" | "failed" | "waiting_approval";
      outputSummary: string;
      errorMessage: string;
      iterationCount: number;
      conversation: unknown[];
      toolCalls: MockArToolCall[];
    }
    type ResumeAgentRunResult = {
      checkpointPhase: "waiting_approval" | "continuation_ready" | null;
    };
    type CreateAgentRunInput = {
      campaignId: number;
      workflowRunId?: number;
      workflowStepId?: number;
      agentRole: string;
      providerKey: string;
      modelName: string;
      playbookKey?: string;
      inputSummary: string;
      inputContext: Record<string, unknown>;
    };
    type CancelAgentRunInput = { id: number };
    type RecordSafetyAuditEventInput = {
      campaignId?: number | null;
      subjectType: string;
      subjectId?: number | null;
      eventType: string;
      severity: string;
      summary: string;
      metadata?: unknown;
    };
    type UpsertErrorQueueItemInput = {
      campaignId?: number | null;
      sourceType: string;
      sourceId?: number | null;
      title: string;
      detail: string;
      severity: string;
    };
    type SafetyKillSwitchContext = {
      campaignId?: number | null;
      subjectType: string;
      subjectId?: number | null;
      summary: string;
    };
    type RecordAgentToolCallInput = {
      agentRunId: number;
      providerToolCallId: string;
      toolName: string;
      status: string;
      requiresApproval: boolean;
      input: unknown;
      output: unknown;
      errorMessage: string;
    };
    type RecordAgentRunEventInput = {
      agentRunId: number;
      eventType: string;
      summary: string;
    };
    interface CampaignStatusRow {
      id: number;
      status: string;
    }
    // Playbook metadata the old create path read from the agent registry.
    const MOCK_AR_PLAYBOOKS: Record<
      string,
      {
        compatibleRoles: string[];
        runtimeEnabled: boolean;
        operatorGuidanceOnly: boolean;
      }
    > = {
      linkedin_writer: {
        compatibleRoles: ["drafter"],
        runtimeEnabled: true,
        operatorGuidanceOnly: false,
      },
      linkedin_humanizer: {
        compatibleRoles: ["auditor"],
        runtimeEnabled: true,
        operatorGuidanceOnly: false,
      },
      content_calendar: {
        compatibleRoles: ["scheduler"],
        runtimeEnabled: true,
        operatorGuidanceOnly: false,
      },
      linkedin_commenter: {
        compatibleRoles: [],
        runtimeEnabled: false,
        operatorGuidanceOnly: true,
      },
      campaign_analyst: {
        compatibleRoles: ["analyst"],
        runtimeEnabled: true,
        operatorGuidanceOnly: false,
      },
    };
    const MOCK_AR_DEFAULT_PLAYBOOK: Record<string, string> = {
      drafter: "linkedin_writer",
      auditor: "linkedin_humanizer",
      scheduler: "content_calendar",
      analyst: "campaign_analyst",
    };
    function getAgentPlaybook(
      key: string,
    ): ({ key: string } & (typeof MOCK_AR_PLAYBOOKS)[string]) | undefined {
      const playbook = MOCK_AR_PLAYBOOKS[key];
      return playbook ? { key, ...playbook } : undefined;
    }
    function getDefaultPlaybookForRole(
      role: string,
    ): { key: string } | undefined {
      const key = MOCK_AR_DEFAULT_PLAYBOOK[role];
      return key ? { key } : undefined;
    }
    function mockAr_stringifyMetadata(metadata: unknown): string {
      try {
        return JSON.stringify(metadata ?? {});
      } catch {
        return JSON.stringify({ serializationError: true });
      }
    }

    function mockAr_recordSafetyAuditEvent(
      input: RecordSafetyAuditEventInput,
    ): number {
      const parsed = input;
      const result = mockSqlExecute(
        `INSERT INTO safety_audit_events (
      campaign_id,
      subject_type,
      subject_id,
      event_type,
      severity,
      summary,
      metadata_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          parsed.campaignId ?? null,
          parsed.subjectType,
          parsed.subjectId ?? null,
          parsed.eventType,
          parsed.severity,
          parsed.summary,
          mockAr_stringifyMetadata(parsed.metadata),
        ],
      );
      return result.lastInsertId;
    }

    function mockAr_upsertErrorQueueItem(
      input: UpsertErrorQueueItemInput,
    ): number {
      const parsed = input;

      const existingRows =
        parsed.sourceId === undefined || parsed.sourceId === null
          ? []
          : mockSqlSelect<ErrorQueueItem>(
              `SELECT * FROM error_queue_items
          WHERE source_type = $1
            AND source_id = $2
            AND status IN ('open', 'in_progress', 'awaiting_review')
          LIMIT 1`,
              [parsed.sourceType, parsed.sourceId],
            );
      const existing = existingRows[0];

      if (existing !== undefined) {
        mockSqlExecute(
          `UPDATE error_queue_items
      SET campaign_id = $1,
        title = $2,
        detail = $3,
        severity = $4,
        updated_at = datetime('now')
      WHERE id = $5`,
          [
            parsed.campaignId ?? null,
            parsed.title,
            parsed.detail,
            parsed.severity,
            existing.id,
          ],
        );
        mockAr_recordSafetyAuditEvent({
          campaignId: parsed.campaignId ?? existing.campaign_id,
          subjectType: "error_queue_item",
          subjectId: existing.id,
          eventType: "error_item_updated",
          severity: "warning",
          summary: `Error item updated: ${parsed.title}`,
          metadata: {
            sourceType: parsed.sourceType,
            sourceId: parsed.sourceId ?? null,
          },
        });
        return existing.id;
      }

      const result = mockSqlExecute(
        `INSERT INTO error_queue_items (
      campaign_id,
      source_type,
      source_id,
      title,
      detail,
      severity,
      status,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'open', datetime('now'))`,
        [
          parsed.campaignId ?? null,
          parsed.sourceType,
          parsed.sourceId ?? null,
          parsed.title,
          parsed.detail,
          parsed.severity,
        ],
      );
      mockAr_recordSafetyAuditEvent({
        campaignId: parsed.campaignId ?? null,
        subjectType: "error_queue_item",
        subjectId: result.lastInsertId,
        eventType: "error_item_created",
        severity: "warning",
        summary: `Error item created: ${parsed.title}`,
        metadata: {
          sourceType: parsed.sourceType,
          sourceId: parsed.sourceId ?? null,
        },
      });
      return result.lastInsertId;
    }

    function mockAr_assertSafetyKillSwitchOff(
      context: SafetyKillSwitchContext,
    ): void {
      const parsed = context;
      mockSqlExecute(
        `INSERT OR IGNORE INTO safety_settings (id) VALUES (1)`,
        [],
      );
      const rows = mockSqlSelect<SafetySettings>(
        `SELECT * FROM safety_settings WHERE id = 1 LIMIT 1`,
        [],
      );
      const settings = rows[0];
      if (settings?.global_kill_switch === 1) {
        mockAr_recordSafetyAuditEvent({
          campaignId: parsed.campaignId ?? null,
          subjectType: parsed.subjectType,
          subjectId: parsed.subjectId ?? null,
          eventType:
            parsed.subjectType === "schedule_job"
              ? "schedule_blocked"
              : "agent_run_failed",
          severity: "block",
          summary: `${parsed.summary} blocked by global kill switch`,
          metadata: { reason: settings.kill_switch_reason },
        });
        throw new Error(
          settings.kill_switch_reason
            ? `Global kill switch is enabled: ${settings.kill_switch_reason}`
            : "Global kill switch is enabled",
        );
      }
    }

    function mockAr_assertCampaignCanMutate(campaignId: number): void {
      const rows = mockSqlSelect<CampaignStatusRow>(
        `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
        [campaignId],
      );
      const campaign = rows[0];
      if (campaign === undefined) throw new Error("Campaign was not found");
      if (campaign.status === "archived")
        throw new Error("Campaign is archived");
    }

    function mockAr_validateWorkflowOwnership(
      campaignId: number,
      workflowRunId?: number,
      workflowStepId?: number,
    ): { workflowRunId: number | null; workflowStepId: number | null } {
      let nextWorkflowRunId = workflowRunId ?? null;
      if (workflowRunId !== undefined) {
        const rows = mockSqlSelect<WorkflowRunValidationRow>(
          `SELECT id, campaign_id FROM workflow_runs WHERE id = $1 LIMIT 1`,
          [workflowRunId],
        );
        const workflowRun = rows[0];
        if (workflowRun === undefined)
          throw new Error("Workflow run was not found");
        if (workflowRun.campaign_id !== campaignId) {
          throw new Error("Workflow run belongs to a different campaign");
        }
      }

      if (workflowStepId !== undefined) {
        const rows = mockSqlSelect<WorkflowStepValidationRow>(
          `SELECT
        ws.id,
        ws.workflow_run_id,
        wr.campaign_id
      FROM workflow_steps ws
      INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
      WHERE ws.id = $1
      LIMIT 1`,
          [workflowStepId],
        );
        const workflowStep = rows[0];
        if (workflowStep === undefined)
          throw new Error("Workflow step was not found");
        if (workflowStep.campaign_id !== campaignId) {
          throw new Error("Workflow step belongs to a different campaign");
        }
        if (
          nextWorkflowRunId !== null &&
          workflowStep.workflow_run_id !== nextWorkflowRunId
        ) {
          throw new Error("Workflow step belongs to a different workflow run");
        }
        nextWorkflowRunId = workflowStep.workflow_run_id;
      }

      return {
        workflowRunId: nextWorkflowRunId,
        workflowStepId: workflowStepId ?? null,
      };
    }

    function mockAr_getAgentRunValidation(id: number): AgentRunValidationRow {
      const rows = mockSqlSelect<AgentRunValidationRow>(
        `SELECT
      ar.*,
      c.status AS campaign_status
    FROM agent_runs ar
    INNER JOIN campaigns c ON c.id = ar.campaign_id
    WHERE ar.id = $1
    LIMIT 1`,
        [id],
      );
      const run = rows[0];
      if (run === undefined) throw new Error("Agent run was not found");
      return run;
    }

    function mockAr_insertAgentRunEvent(input: RecordAgentRunEventInput): void {
      const parsed = input;
      mockSqlExecute(
        `INSERT INTO agent_run_events (
      agent_run_id,
      event_type,
      summary
    ) VALUES ($1, $2, $3)`,
        [parsed.agentRunId, parsed.eventType, parsed.summary],
      );
    }

    function mockAr_resolvePlaybookKeyForCreate(
      role: string,
      requestedKey?: string,
    ): string {
      const candidateKey =
        requestedKey ?? getDefaultPlaybookForRole(role)?.key ?? "";
      if (candidateKey === "") return "";
      const definition = getAgentPlaybook(candidateKey);
      if (!definition) throw new Error("Playbook was not found");
      const override = agentPlaybookOverrides.find(
        (row) => row.playbook_key === candidateKey,
      );
      const usable =
        definition.runtimeEnabled &&
        !definition.operatorGuidanceOnly &&
        (override === undefined || override.enabled === 1);
      if (!usable) {
        if (requestedKey !== undefined) throw new Error("Playbook is disabled");
        return "";
      }
      if (!definition.compatibleRoles.includes(role)) {
        throw new Error(
          "Playbook is not compatible with the selected agent role",
        );
      }
      return definition.key;
    }

    function mockAr_insertAgentToolCall(
      input: RecordAgentToolCallInput,
    ): number {
      const parsed = input;
      const validatedInput = parsed.input;
      const validatedOutput =
        parsed.status === "completed"
          ? (parsed.output ?? {})
          : (parsed.output ?? {});
      const result = mockSqlExecute(
        `INSERT INTO agent_tool_calls (
      agent_run_id,
      provider_tool_call_id,
      tool_name,
      status,
      requires_approval,
      input_json,
      output_json,
      error_message,
      started_at,
      completed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), CASE WHEN $4 IN ('completed', 'failed', 'rejected') THEN datetime('now') ELSE NULL END)`,
        [
          parsed.agentRunId,
          parsed.providerToolCallId,
          parsed.toolName,
          parsed.status,
          parsed.requiresApproval ? 1 : 0,
          JSON.stringify(validatedInput),
          JSON.stringify(validatedOutput),
          parsed.errorMessage,
        ],
      );
      return result.lastInsertId;
    }

    function mockAr_createAgentRun(input: CreateAgentRunInput): number {
      const parsed = input;
      const playbookKey = mockAr_resolvePlaybookKeyForCreate(
        parsed.agentRole,
        parsed.playbookKey,
      );
      try {
        mockAr_assertCampaignCanMutate(parsed.campaignId);
        const workflow = mockAr_validateWorkflowOwnership(
          parsed.campaignId,
          parsed.workflowRunId,
          parsed.workflowStepId,
        );

        const result = mockSqlExecute(
          `INSERT INTO agent_runs (
        campaign_id,
        workflow_run_id,
        workflow_step_id,
        agent_role,
        provider_key,
        model_name,
        playbook_key,
        status,
        input_summary,
        input_context_json,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, $9, datetime('now'))`,
          [
            parsed.campaignId,
            workflow.workflowRunId,
            workflow.workflowStepId,
            parsed.agentRole,
            parsed.providerKey,
            parsed.modelName,
            playbookKey,
            parsed.inputSummary,
            JSON.stringify(parsed.inputContext),
          ],
        );

        mockAr_insertAgentRunEvent({
          agentRunId: result.lastInsertId,
          eventType: "run_created",
          summary: `Agent run created for ${parsed.agentRole}.`,
        });
        return result.lastInsertId;
      } catch (error) {
        throw error;
      }
    }

    function mockAr_getApprovalLink(approvalId: number): ApprovalLinkRow {
      const rows = mockSqlSelect<ApprovalLinkRow>(
        `SELECT id, campaign_id, status
    FROM approvals
    WHERE id = $1
    LIMIT 1`,
        [approvalId],
      );
      const approval = rows[0];
      if (approval === undefined)
        throw new Error("Linked approval was not found");
      return approval;
    }

    function mockAr_validateApprovalInterrupt(
      run: AgentRunValidationRow,
      result: AgentLoopResult,
    ): number | null {
      if (result.status !== "waiting_approval") return null;
      const waitingCalls = result.toolCalls.filter(
        (toolCall) => toolCall.status === "waiting_approval",
      );
      if (waitingCalls.length !== 1) {
        throw new Error(
          "Approval interrupt must contain one pending tool call",
        );
      }
      const pendingCall = waitingCalls[0];
      if (pendingCall?.toolName !== "schedule_post") {
        throw new Error("Only schedule_post can create an approval checkpoint");
      }
      const scheduleInput = pendingCall.input as {
        campaignId: number;
        approvalId: number;
      };
      if (scheduleInput.campaignId !== run.campaign_id) {
        throw new Error("Schedule request belongs to a different campaign");
      }
      const approval = mockAr_getApprovalLink(scheduleInput.approvalId);
      if (approval.campaign_id !== run.campaign_id) {
        throw new Error("Linked approval belongs to a different campaign");
      }
      return approval.id;
    }

    function mockAr_shouldRetainContinuationCheckpoint(
      result: AgentLoopResult,
    ): boolean {
      return (
        result.status === "failed" &&
        result.toolCalls.length === 0 &&
        !result.errorMessage.includes("maximum turn limit")
      );
    }

    function mockAr_getPersistedCheckpointPhase(
      result: AgentLoopResult,
      options: { allowContinuationRecovery: boolean },
    ): ResumeAgentRunResult["checkpointPhase"] {
      if (result.status === "waiting_approval") return "waiting_approval";
      if (
        options.allowContinuationRecovery &&
        mockAr_shouldRetainContinuationCheckpoint(result)
      ) {
        return "continuation_ready";
      }
      return null;
    }

    function mockAr_persistAgentLoopResult(
      run: AgentRunValidationRow,
      result: AgentLoopResult,
      options: { allowContinuationRecovery: boolean },
    ): void {
      const conversation = result.conversation;
      const approvalId = mockAr_validateApprovalInterrupt(run, result);
      const checkpointPhase = mockAr_getPersistedCheckpointPhase(
        result,
        options,
      );
      let pendingToolCallId: number | null = null;

      for (const toolCall of result.toolCalls) {
        const toolCallId = mockAr_insertAgentToolCall({
          agentRunId: run.id,
          providerToolCallId: toolCall.providerToolCallId,
          toolName: toolCall.toolName,
          status: toolCall.status,
          requiresApproval: toolCall.requiresApproval,
          input: toolCall.input,
          output: toolCall.output,
          errorMessage: toolCall.errorMessage,
        });
        if (toolCall.status === "waiting_approval") {
          pendingToolCallId = toolCallId;
        }
      }

      if (checkpointPhase === "waiting_approval") {
        if (approvalId === null || pendingToolCallId === null) {
          throw new Error(
            "Approval checkpoint is missing its pending tool call",
          );
        }
        mockSqlExecute(
          `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
          [run.id],
        );
        mockSqlExecute(
          `INSERT INTO agent_run_approval_checkpoints (
        agent_run_id,
        pending_tool_call_id,
        approval_id,
        phase,
        messages_json,
        iteration_count,
        updated_at
      ) VALUES ($1, $2, $3, 'waiting_approval', $4, $5, datetime('now'))`,
          [
            run.id,
            pendingToolCallId,
            approvalId,
            JSON.stringify(conversation),
            result.iterationCount,
          ],
        );
      } else if (checkpointPhase === "continuation_ready") {
        const checkpointResult = mockSqlExecute(
          `UPDATE agent_run_approval_checkpoints
      SET phase = 'continuation_ready',
        messages_json = $1,
        iteration_count = $2,
        updated_at = datetime('now')
      WHERE agent_run_id = $3`,
          [JSON.stringify(conversation), result.iterationCount, run.id],
        );
        if (checkpointResult.rowsAffected !== 1) {
          throw new Error("Agent continuation checkpoint was lost");
        }
      } else {
        mockSqlExecute(
          `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
          [run.id],
        );
      }

      mockSqlExecute(
        `UPDATE agent_runs
    SET status = $1,
      output_summary = $2,
      error_message = $3,
      iteration_count = $4,
      completed_at = CASE WHEN $1 IN ('completed', 'failed', 'cancelled') THEN datetime('now') ELSE NULL END,
      updated_at = datetime('now')
    WHERE id = $5`,
        [
          result.status,
          result.outputSummary,
          result.errorMessage,
          result.iterationCount,
          run.id,
        ],
      );
      mockWf_reconcileWorkflowAgentRunInTransaction({
        agentRunId: run.id,
        status: result.status,
        outputSummary: result.outputSummary,
        errorMessage: result.errorMessage,
      });

      if (result.status === "failed") {
        mockAr_recordSafetyAuditEvent({
          campaignId: run.campaign_id,
          subjectType: "agent_run",
          subjectId: run.id,
          eventType: "agent_run_failed",
          severity: "warning",
          summary: result.errorMessage || "Agent run failed",
          metadata: { iterationCount: result.iterationCount },
        });
        mockAr_upsertErrorQueueItem({
          campaignId: run.campaign_id,
          sourceType: "agent_run",
          sourceId: run.id,
          title: "Agent run failed",
          detail: result.errorMessage || "Agent run failed",
          severity: "error",
        });
      }
    }

    function mockAr_cancelAgentRun(input: CancelAgentRunInput): void {
      const parsed = input;
      try {
        const run = mockAr_getAgentRunValidation(parsed.id);
        if (run.campaign_status === "archived")
          throw new Error("Campaign is archived");
        if (run.status === "completed") {
          throw new Error("Completed agent runs cannot be cancelled");
        }

        const errorMessage = run.error_message || "Agent run cancelled";
        mockSqlExecute(
          `UPDATE agent_runs
      SET status = 'cancelled',
        error_message = $1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $2`,
          [errorMessage, parsed.id],
        );
        mockWf_reconcileWorkflowAgentRunInTransaction({
          agentRunId: run.id,
          status: "cancelled",
          outputSummary: run.output_summary,
          errorMessage,
        });
        mockSqlExecute(
          `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
          [parsed.id],
        );
        mockAr_insertAgentRunEvent({
          agentRunId: parsed.id,
          eventType: "run_cancelled",
          summary: "Agent run cancelled",
        });
      } catch (error) {
        throw error;
      }
    }
    function runAgentRunCommand(
      args: unknown,
      work: (input: never) => unknown,
    ): Promise<unknown> {
      return runNativeMutation(() => work(nativeInput<never>(args)));
    }

    function mockAgentRunCommand(
      cmd: string,
      args: unknown,
    ): Promise<unknown> | undefined {
      switch (cmd) {
        case "linkgo_agent_run_create":
          return runAgentRunCommand(args, (input: CreateAgentRunInput) => ({
            id: mockAr_createAgentRun(input),
          }));
        case "linkgo_agent_run_start":
          return runAgentRunCommand(
            args,
            (input: { id: number; claim: boolean }) => {
              const run = mockAr_getAgentRunValidation(input.id);
              if (run.campaign_status === "archived")
                throw new Error("Campaign is archived");
              if (["completed", "cancelled"].includes(run.status))
                throw new Error("Terminal agent runs cannot be restarted");
              if (run.status === "running")
                throw new Error("Agent run is already running");
              if (run.status === "waiting_approval")
                throw new Error("Agent run is waiting for approval");
              if (
                mockSqlSelect(
                  `SELECT agent_run_id FROM agent_run_approval_checkpoints
    WHERE agent_run_id = $1
    LIMIT 1`,
                  [run.id],
                ).length > 0
              ) {
                throw new Error(
                  "Use approval continuation recovery for this agent run",
                );
              }
              // The kill-switch audit must survive the rejection, like the native
              // command, so it runs outside the rolled-back mutation.
              mockAr_assertSafetyKillSwitchOff({
                campaignId: run.campaign_id,
                subjectType: "agent_run",
                subjectId: run.id,
                summary: "Agent run start",
              });
              if (input.claim) {
                const claim = mockSqlExecute(
                  `UPDATE agent_runs
        SET status = 'running',
          started_at = COALESCE(started_at, datetime('now')),
          completed_at = NULL,
          error_message = '',
          updated_at = datetime('now')
        WHERE id = $1
          AND status IN ('queued', 'failed')`,
                  [run.id],
                );
                if (claim.rowsAffected !== 1)
                  throw new Error("Agent run could not be claimed for start");
                mockAr_recordSafetyAuditEvent({
                  campaignId: run.campaign_id,
                  subjectType: "agent_run",
                  subjectId: run.id,
                  eventType: "agent_run_started",
                  severity: "info",
                  summary: "Agent run started",
                  metadata: {
                    agentRole: run.agent_role,
                    providerKey: run.provider_key,
                  },
                });
              }
              return { id: run.id };
            },
          );
        case "linkgo_agent_run_record_event":
          return runAgentRunCommand(args, (input: RecordAgentRunEventInput) => {
            mockAr_getAgentRunValidation(input.agentRunId);
            mockAr_insertAgentRunEvent(input);
            return { id: input.agentRunId };
          });
        case "linkgo_agent_run_persist_result":
          return runAgentRunCommand(
            args,
            (input: {
              agentRunId: number;
              continuation: boolean;
              result: AgentLoopResult;
            }) => {
              const run = mockAr_getAgentRunValidation(input.agentRunId);
              if (run.status !== "running")
                throw new Error("Agent run is no longer running");
              if (input.continuation) {
                const active = mockSqlSelect(
                  `SELECT agent_run_id FROM agent_run_approval_checkpoints
        WHERE agent_run_id = $1 AND phase = 'continuation_ready'`,
                  [run.id],
                );
                if (active.length !== 1)
                  throw new Error(
                    "Agent continuation checkpoint is no longer active",
                  );
              }
              const options = { allowContinuationRecovery: input.continuation };
              mockAr_persistAgentLoopResult(run, input.result, options);
              return {
                checkpointPhase: mockAr_getPersistedCheckpointPhase(
                  input.result,
                  options,
                ),
              };
            },
          );
        case "linkgo_agent_run_fail_after_persistence_error":
          return runAgentRunCommand(
            args,
            (input: { agentRunId: number; errorMessage: string }) => {
              const updated = mockSqlExecute(
                `UPDATE agent_runs
      SET status = 'failed',
        error_message = $1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $2 AND status = 'running'`,
                [input.errorMessage, input.agentRunId],
              );
              if (updated.rowsAffected === 1) {
                mockAr_insertAgentRunEvent({
                  agentRunId: input.agentRunId,
                  eventType: "run_failed",
                  summary: input.errorMessage,
                });
              }
              return { id: input.agentRunId };
            },
          );
        case "linkgo_agent_run_cancel":
          return runAgentRunCommand(args, (input: CancelAgentRunInput) => {
            mockAr_cancelAgentRun(input);
            return { id: input.id };
          });
        default:
          return undefined;
      }
    }

    // ---- Drafts: generated from the pre-migration renderer draft code
    // (sync over the SQL emulator); mirrors the native drafts_core and
    // draft_generation commands. ----
    interface DraftAuditFinding {
      id?: number;
      draft_variant_id?: number;
      rule_key: string;
      severity: DraftAuditSeverity;
      message: string;
      created_at?: string;
    }
    interface DraftVariantInput {
      hook?: string;
      body?: string;
      cta?: string;
      hashtags?: string;
    }
    type CreateDraftInput = {
      candidateId: number;
      angle: string;
      notes: string;
      contentIntent: DraftContentIntent;
      variants: DraftVariantInput[];
    };
    type UpdateDraftVariantInput = {
      id: number;
      hook?: string;
      body?: string;
      cta?: string;
      hashtags?: string;
    };
    type SetDraftVariantStatusInput = { id: number; status: string };
    type SaveGeneratedDraftInput = { id: number };
    type DraftGenerationRequestStatus =
      | "pending"
      | "generated"
      | "failed"
      | "saved"
      | "dismissed";
    interface GeneratedDraftVariant {
      hook: string;
      body: string;
      cta: string;
      hashtags: string[];
    }
    interface DraftVariantRow {
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
    }

    interface DraftAuditRow {
      id: number;
      draft_variant_id: number;
      rule_key: string;
      severity: DraftAuditSeverity;
      message: string;
      created_at: string;
    }

    interface DraftCandidateRow {
      candidate_id: number;
      campaign_id: number;
      campaign_status: CampaignStatus;
      candidate_status: CandidateStatus;
    }

    interface DraftCandidateContextRow extends DraftCandidateRow {
      campaign_name: string;
      campaign_product: string;
      campaign_audience: string;
      campaign_voice: string;
      campaign_tone: string;
      candidate_source_keyword: string;
      candidate_score_reason: string;
      candidate_notes: string;
      candidate_relevance_score: number | null;
      target_author_name: string;
      target_content: string;
    }

    interface SelectedCountRow {
      selected_count: number;
    }

    interface CampaignMutationStatusRow {
      status: CampaignStatus;
    }

    interface DraftInsertInput {
      campaignId: number;
      candidateId: number;
      angle: string;
      notes: string;
      contentIntent: DraftContentIntent;
      variants: CreateDraftInput["variants"];
    }

    interface DraftGenerationRequestRow {
      id: number;
      campaign_id: number;
      candidate_post_id: number;
      agent_run_id: number | null;
      provider_key: DraftGenerationRequest["provider_key"];
      model_name: string;
      playbook_key: DraftGenerationRequest["playbook_key"];
      variant_count: number;
      content_intent: DraftContentIntent;
      workflow_run_id: number | null;
      workflow_step_id: number | null;
      angle: string;
      voice_notes: string;
      status: DraftGenerationRequestStatus;
      summary: string;
      generated_variants_json: string;
      error_message: string;
      created_draft_id: number | null;
      created_at: string;
      updated_at: string;
      campaign_name: string;
      candidate_source_keyword: string;
      candidate_status: CandidateStatus;
      candidate_relevance_score: number | null;
      candidate_score_reason: string;
      candidate_notes: string;
      candidate_created_at: string;
      candidate_updated_at: string;
      target_id: number;
      target_platform: "linkedin";
      target_url: string;
      target_normalized_url: string;
      target_platform_resource_urn: string;
      target_author_name: string;
      target_author_profile_url: string;
      target_posted_at: string | null;
      target_content: string;
      target_content_hash: string;
      target_created_at: string;
      target_updated_at: string;
    }

    interface DraftToolCallRow {
      input_json: string;
      output_json: string;
    }

    const mockDr_SEVERITY_RANK: Record<DraftAuditSeverity, number> = {
      block: 0,
      warning: 1,
      pass: 2,
    };

    function mockDr_normalizeVariantInput(
      input: DraftVariantInput,
    ): Required<DraftVariantInput> {
      return {
        hook: input.hook ?? "",
        body: input.body ?? "",
        cta: input.cta ?? "",
        hashtags: input.hashtags ?? "",
      };
    }

    function mockDr_countHashtags(hashtags: string): number {
      return hashtags.match(/#[\p{L}\p{N}_-]+/gu)?.length ?? 0;
    }

    function mockDr_hasExternalLink(text: string): boolean {
      return /https?:\/\/|www\./iu.test(text);
    }

    function mockDr_createFinding(
      ruleKey: string,
      severity: DraftAuditSeverity,
      message: string,
    ): DraftAuditFinding {
      return { rule_key: ruleKey, severity, message };
    }

    function mockDr_auditDraftVariant(
      input: DraftVariantInput,
    ): DraftAuditFinding[] {
      const variant = mockDr_normalizeVariantInput(input);
      const hook = variant.hook.trim();
      const body = variant.body.trim();
      const cta = variant.cta.trim();
      const hashtags = variant.hashtags.trim();
      const combined = `${hook}${body}${cta}${hashtags}`;
      const combinedWithSpaces = `${hook} ${body} ${cta} ${hashtags}`.trim();
      const findings: DraftAuditFinding[] = [];

      if (!hook && !body) {
        findings.push(
          mockDr_createFinding(
            "required_text",
            "block",
            "Add a hook or body before this variant can be reviewed.",
          ),
        );
      } else {
        findings.push(
          mockDr_createFinding(
            "required_text",
            "pass",
            "This variant has draft text to review.",
          ),
        );
      }

      if (combined.length > 3000) {
        findings.push(
          mockDr_createFinding(
            "total_length",
            "block",
            "Keep the combined hook, body, CTA, and hashtags under 3,000 characters.",
          ),
        );
      } else {
        findings.push(
          mockDr_createFinding(
            "total_length",
            "pass",
            "This variant stays under the 3,000 character limit.",
          ),
        );
      }

      if (mockDr_hasExternalLink(`${hook} ${body} ${cta}`)) {
        findings.push(
          mockDr_createFinding(
            "external_link",
            "block",
            "Remove external links from the hook, body, and CTA before review.",
          ),
        );
      } else {
        findings.push(
          mockDr_createFinding(
            "external_link",
            "pass",
            "No external link was found in the hook, body, or CTA.",
          ),
        );
      }

      if (mockDr_countHashtags(hashtags) > 5) {
        findings.push(
          mockDr_createFinding(
            "hashtag_limit",
            "block",
            "Use five or fewer hashtags.",
          ),
        );
      } else {
        findings.push(
          mockDr_createFinding(
            "hashtag_limit",
            "pass",
            "This variant uses five or fewer hashtags.",
          ),
        );
      }

      if (
        hook.length < 35 ||
        /^(excited to|in today's|i'm thrilled|quick update)/iu.test(hook)
      ) {
        findings.push(
          mockDr_createFinding(
            "weak_hook",
            "warning",
            "Strengthen the hook with a specific, curiosity-driving opening.",
          ),
        );
      }

      if (
        !/\d/u.test(combinedWithSpaces) &&
        !/\b(i|we|my|our)\b/iu.test(combinedWithSpaces)
      ) {
        findings.push(
          mockDr_createFinding(
            "specificity",
            "warning",
            "Add a number or first-person signal so the draft feels specific.",
          ),
        );
      }

      return findings.sort(
        (left, right) =>
          mockDr_SEVERITY_RANK[left.severity] -
            mockDr_SEVERITY_RANK[right.severity] ||
          left.rule_key.localeCompare(right.rule_key),
      );
    }

    function mockDr_assertCampaignMutableInTransaction(
      campaignId: number,
    ): void {
      const campaigns = mockSqlSelect<CampaignMutationStatusRow>(
        "SELECT status FROM campaigns WHERE id = $1 LIMIT 1",
        [campaignId],
      );
      const campaign = campaigns[0];
      if (campaign === undefined) throw new Error("Campaign was not found");
      if (campaign.status === "archived")
        throw new Error("Campaign is archived");
    }

    function mockDr_insertAuditFindings(
      variantId: number,
      findings: DraftAuditFinding[],
    ): void {
      for (const finding of findings) {
        mockSqlExecute(
          `INSERT INTO draft_audits (draft_variant_id, rule_key, severity, message)
      VALUES ($1, $2, $3, $4)`,
          [variantId, finding.rule_key, finding.severity, finding.message],
        );
      }
    }

    function mockDr_insertDraftInTransaction(input: DraftInsertInput): number {
      const draftResult = mockSqlExecute(
        `INSERT INTO drafts (
      campaign_id, candidate_post_id, angle, notes, content_intent, updated_at
    ) VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
        [
          input.campaignId,
          input.candidateId,
          input.angle,
          input.notes,
          input.contentIntent,
        ],
      );
      const draftId = draftResult.lastInsertId;

      for (const [index, variant] of input.variants.entries()) {
        const variantResult = mockSqlExecute(
          `INSERT INTO draft_variants (
        draft_id, variant_number, hook, body, cta, hashtags, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
          [
            draftId,
            index + 1,
            variant.hook,
            variant.body,
            variant.cta,
            variant.hashtags,
          ],
        );
        mockDr_insertAuditFindings(
          variantResult.lastInsertId,
          mockDr_auditDraftVariant(variant),
        );
      }

      const candidateUpdate = mockSqlExecute(
        `UPDATE candidate_posts
    SET status = 'drafted', updated_at = datetime('now')
    WHERE id = $1 AND campaign_id = $2 AND status IN ('new', 'shortlisted')`,
        [input.candidateId, input.campaignId],
      );
      if (candidateUpdate.rowsAffected !== 1) {
        throw new Error("Candidate is no longer eligible for drafting");
      }
      return draftId;
    }

    function mockDr_getEligibleDraftCandidate(
      candidateId: number,
      campaignId?: number,
      includeGenerationContext = false,
    ): DraftCandidateRow | DraftCandidateContextRow {
      const contextSelect = includeGenerationContext
        ? `,
      c.name AS campaign_name,
      c.product AS campaign_product,
      c.audience AS campaign_audience,
      c.voice AS campaign_voice,
      c.tone AS campaign_tone,
      cp.source_keyword AS candidate_source_keyword,
      cp.score_reason AS candidate_score_reason,
      cp.notes AS candidate_notes,
      cp.relevance_score AS candidate_relevance_score,
      tp.author_name AS target_author_name,
      tp.content AS target_content`
        : "";
      const candidates = mockSqlSelect<DraftCandidateRow>(
        `SELECT
      cp.id AS candidate_id,
      cp.campaign_id,
      c.status AS campaign_status,
      cp.status AS candidate_status
      ${contextSelect}
    FROM candidate_posts cp
    INNER JOIN campaigns c ON c.id = cp.campaign_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    WHERE cp.id = $1
    LIMIT 1`,
        [candidateId],
      );
      const candidate = candidates[0];
      if (candidate === undefined) throw new Error("Candidate was not found");
      if (campaignId !== undefined && candidate.campaign_id !== campaignId) {
        throw new Error("Candidate belongs to a different campaign");
      }
      mockDr_assertCampaignMutableInTransaction(candidate.campaign_id);
      if (candidate.candidate_status === "rejected") {
        throw new Error("Rejected candidates cannot be drafted");
      }
      if (candidate.candidate_status === "drafted") {
        throw new Error("Candidate already has a draft");
      }
      return candidate;
    }

    function mockDr_createDraft(input: CreateDraftInput): number {
      const parsed = input;
      try {
        const candidate = mockDr_getEligibleDraftCandidate(parsed.candidateId);
        const draftId = mockDr_insertDraftInTransaction({
          campaignId: candidate.campaign_id,
          candidateId: parsed.candidateId,
          angle: parsed.angle,
          notes: parsed.notes,
          contentIntent: parsed.contentIntent,
          variants: parsed.variants,
        });
        return draftId;
      } catch (error) {
        throw error;
      }
    }

    function mockDr_updateDraftVariant(input: UpdateDraftVariantInput): void {
      const parsed = input;
      const hasContentUpdate =
        parsed.hook !== undefined ||
        parsed.body !== undefined ||
        parsed.cta !== undefined ||
        parsed.hashtags !== undefined;
      if (!hasContentUpdate) return;
      const updates: string[] = [];
      const values: unknown[] = [];

      function addUpdate(column: string, value: string): void {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      }
      try {
        const currentVariants = mockSqlSelect<DraftVariantRow>(
          `SELECT * FROM draft_variants WHERE id = $1 LIMIT 1`,
          [parsed.id],
        );
        const currentVariant = currentVariants[0];
        if (currentVariant === undefined) {
          throw new Error("Draft variant was not found");
        }

        if (parsed.hook !== undefined && parsed.hook !== currentVariant.hook) {
          addUpdate("hook", parsed.hook);
        }
        if (parsed.body !== undefined && parsed.body !== currentVariant.body) {
          addUpdate("body", parsed.body);
        }
        if (parsed.cta !== undefined && parsed.cta !== currentVariant.cta) {
          addUpdate("cta", parsed.cta);
        }
        if (
          parsed.hashtags !== undefined &&
          parsed.hashtags !== currentVariant.hashtags
        ) {
          addUpdate("hashtags", parsed.hashtags);
        }

        if (updates.length === 0) {
          return;
        }

        values.push(parsed.id);
        mockSqlExecute(
          `UPDATE draft_variants
      SET ${updates.join(", ")},
          updated_at = datetime('now')
      WHERE id = $${values.length}`,
          values,
        );

        const variants = mockSqlSelect<DraftVariantRow>(
          `SELECT * FROM draft_variants WHERE id = $1 LIMIT 1`,
          [parsed.id],
        );
        const variant = variants[0];
        if (variant === undefined)
          throw new Error("Draft variant was not found");

        mockSqlExecute(`DELETE FROM draft_audits WHERE draft_variant_id = $1`, [
          parsed.id,
        ]);
        mockDr_insertAuditFindings(
          parsed.id,
          mockDr_auditDraftVariant(variant),
        );
        mockSqlExecute(
          `UPDATE drafts
      SET updated_at = datetime('now')
      WHERE id = $1`,
          [variant.draft_id],
        );
      } catch (error) {
        throw error;
      }
    }

    function mockDr_setDraftVariantStatus(
      input: SetDraftVariantStatusInput,
    ): void {
      const parsed = input;
      try {
        const variants = mockSqlSelect<DraftVariantRow>(
          `SELECT * FROM draft_variants WHERE id = $1 LIMIT 1`,
          [parsed.id],
        );
        const variant = variants[0];
        if (variant === undefined)
          throw new Error("Draft variant was not found");

        if (parsed.status === "selected") {
          const audits = mockSqlSelect<DraftAuditRow>(
            `SELECT * FROM draft_audits WHERE draft_variant_id = $1`,
            [parsed.id],
          );
          if (audits.some((audit) => audit.severity === "block")) {
            throw new Error("Blocked variants cannot be selected");
          }
          mockSqlExecute(
            `UPDATE draft_variants
        SET status = 'draft', updated_at = datetime('now')
        WHERE draft_id = $1 AND id <> $2`,
            [variant.draft_id, parsed.id],
          );
          mockSqlExecute(
            `UPDATE draft_variants
        SET status = 'selected', updated_at = datetime('now')
        WHERE id = $1`,
            [parsed.id],
          );
          mockSqlExecute(
            `UPDATE drafts
        SET status = 'ready_for_review', updated_at = datetime('now')
        WHERE id = $1`,
            [variant.draft_id],
          );
        } else {
          mockSqlExecute(
            `UPDATE draft_variants
        SET status = $1, updated_at = datetime('now')
        WHERE id = $2`,
            [parsed.status, parsed.id],
          );

          if (parsed.status === "draft") {
            const selectedCounts = mockSqlSelect<SelectedCountRow>(
              `SELECT COUNT(*) AS selected_count
          FROM draft_variants
          WHERE draft_id = $1 AND status = 'selected'`,
              [variant.draft_id],
            );
            if ((selectedCounts[0]?.selected_count ?? 0) === 0) {
              mockSqlExecute(
                `UPDATE drafts
            SET status = 'needs_revision', updated_at = datetime('now')
            WHERE id = $1`,
                [variant.draft_id],
              );
            }
          }
        }
      } catch (error) {
        throw error;
      }
    }

    function mockDr_mapGeneratedVariants(
      value: string,
    ): GeneratedDraftVariant[] {
      try {
        return JSON.parse(value) as GeneratedDraftVariant[];
      } catch {
        return [];
      }
    }

    function mockDr_generatedHashtagsToDraftString(hashtags: string[]): string {
      return hashtags
        .map((hashtag) => hashtag.trim())
        .filter(Boolean)
        .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`))
        .join(" ");
    }

    function mockDr_loadDraftGenerationRequestRow(
      id: number,
    ): DraftGenerationRequestRow {
      const rows = mockSqlSelect<DraftGenerationRequestRow>(
        `SELECT
      dgr.*,
      c.name AS campaign_name,
      cp.source_keyword AS candidate_source_keyword,
      cp.status AS candidate_status,
      cp.relevance_score AS candidate_relevance_score,
      cp.score_reason AS candidate_score_reason,
      cp.notes AS candidate_notes,
      cp.created_at AS candidate_created_at,
      cp.updated_at AS candidate_updated_at,
      tp.id AS target_id,
      tp.platform AS target_platform,
      tp.url AS target_url,
      tp.normalized_url AS target_normalized_url,
      tp.platform_resource_urn AS target_platform_resource_urn,
      tp.author_name AS target_author_name,
      tp.author_profile_url AS target_author_profile_url,
      tp.posted_at AS target_posted_at,
      tp.content AS target_content,
      tp.content_hash AS target_content_hash,
      tp.created_at AS target_created_at,
      tp.updated_at AS target_updated_at
    FROM draft_generation_requests dgr
    INNER JOIN campaigns c ON c.id = dgr.campaign_id
    INNER JOIN candidate_posts cp ON cp.id = dgr.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    WHERE dgr.id = $1
    LIMIT 1`,
        [id],
      );
      const request = rows[0];
      if (request === undefined) {
        throw new Error("Draft generation request was not found");
      }
      return request;
    }

    function mockDr_truncateDraftReference(
      value: string,
      maxLength: number,
    ): string {
      const normalized = value.replace(/\s+/gu, " ").trim();
      if (normalized.length <= maxLength) return normalized;
      return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
    }

    function mockDr_buildDraftGenerationContext(
      parsed: MockDraftClaimInput,
      candidate: DraftCandidateContextRow,
      draftGenerationRequestId: number,
    ): Record<string, unknown> {
      return {
        draftRequest: {
          draftGenerationRequestId,
          campaignId: candidate.campaign_id,
          candidatePostId: parsed.candidateId,
          variantCount: parsed.variantCount,
          contentIntent: parsed.contentIntent,
        },
        referenceData: {
          campaign: {
            name: mockDr_truncateDraftReference(candidate.campaign_name, 160),
            product: mockDr_truncateDraftReference(
              candidate.campaign_product,
              500,
            ),
            audience: mockDr_truncateDraftReference(
              candidate.campaign_audience,
              500,
            ),
            voice: mockDr_truncateDraftReference(candidate.campaign_voice, 500),
            tone: mockDr_truncateDraftReference(candidate.campaign_tone, 500),
          },
          candidate: {
            id: candidate.candidate_id,
            sourceKeyword: mockDr_truncateDraftReference(
              candidate.candidate_source_keyword,
              160,
            ),
            relevanceScore: candidate.candidate_relevance_score,
            scoreReason: mockDr_truncateDraftReference(
              candidate.candidate_score_reason,
              500,
            ),
            notes: mockDr_truncateDraftReference(
              candidate.candidate_notes,
              500,
            ),
            targetAuthorName: mockDr_truncateDraftReference(
              candidate.target_author_name,
              160,
            ),
            targetContent: mockDr_truncateDraftReference(
              candidate.target_content,
              2000,
            ),
          },
        },
      };
    }

    function mockDr_saveGeneratedDraft(input: SaveGeneratedDraftInput): number {
      const parsed = input;
      try {
        const request = mockDr_loadDraftGenerationRequestRow(parsed.id);
        if (request.status !== "generated") {
          throw new Error("Only generated draft requests can be saved");
        }
        mockDr_getEligibleDraftCandidate(
          request.candidate_post_id,
          request.campaign_id,
        );
        const generatedVariants = mockDr_mapGeneratedVariants(
          request.generated_variants_json,
        );
        if (generatedVariants.length !== request.variant_count) {
          throw new Error(
            "Generated request does not have its exact requested variants",
          );
        }
        const linkedScope = mockDr_validateLinkedDraftSaveInTransaction({
          workflowRunId: request.workflow_run_id,
          workflowStepId: request.workflow_step_id,
          campaignId: request.campaign_id,
          candidateId: request.candidate_post_id,
        });
        const draftId = mockDr_insertDraftInTransaction({
          campaignId: request.campaign_id,
          candidateId: request.candidate_post_id,
          angle: request.angle,
          notes: `Generated by ${request.provider_key}/${request.model_name || "default"} from request #${request.id}.`,
          contentIntent: request.content_intent,
          variants: generatedVariants.map((variant) => ({
            hook: variant.hook,
            body: variant.body,
            cta: variant.cta,
            hashtags: mockDr_generatedHashtagsToDraftString(variant.hashtags),
          })),
        });
        const savedResult = mockSqlExecute(
          `UPDATE draft_generation_requests
      SET status = 'saved', created_draft_id = $1, updated_at = datetime('now')
      WHERE id = $2 AND status = 'generated'`,
          [draftId, request.id],
        );
        if (savedResult.rowsAffected !== 1) {
          throw new Error("Draft generation request is no longer saveable");
        }
        if (linkedScope !== null) {
          mockDr_completeLinkedDraftSaveInTransaction({
            ...linkedScope,
            draftId,
            contentIntent: request.content_intent,
          });
        }
        return draftId;
      } catch (error) {
        throw error;
      }
    }

    function mockDr_dismissDraftGenerationRequest(id: number): void {
      const parsed = { id };
      try {
        const request = mockDr_loadDraftGenerationRequestRow(parsed.id);
        const interruptedReason =
          request.status === "pending"
            ? `Draft generation request #${request.id} was dismissed after an interrupted provider call. Generate variants again to retry.`
            : "Draft generation dismissed by operator";

        if (request.status === "pending" && request.agent_run_id !== null) {
          const cancelledRun = mockSqlExecute(
            `UPDATE agent_runs
        SET status = 'cancelled',
          error_message = $1,
          completed_at = COALESCE(completed_at, datetime('now')),
          updated_at = datetime('now')
        WHERE id = $2 AND status IN ('queued', 'running')`,
            [interruptedReason, request.agent_run_id],
          );
          if (cancelledRun.rowsAffected === 1) {
            mockSqlExecute(
              `DELETE FROM agent_run_approval_checkpoints
          WHERE agent_run_id = $1`,
              [request.agent_run_id],
            );
            mockSqlExecute(
              `INSERT INTO agent_run_events (agent_run_id, event_type, summary)
          VALUES ($1, $2, $3)`,
              [request.agent_run_id, "run_cancelled", interruptedReason],
            );
          }
        }

        const dismissedResult = mockSqlExecute(
          `UPDATE draft_generation_requests
      SET status = 'dismissed',
        error_message = CASE WHEN status = 'pending' THEN $1 ELSE error_message END,
        updated_at = datetime('now')
      WHERE id = $2 AND status IN ('generated', 'failed', 'pending')`,
          [interruptedReason, parsed.id],
        );
        if (dismissedResult.rowsAffected === 1 && request.status !== "failed") {
          mockDr_blockLinkedDraftGenerationInTransaction({
            workflowRunId: request.workflow_run_id,
            workflowStepId: request.workflow_step_id,
            campaignId: request.campaign_id,
            candidateId: request.candidate_post_id,
            reason: interruptedReason,
          });
        }
      } catch (error) {
        throw error;
      }
    }

    interface LinkedDraftScopeRow {
      workflow_run_id: number;
      campaign_id: number;
      run_status: WorkflowRunStatus;
      current_step_key: string;
      workflow_step_id: number;
      step_status: WorkflowStepStatus;
      step_title: string;
      candidate_status: CandidateStatus;
      relevance_score: number | null;
      candidate_campaign_id: number;
    }

    interface LinkedDraftGenerationScope {
      workflowRunId: number;
      workflowStepId: number;
    }

    interface LinkedDraftRequestScope {
      workflowRunId: number | null;
      workflowStepId: number | null;
      campaignId: number;
      candidateId: number;
    }

    const mockDr_ELIGIBLE_CANDIDATE_STATUSES: CandidateStatus[] = [
      "new",
      "shortlisted",
    ];

    const mockDr_RESUMABLE_RUN_STATUSES: WorkflowRunStatus[] = [
      "running",
      "blocked",
      "failed",
    ];

    const mockDr_CLAIMABLE_STEP_STATUSES: WorkflowStepStatus[] = [
      "pending",
      "running",
      "blocked",
      "failed",
    ];

    function mockDr_boundWorkflowSummary(value: string): string {
      const normalized = value.replace(/\s+/gu, " ").trim();
      return normalized.length <= 1000
        ? normalized
        : `${normalized.slice(0, 999).trimEnd()}…`;
    }

    function mockDr_loadLinkedDraftScope(input: {
      workflowRunId: number;
      campaignId: number;
      candidateId: number;
    }): LinkedDraftScopeRow {
      const rows = mockSqlSelect<LinkedDraftScopeRow>(
        `SELECT
      wr.id AS workflow_run_id,
      wr.campaign_id,
      wr.status AS run_status,
      wr.current_step_key,
      ws.id AS workflow_step_id,
      ws.status AS step_status,
      ws.title AS step_title,
      cp.status AS candidate_status,
      cp.relevance_score,
      cp.campaign_id AS candidate_campaign_id
    FROM workflow_runs wr
    INNER JOIN workflow_steps ws
      ON ws.workflow_run_id = wr.id AND ws.step_key = 'draft'
    INNER JOIN workflow_artifacts wa
      ON wa.workflow_run_id = wr.id
      AND wa.artifact_type = 'candidate_post'
      AND wa.artifact_id = $1
    INNER JOIN candidate_posts cp ON cp.id = wa.artifact_id
    WHERE wr.id = $2
    LIMIT 1`,
        [input.candidateId, input.workflowRunId],
      );
      const scope = rows[0];
      if (scope === undefined) {
        throw new Error(
          "Workflow has no surviving artifact for this candidate",
        );
      }
      if (
        scope.campaign_id !== input.campaignId ||
        scope.candidate_campaign_id !== input.campaignId
      ) {
        throw new Error(
          "Workflow and candidate must belong to the selected campaign",
        );
      }
      if (scope.current_step_key !== "draft") {
        throw new Error("Workflow is not at its draft step");
      }
      if (!mockDr_RESUMABLE_RUN_STATUSES.includes(scope.run_status)) {
        throw new Error("Workflow is not running or resumable");
      }
      if (!mockDr_CLAIMABLE_STEP_STATUSES.includes(scope.step_status)) {
        throw new Error("Workflow draft step is not eligible for generation");
      }
      if (scope.relevance_score === null) {
        throw new Error("Workflow candidate must have a relevance score");
      }
      if (
        !mockDr_ELIGIBLE_CANDIDATE_STATUSES.includes(scope.candidate_status)
      ) {
        throw new Error("Workflow candidate is not eligible for drafting");
      }
      return scope;
    }

    function mockDr_claimLinkedDraftGenerationInTransaction(input: {
      workflowRunId: number | null;
      campaignId: number;
      candidateId: number;
    }): LinkedDraftGenerationScope | null {
      if (input.workflowRunId === null) return null;
      const scope = mockDr_loadLinkedDraftScope({
        workflowRunId: input.workflowRunId,
        campaignId: input.campaignId,
        candidateId: input.candidateId,
      });
      const eventType =
        scope.step_status === "pending" ? "step_started" : "step_resumed";
      const eventSummary =
        scope.step_status === "pending"
          ? "Draft variants started with a save-gated generation request"
          : "Draft variants resumed with a new save-gated generation request";

      mockSqlExecute(
        `UPDATE workflow_steps
    SET status = 'running',
      output_summary = 'Waiting for operator to save generated variants',
      error_message = '',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
        [scope.workflow_step_id],
      );
      mockSqlExecute(
        `UPDATE workflow_runs
    SET status = 'running',
      current_step_key = 'draft',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
        [scope.workflow_run_id],
      );
      mockSqlExecute(
        `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, $3, $4)`,
        [
          scope.workflow_run_id,
          scope.workflow_step_id,
          eventType,
          eventSummary,
        ],
      );

      return {
        workflowRunId: scope.workflow_run_id,
        workflowStepId: scope.workflow_step_id,
      };
    }

    function mockDr_blockLinkedDraftGenerationInTransaction(
      input: LinkedDraftRequestScope & { reason: string },
    ): void {
      if (input.workflowRunId === null || input.workflowStepId === null) return;
      const summary = mockDr_boundWorkflowSummary(
        input.reason || "Draft generation stopped",
      );
      const rows = mockSqlSelect<{
        step_status: WorkflowStepStatus;
        run_status: WorkflowRunStatus;
        current_step_key: string;
      }>(
        `SELECT
      ws.status AS step_status,
      wr.status AS run_status,
      wr.current_step_key
    FROM workflow_steps ws
    INNER JOIN workflow_runs wr ON wr.id = ws.workflow_run_id
    WHERE ws.id = $1
      AND ws.workflow_run_id = $2
      AND ws.step_key = 'draft'
      AND wr.campaign_id = $3
    LIMIT 1`,
        [input.workflowStepId, input.workflowRunId, input.campaignId],
      );
      const scope = rows[0];
      if (
        scope === undefined ||
        scope.current_step_key !== "draft" ||
        ["completed", "cancelled"].includes(scope.run_status) ||
        ["completed", "skipped"].includes(scope.step_status)
      ) {
        return;
      }

      mockSqlExecute(
        `UPDATE workflow_steps
    SET status = 'blocked',
      output_summary = '',
      error_message = $1,
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $2`,
        [summary, input.workflowStepId],
      );
      mockSqlExecute(
        `UPDATE workflow_runs
    SET status = 'blocked',
      current_step_key = 'draft',
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
        [input.workflowRunId],
      );
      mockSqlExecute(
        `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, 'step_blocked', $3)`,
        [input.workflowRunId, input.workflowStepId, summary],
      );
    }

    function mockDr_validateLinkedDraftSaveInTransaction(
      input: LinkedDraftRequestScope,
    ): LinkedDraftGenerationScope | null {
      if (input.workflowRunId === null && input.workflowStepId === null)
        return null;
      if (input.workflowRunId === null || input.workflowStepId === null) {
        throw new Error(
          "Draft generation request has incomplete workflow provenance",
        );
      }
      const scope = mockDr_loadLinkedDraftScope({
        workflowRunId: input.workflowRunId,
        campaignId: input.campaignId,
        candidateId: input.candidateId,
      });
      if (scope.workflow_step_id !== input.workflowStepId) {
        throw new Error(
          "Draft generation request points to a stale workflow step",
        );
      }
      if (scope.step_status !== "running" || scope.run_status !== "running") {
        throw new Error("Linked workflow draft step must still be running");
      }
      return {
        workflowRunId: scope.workflow_run_id,
        workflowStepId: scope.workflow_step_id,
      };
    }

    function mockDr_completeLinkedDraftSaveInTransaction(
      input: LinkedDraftGenerationScope & {
        draftId: number;
        contentIntent: DraftContentIntent;
      },
    ): void {
      const auditRows = mockSqlSelect<{
        id: number;
        status: WorkflowStepStatus;
        title: string;
      }>(
        `SELECT id, status, title
    FROM workflow_steps
    WHERE workflow_run_id = $1 AND step_key = 'audit'
    LIMIT 1`,
        [input.workflowRunId],
      );
      const auditStep = auditRows[0];
      if (auditStep === undefined || auditStep.status !== "pending") {
        throw new Error("Linked workflow audit step is not ready to advance");
      }

      mockSqlExecute(
        `INSERT INTO workflow_artifacts (
      workflow_run_id, workflow_step_id, artifact_type, artifact_id, summary,
      updated_at
    ) VALUES ($1, $2, 'draft', $3, $4, datetime('now'))`,
        [
          input.workflowRunId,
          input.workflowStepId,
          input.draftId,
          `${input.contentIntent} intent · saved draft`,
        ],
      );
      const completedDraftStep = mockSqlExecute(
        `UPDATE workflow_steps
    SET status = 'completed',
      output_summary = $1,
      error_message = '',
      completed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = $2 AND status = 'running'`,
        ["Generated variants saved by operator", input.workflowStepId],
      );
      if (completedDraftStep.rowsAffected !== 1) {
        throw new Error(
          "Linked workflow draft step changed before save completed",
        );
      }
      const startedAuditStep = mockSqlExecute(
        `UPDATE workflow_steps
    SET status = 'running',
      output_summary = '',
      error_message = '',
      started_at = COALESCE(started_at, datetime('now')),
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1 AND status = 'pending'`,
        [auditStep.id],
      );
      if (startedAuditStep.rowsAffected !== 1) {
        throw new Error(
          "Linked workflow audit step changed before save completed",
        );
      }
      mockSqlExecute(
        `UPDATE workflow_runs
    SET status = 'running',
      current_step_key = 'audit',
      completed_at = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
        [input.workflowRunId],
      );
      mockSqlExecute(
        `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, 'step_completed', 'Draft variants saved by operator')`,
        [input.workflowRunId, input.workflowStepId],
      );
      mockSqlExecute(
        `INSERT INTO workflow_events (
      workflow_run_id, workflow_step_id, event_type, summary
    ) VALUES ($1, $2, 'step_started', 'Audit drafts started')`,
        [input.workflowRunId, auditStep.id],
      );
    }

    function runDraftCommand(
      args: unknown,
      work: (input: never) => unknown,
    ): Promise<unknown> {
      return runNativeMutation(() => work(nativeInput<never>(args)));
    }

    type MockDraftClaimInput = {
      campaignId: number;
      candidateId: number;
      providerKey: string;
      modelName: string;
      playbookKey: string;
      variantCount: number;
      contentIntent: DraftContentIntent;
      workflowRunId?: number;
      angle: string;
      voiceNotes: string;
    };

    /** Mirrors linkgo_draft_generation_claim (old generateDraftVariants claim). */
    function mockDr_claimGeneration(input: MockDraftClaimInput): unknown {
      const candidate = mockDr_getEligibleDraftCandidate(
        input.candidateId,
        input.campaignId,
        true,
      ) as DraftCandidateContextRow;
      const claimed = mockDr_claimLinkedDraftGenerationInTransaction({
        workflowRunId: input.workflowRunId ?? null,
        campaignId: candidate.campaign_id,
        candidateId: input.candidateId,
      });
      const requestResult = mockSqlExecute(
        `INSERT INTO draft_generation_requests (
      campaign_id, candidate_post_id, provider_key, model_name, playbook_key,
      variant_count, content_intent, workflow_run_id, workflow_step_id,
      angle, voice_notes, status, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', datetime('now'))`,
        [
          candidate.campaign_id,
          input.candidateId,
          input.providerKey,
          input.modelName,
          input.playbookKey,
          input.variantCount,
          input.contentIntent,
          claimed?.workflowRunId ?? null,
          claimed?.workflowStepId ?? null,
          input.angle.trim(),
          input.voiceNotes.trim(),
        ],
      );
      const requestId = requestResult.lastInsertId;
      const context = mockDr_buildDraftGenerationContext(
        input as never,
        candidate,
        requestId,
      );
      return {
        requestId,
        campaignId: candidate.campaign_id,
        workflowRunId: claimed?.workflowRunId ?? null,
        candidateContext: context.referenceData,
      };
    }

    function mockDr_linkAgentRun(input: {
      requestId: number;
      agentRunId: number;
    }): unknown {
      const result = mockSqlExecute(
        `UPDATE draft_generation_requests
      SET agent_run_id = $1, updated_at = datetime('now')
      WHERE id = $2 AND status = 'pending'`,
        [input.agentRunId, input.requestId],
      );
      if (result.rowsAffected !== 1) {
        throw new Error(
          "Draft generation request could not be linked to its agent run",
        );
      }
      return { id: input.requestId };
    }

    /** Mirrors linkgo_draft_generation_settle: generated, or failed + blocked. */
    function mockDr_settleGeneration(input: {
      requestId: number;
      failureMessage: string | null;
    }): { status: string; errorMessage: string } {
      const request = mockDr_loadDraftGenerationRequestRow(input.requestId);
      const fail = (
        message: string,
      ): { status: string; errorMessage: string } => {
        const bounded = mockDr_truncateDraftReference(message, 1000);
        const failed = mockSqlExecute(
          `UPDATE draft_generation_requests
        SET status = 'failed', error_message = $1, updated_at = datetime('now')
        WHERE id = $2 AND status = 'pending'`,
          [bounded, input.requestId],
        );
        if (failed.rowsAffected === 1) {
          mockDr_blockLinkedDraftGenerationInTransaction({
            workflowRunId: request.workflow_run_id ?? null,
            workflowStepId: request.workflow_step_id ?? null,
            campaignId: request.campaign_id,
            candidateId: request.candidate_post_id,
            reason: `Draft generation failed: ${bounded}`,
          });
        }
        return { status: "failed", errorMessage: bounded };
      };
      if (input.failureMessage !== null) return fail(input.failureMessage);
      try {
        const toolRows = mockSqlSelect<DraftToolCallRow>(
          `SELECT input_json, output_json
      FROM agent_tool_calls
      WHERE agent_run_id = $1 AND tool_name = 'draft_post' AND status = 'completed'
      ORDER BY id DESC
      LIMIT 2`,
          [request.agent_run_id],
        );
        const toolRow = toolRows[0];
        if (toolRows.length !== 1 || toolRow === undefined) {
          throw new Error(
            "Drafter must return exactly one completed draft_post call",
          );
        }
        const toolInput = JSON.parse(toolRow.input_json) as Record<
          string,
          unknown
        >;
        const output = JSON.parse(toolRow.output_json) as {
          variants: GeneratedDraftVariant[];
          summary?: string;
        };
        if (
          toolInput.draftGenerationRequestId !== input.requestId ||
          toolInput.campaignId !== request.campaign_id ||
          toolInput.candidatePostId !== request.candidate_post_id ||
          toolInput.variantCount !== request.variant_count ||
          toolInput.contentIntent !== request.content_intent
        ) {
          throw new Error(
            "Drafter tool input did not match the durable request",
          );
        }
        if (output.variants.length !== request.variant_count) {
          throw new Error(
            "Drafter output did not contain the requested variant count",
          );
        }
        if (
          JSON.stringify(output.variants) !== JSON.stringify(toolInput.variants)
        ) {
          throw new Error(
            "Drafter output did not preserve provider-authored variants",
          );
        }
        const generated = mockSqlExecute(
          `UPDATE draft_generation_requests
      SET status = 'generated',
        summary = $1,
        generated_variants_json = $2,
        error_message = '',
        updated_at = datetime('now')
      WHERE id = $3 AND status = 'pending'`,
          [
            (output.summary ?? "").trim(),
            JSON.stringify(output.variants),
            input.requestId,
          ],
        );
        if (generated.rowsAffected !== 1) {
          throw new Error("Draft generation request is no longer pending");
        }
        return { status: "generated", errorMessage: "" };
      } catch (caught) {
        return fail(
          caught instanceof Error ? caught.message : "Draft generation failed",
        );
      }
    }

    function mockDraftCommand(
      cmd: string,
      args: unknown,
    ): Promise<unknown> | undefined {
      switch (cmd) {
        case "linkgo_draft_create":
          return runDraftCommand(args, (input: CreateDraftInput) => ({
            id: mockDr_createDraft(input),
          }));
        case "linkgo_draft_variant_update":
          return runDraftCommand(args, (input: UpdateDraftVariantInput) => {
            mockDr_updateDraftVariant(input);
            return { id: input.id };
          });
        case "linkgo_draft_variant_set_status":
          return runDraftCommand(args, (input: SetDraftVariantStatusInput) => {
            mockDr_setDraftVariantStatus(input);
            return { id: input.id };
          });
        case "linkgo_draft_generation_claim":
          return runDraftCommand(args, (input: MockDraftClaimInput) =>
            mockDr_claimGeneration(input),
          );
        case "linkgo_draft_generation_link_agent_run":
          return runDraftCommand(
            args,
            (input: { requestId: number; agentRunId: number }) =>
              mockDr_linkAgentRun(input),
          );
        case "linkgo_draft_generation_settle":
          return runDraftCommand(
            args,
            (input: { requestId: number; failureMessage: string | null }) =>
              mockDr_settleGeneration(input),
          );
        case "linkgo_draft_generation_save":
          return runDraftCommand(args, (input: SaveGeneratedDraftInput) => ({
            id: mockDr_saveGeneratedDraft(input),
          }));
        case "linkgo_draft_generation_dismiss":
          return runDraftCommand(args, (input: { id: number }) => {
            mockDr_dismissDraftGenerationRequest(input.id);
            return { id: input.id };
          });
        default:
          return undefined;
      }
    }

    // ---- Draft AI audits: generated from the pre-step-14 renderer audit
    // code (sync over the SQL emulator); mirrors the native draft_ai_audits
    // commands. Completion reads the auditor's own persisted output. ----
    interface MockAuditPostInput {
      campaignId: number;
      draftVariantId: number;
      contentRevision: number;
      auditRunId: number;
      text: string;
      findings: MockAuditPostOutput["findings"];
    }
    interface MockAuditPostOutput {
      summary: string;
      findings: Array<{
        ruleKey: string;
        severity: DraftAuditSeverity;
        message: string;
      }>;
    }
    type StartDraftAiAuditRunInput = {
      draftVariantId: number;
      contentRevision?: number;
      agentRunId?: number | null;
      providerKey: string;
      modelName: string;
    };
    type MockAuditIdentity = {
      auditRunId: number;
      draftVariantId: number;
      contentRevision: number;
    };
    type CompleteDraftAiAuditRunInput = MockAuditIdentity & {
      summary: string;
      findings: MockAuditPostOutput["findings"];
    };
    type FailDraftAiAuditRunInput = MockAuditIdentity & {
      errorMessage: string;
      agentRunId?: number | null;
    };
    type DraftAiAuditRunProjection = DraftAiAuditRunRow;
    const DRAFT_AI_AUDIT_RESERVATION_STALE_MINUTES = 5;
    const DRAFT_AI_AUDIT_EXECUTION_STALE_MINUTES = 30;
    interface DraftAiAuditSnapshot {
      draft_variant_id: number;
      campaign_id: number;
      content_revision: number;
      hook: string;
      body: string;
      cta: string;
      hashtags: string;
    }
    interface DraftAiAuditRunRow {
      id: number;
      draft_variant_id: number;
      content_revision: number;
      agent_run_id: number | null;
      workflow_step_execution_id: number | null;
      provider_key: DraftAiAuditRun["provider_key"];
      model_name: string;
      status: DraftAiAuditRunStatus;
      summary: string;
      error_message: string;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      updated_at: string;
    }

    interface DraftAuditAgentResultRow {
      status: string;
      error_message: string;
    }

    interface StaleDraftAiAuditRow {
      id: number;
      draft_variant_id: number;
      content_revision: number;
      agent_run_id: number | null;
    }

    interface StaleDraftAuditAgentRow {
      id: number;
    }

    function mockAu_boundDraftAiAuditError(caught: unknown): string {
      const detail =
        caught instanceof Error ? caught.message : "Draft AI audit failed";
      if (detail.length <= 1000) return detail || "Draft AI audit failed";
      return `${detail.slice(0, 999)}…`;
    }

    function mockAu_loadDraftAiAuditSnapshot(
      draftVariantId: number,
    ): DraftAiAuditSnapshot {
      const rows = mockSqlSelect<DraftAiAuditSnapshot>(
        `SELECT
      dv.id AS draft_variant_id,
      d.campaign_id,
      dv.content_revision,
      dv.hook,
      dv.body,
      dv.cta,
      dv.hashtags
    FROM draft_variants dv
    INNER JOIN drafts d ON d.id = dv.draft_id
    WHERE dv.id = $1
    LIMIT 1`,
        [draftVariantId],
      );
      const snapshot = rows[0];
      if (snapshot === undefined)
        throw new Error("Draft variant was not found");
      return snapshot;
    }

    function mockAu_parseCanonicalDraftAuditText(
      snapshot: Pick<
        DraftAiAuditSnapshot,
        "hook" | "body" | "cta" | "hashtags"
      >,
    ): string {
      const canonicalText = mockAu_buildCanonicalDraftAuditText(snapshot);
      if (canonicalText.trim().length === 0)
        throw new Error(
          "Draft AI audit text must contain at least one non-whitespace character",
        );
      if (canonicalText.length > 4306)
        throw new Error("Draft AI audit text must not exceed 4306 characters");
      return canonicalText;
    }

    function mockAu_consumeCompletedDraftAiAuditOutput(
      expected: {
        campaignId: number;
        draftVariantId: number;
        contentRevision: number;
        auditRunId: number;
        text: string;
      },
      agentRunId: number,
    ): MockAuditPostOutput {
      const agentRows = mockSqlSelect<DraftAuditAgentResultRow>(
        "SELECT status, error_message FROM agent_runs WHERE id = $1 LIMIT 1",
        [agentRunId],
      );
      const agent = agentRows[0];
      if (agent === undefined)
        throw new Error("Auditor agent run was not found");
      if (agent.status !== "completed") {
        throw new Error(
          agent.error_message || "Auditor agent did not complete",
        );
      }

      const toolRows = mockSqlSelect<DraftToolCallRow>(
        `SELECT input_json, output_json
    FROM agent_tool_calls
    WHERE agent_run_id = $1
      AND tool_name = 'audit_post'
      AND status = 'completed'
    ORDER BY id DESC
    LIMIT 2`,
        [agentRunId],
      );
      if (toolRows.length !== 1 || toolRows[0] === undefined) {
        throw new Error(
          "Auditor must return exactly one completed audit_post call",
        );
      }

      const toolInput = JSON.parse(
        toolRows[0].input_json,
      ) as MockAuditPostInput;
      if (
        toolInput.campaignId !== expected.campaignId ||
        toolInput.draftVariantId !== expected.draftVariantId ||
        toolInput.contentRevision !== expected.contentRevision ||
        toolInput.auditRunId !== expected.auditRunId ||
        toolInput.text !== expected.text
      ) {
        throw new Error(
          "Auditor tool input did not match the durable audit request",
        );
      }

      const output = JSON.parse(toolRows[0].output_json) as MockAuditPostOutput;
      if (
        JSON.stringify(output.findings) !== JSON.stringify(toolInput.findings)
      ) {
        throw new Error(
          "Auditor output did not preserve provider-authored findings",
        );
      }
      return output;
    }

    function mockAu_linkDraftAiAuditAgentRun(input: {
      auditRunId: number;
      draftVariantId: number;
      contentRevision: number;
      agentRunId: number;
    }): void {
      try {
        const result = mockSqlExecute(
          `UPDATE draft_ai_audit_runs
      SET agent_run_id = $1, updated_at = datetime('now')
      WHERE id = $2
        AND draft_variant_id = $3
        AND content_revision = $4
        AND agent_run_id IS NULL
        AND status IN ('pending', 'running')`,
          [
            input.agentRunId,
            input.auditRunId,
            input.draftVariantId,
            input.contentRevision,
          ],
        );
        if (result.rowsAffected !== 1) {
          throw new Error(
            "Draft AI audit could not be linked to its agent run",
          );
        }
      } catch (error) {
        throw error;
      }
    }

    function mockAu_settleDraftAiAuditFailure(input: {
      auditRunId: number;
      draftVariantId: number;
      contentRevision: number;
      agentRunId: number | null;
      errorMessage: string;
    }): void {
      try {
        const run = mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
        mockAu_assertAuditRunIdentity(run, input);
        const failedAudit = mockSqlExecute(
          `UPDATE draft_ai_audit_runs
      SET status = 'failed',
        error_message = $1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = $2
        AND draft_variant_id = $3
        AND content_revision = $4
        AND status IN ('pending', 'running')`,
          [
            input.errorMessage,
            input.auditRunId,
            input.draftVariantId,
            input.contentRevision,
          ],
        );
        if (failedAudit.rowsAffected !== 1) {
          throw new Error("Draft AI audit run is not active");
        }

        const agentRunId = run.agent_run_id ?? input.agentRunId;
        if (agentRunId !== null) {
          const failedAgent = mockSqlExecute(
            `UPDATE agent_runs
        SET status = 'failed',
          error_message = $1,
          completed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = $2
          AND status IN ('queued', 'running', 'waiting_approval')`,
            [input.errorMessage, agentRunId],
          );
          if (failedAgent.rowsAffected === 1) {
            mockSqlExecute(
              "DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1",
              [agentRunId],
            );
            mockSqlExecute(
              `INSERT INTO agent_run_events (agent_run_id, event_type, summary)
          VALUES ($1, $2, $3)`,
              [agentRunId, "run_failed", input.errorMessage],
            );
          }
        }
      } catch (error) {
        throw error;
      }
    }

    function mockAu_assertAuditRunIdentity(
      run: DraftAiAuditRunRow,
      identity: {
        draftVariantId: number;
        contentRevision: number;
      },
    ): void {
      if (
        run.draft_variant_id !== identity.draftVariantId ||
        run.content_revision !== identity.contentRevision
      ) {
        throw new Error("Draft AI audit run identity does not match");
      }
      if (run.status !== "pending" && run.status !== "running") {
        throw new Error("Draft AI audit run is not active");
      }
    }

    function mockAu_getDraftAiAuditRunInTransaction(
      auditRunId: number,
    ): DraftAiAuditRunRow {
      const rows = mockSqlSelect<DraftAiAuditRunRow>(
        "SELECT * FROM draft_ai_audit_runs WHERE id = $1 LIMIT 1",
        [auditRunId],
      );
      const run = rows[0];
      if (run === undefined)
        throw new Error("Draft AI audit run was not found");
      return run;
    }

    function mockAu_assertDraftRevisionCurrentInTransaction(
      draftVariantId: number,
      contentRevision: number,
      message: string,
    ): void {
      const rows = mockSqlSelect<
        Pick<DraftVariantRow, "id" | "content_revision">
      >(
        "SELECT id, content_revision FROM draft_variants WHERE id = $1 LIMIT 1",
        [draftVariantId],
      );
      const variant = rows[0];
      if (variant === undefined) throw new Error("Draft variant was not found");
      if (variant.content_revision !== contentRevision)
        throw new Error(message);
    }

    function mockAu_buildCanonicalDraftAuditText(
      variant: Pick<DraftAiAuditSnapshot, "hook" | "body" | "cta" | "hashtags">,
    ): string {
      return [variant.hook, variant.body, variant.cta, variant.hashtags]
        .filter((segment) => segment.length > 0)
        .join("\n\n");
    }

    function mockAu_mapDraftAiAuditRun(
      row: DraftAiAuditRunRow,
    ): DraftAiAuditRun {
      return row as DraftAiAuditRunRow;
    }

    function mockAu_startDraftAiAuditRun(
      input: StartDraftAiAuditRunInput,
    ): DraftAiAuditRun {
      const parsed = input;

      try {
        mockAu_assertDraftRevisionCurrentInTransaction(
          parsed.draftVariantId,
          parsed.contentRevision,
          "Draft AI audit must start against the current content revision",
        );
        const activeRuns = mockSqlSelect<DraftAiAuditRunRow>(
          `SELECT * FROM draft_ai_audit_runs
      WHERE draft_variant_id = $1
        AND content_revision = $2
        AND status IN ('pending', 'running')
      LIMIT 1`,
          [parsed.draftVariantId, parsed.contentRevision],
        );
        if (activeRuns.length > 0) {
          throw new Error(
            "An active AI audit already exists for this draft revision",
          );
        }

        const result = mockSqlExecute(
          `INSERT INTO draft_ai_audit_runs (
        draft_variant_id,
        content_revision,
        agent_run_id,
        provider_key,
        model_name,
        status,
        started_at
      ) VALUES ($1, $2, $3, $4, $5, 'running', datetime('now'))`,
          [
            parsed.draftVariantId,
            parsed.contentRevision,
            parsed.agentRunId,
            parsed.providerKey,
            parsed.modelName,
          ],
        );
        const run = mockAu_getDraftAiAuditRunInTransaction(result.lastInsertId);
        return mockAu_mapDraftAiAuditRun(run);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (
          /draft_ai_audit_runs.*UNIQUE|UNIQUE.*draft_ai_audit_runs/iu.test(
            detail,
          )
        ) {
          throw Object.assign(
            new Error(
              "An active AI audit already exists for this draft revision",
            ),
            { cause: error },
          );
        }
        throw error;
      }
    }

    function mockAu_completeDraftAiAuditRun(
      input: CompleteDraftAiAuditRunInput,
    ): void {
      const parsed = input;

      try {
        const run = mockAu_getDraftAiAuditRunInTransaction(parsed.auditRunId);
        mockAu_assertAuditRunIdentity(run, parsed);
        mockAu_assertDraftRevisionCurrentInTransaction(
          parsed.draftVariantId,
          parsed.contentRevision,
          "Draft content changed before the AI audit completed",
        );

        // Refresh deterministic evidence in the same revision-checked transaction.
        // This also gives historical drafts and native rewrites a verifiable audit.
        const variants = mockSqlSelect<DraftVariantRow>(
          `SELECT * FROM draft_variants WHERE id = $1 LIMIT 1`,
          [parsed.draftVariantId],
        );
        const variant = variants[0];
        if (!variant) throw new Error("Draft variant was not found");
        mockSqlExecute(`DELETE FROM draft_audits WHERE draft_variant_id = $1`, [
          parsed.draftVariantId,
        ]);
        mockDr_insertAuditFindings(
          parsed.draftVariantId,
          mockDr_auditDraftVariant(variant),
        );

        for (const finding of parsed.findings) {
          mockSqlExecute(
            `INSERT INTO draft_ai_audit_findings (
          audit_run_id,
          rule_key,
          severity,
          message
        ) VALUES ($1, $2, $3, $4)`,
            [
              parsed.auditRunId,
              finding.ruleKey,
              finding.severity,
              finding.message,
            ],
          );
        }

        const update = mockSqlExecute(
          `UPDATE draft_ai_audit_runs
      SET status = 'completed',
          summary = $1,
          error_message = '',
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = $2
        AND draft_variant_id = $3
        AND content_revision = $4
        AND status IN ('pending', 'running')`,
          [
            parsed.summary,
            parsed.auditRunId,
            parsed.draftVariantId,
            parsed.contentRevision,
          ],
        );
        if (update.rowsAffected !== 1) {
          throw new Error("Draft AI audit run is not active");
        }
      } catch (error) {
        throw error;
      }
    }

    function mockAu_failDraftAiAuditRun(input: FailDraftAiAuditRunInput): void {
      const parsed = input;

      try {
        const run = mockAu_getDraftAiAuditRunInTransaction(parsed.auditRunId);
        mockAu_assertAuditRunIdentity(run, parsed);
        const update = mockSqlExecute(
          `UPDATE draft_ai_audit_runs
      SET status = 'failed',
          error_message = $1,
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = $2
        AND draft_variant_id = $3
        AND content_revision = $4
        AND status IN ('pending', 'running')`,
          [
            parsed.errorMessage,
            parsed.auditRunId,
            parsed.draftVariantId,
            parsed.contentRevision,
          ],
        );
        if (update.rowsAffected !== 1) {
          throw new Error("Draft AI audit run is not active");
        }
      } catch (error) {
        throw error;
      }
    }

    function mockAu_failStaleDraftAuditAgent(
      agentRunId: number,
      errorMessage: string,
    ): { failed: boolean; clearedApprovalCheckpoints: number } {
      const failedAgent = mockSqlExecute(
        `UPDATE agent_runs
    SET status = 'failed',
      error_message = $1,
      completed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = $2
      AND status IN ('queued', 'running', 'waiting_approval')`,
        [errorMessage, agentRunId],
      );
      if (failedAgent.rowsAffected !== 1) {
        return { failed: false, clearedApprovalCheckpoints: 0 };
      }

      const clearedCheckpoints = mockSqlExecute(
        "DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1",
        [agentRunId],
      );
      mockSqlExecute(
        `INSERT INTO agent_run_events (agent_run_id, event_type, summary)
    VALUES ($1, $2, $3)`,
        [agentRunId, "run_failed", errorMessage],
      );
      return {
        failed: true,
        clearedApprovalCheckpoints: clearedCheckpoints.rowsAffected,
      };
    }

    function mockAu_reconcileDraftAiAuditLifecycle(
      input: { maxAuditRuns?: number; maxOrphanAgentRuns?: number } = {},
    ): {
      failedAuditRunIds: number[];
      failedAgentRunIds: number[];
      clearedApprovalCheckpointCount: number;
    } {
      const parsed = {
        maxAuditRuns: input.maxAuditRuns ?? 25,
        maxOrphanAgentRuns: input.maxOrphanAgentRuns ?? 25,
      };
      const failedAuditRunIds: number[] = [];
      const failedAgentRunIds: number[] = [];
      let clearedApprovalCheckpointCount = 0;
      const reservationCutoff = `-${DRAFT_AI_AUDIT_RESERVATION_STALE_MINUTES} minutes`;
      const executionCutoff = `-${DRAFT_AI_AUDIT_EXECUTION_STALE_MINUTES} minutes`;
      try {
        const staleAudits = mockSqlSelect<StaleDraftAiAuditRow>(
          `SELECT
        dar.id,
        dar.draft_variant_id,
        dar.content_revision,
        dar.agent_run_id
      FROM draft_ai_audit_runs dar
      LEFT JOIN agent_runs ar ON ar.id = dar.agent_run_id
      WHERE dar.status IN ('pending', 'running')
        AND dar.workflow_step_execution_id IS NULL
        AND (
          (
            dar.agent_run_id IS NULL
            AND datetime(dar.updated_at) <= datetime('now', $1)
          )
          OR (
            dar.agent_run_id IS NOT NULL
            AND datetime(
              CASE
                WHEN ar.updated_at IS NOT NULL
                  AND datetime(ar.updated_at) > datetime(dar.updated_at)
                  THEN ar.updated_at
                ELSE dar.updated_at
              END
            ) <= datetime('now', $2)
          )
        )
      ORDER BY datetime(dar.updated_at) ASC, dar.id ASC
      LIMIT $3`,
          [reservationCutoff, executionCutoff, parsed.maxAuditRuns],
        );

        for (const audit of staleAudits) {
          const errorMessage =
            audit.agent_run_id === null
              ? `Draft AI audit was interrupted before agent linking and remained reserved for more than ${DRAFT_AI_AUDIT_RESERVATION_STALE_MINUTES} minutes.`
              : `Draft AI audit did not reach terminal settlement within ${DRAFT_AI_AUDIT_EXECUTION_STALE_MINUTES} minutes of its last lifecycle activity.`;
          const failedAudit = mockSqlExecute(
            `UPDATE draft_ai_audit_runs
        SET status = 'failed',
          error_message = $1,
          completed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = $2
          AND draft_variant_id = $3
          AND content_revision = $4
          AND status IN ('pending', 'running')`,
            [
              errorMessage,
              audit.id,
              audit.draft_variant_id,
              audit.content_revision,
            ],
          );
          if (failedAudit.rowsAffected !== 1) continue;
          failedAuditRunIds.push(audit.id);

          if (audit.agent_run_id !== null) {
            const agentResult = mockAu_failStaleDraftAuditAgent(
              audit.agent_run_id,
              errorMessage,
            );
            if (agentResult.failed) failedAgentRunIds.push(audit.agent_run_id);
            clearedApprovalCheckpointCount +=
              agentResult.clearedApprovalCheckpoints;
          }
        }

        const orphanedAgents = mockSqlSelect<StaleDraftAuditAgentRow>(
          `SELECT ar.id
      FROM agent_runs ar
      WHERE ar.agent_role = 'auditor'
        AND ar.workflow_run_id IS NULL
        AND ar.workflow_step_id IS NULL
        AND ar.status IN ('queued', 'running', 'waiting_approval')
        AND datetime(ar.updated_at) <= datetime('now', $1)
        AND json_valid(ar.input_context_json) = 1
        AND json_type(
          ar.input_context_json,
          '$.auditRequest.auditRunId'
        ) = 'integer'
        AND NOT EXISTS (
          SELECT 1
          FROM draft_ai_audit_runs dar
          WHERE dar.agent_run_id = ar.id
        )
      ORDER BY datetime(ar.updated_at) ASC, ar.id ASC
      LIMIT $2`,
          [reservationCutoff, parsed.maxOrphanAgentRuns],
        );

        for (const agent of orphanedAgents) {
          const errorMessage = `Draft AI audit agent was interrupted before linking and remained orphaned for more than ${DRAFT_AI_AUDIT_RESERVATION_STALE_MINUTES} minutes.`;
          const agentResult = mockAu_failStaleDraftAuditAgent(
            agent.id,
            errorMessage,
          );
          if (agentResult.failed) failedAgentRunIds.push(agent.id);
          clearedApprovalCheckpointCount +=
            agentResult.clearedApprovalCheckpoints;
        }
      } catch (error) {
        throw error;
      }

      return {
        failedAuditRunIds,
        failedAgentRunIds,
        clearedApprovalCheckpointCount,
      };
    }

    function runAuditCommand(
      args: unknown,
      work: (input: never) => unknown,
    ): Promise<unknown> {
      return runNativeMutation(() => work(nativeInput<never>(args)));
    }

    function mockAu_currentRevision(draftVariantId: number): number {
      const row = mockSqlSelect<{ content_revision: number }>(
        "SELECT content_revision FROM draft_variants WHERE id = $1 LIMIT 1",
        [draftVariantId],
      )[0];
      if (row === undefined) throw new Error("Draft variant was not found");
      return row.content_revision;
    }

    /** Mirrors linkgo_draft_ai_audit_start: returns run, campaign and text. */
    function mockAu_start(input: StartDraftAiAuditRunInput): unknown {
      const contentRevision =
        input.contentRevision ?? mockAu_currentRevision(input.draftVariantId);
      const snapshot = mockAu_loadDraftAiAuditSnapshot(input.draftVariantId);
      const run = mockAu_startDraftAiAuditRun({ ...input, contentRevision });
      return {
        run,
        campaignId: snapshot.campaign_id,
        text: mockAu_parseCanonicalDraftAuditText(snapshot),
      };
    }

    /** Mirrors linkgo_draft_ai_audit_complete: findings come from storage. */
    function mockAu_complete(input: MockAuditIdentity): unknown {
      const run = mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
      // Like native: the revision check comes before reading auditor output.
      if (
        mockAu_currentRevision(input.draftVariantId) !== input.contentRevision
      )
        throw new Error("Draft content changed before the AI audit completed");
      if (run.agent_run_id === null)
        throw new Error("Draft AI audit run has no auditor agent run");
      const snapshot = mockAu_loadDraftAiAuditSnapshot(input.draftVariantId);
      const output = mockAu_consumeCompletedDraftAiAuditOutput(
        {
          campaignId: snapshot.campaign_id,
          draftVariantId: input.draftVariantId,
          contentRevision: input.contentRevision,
          auditRunId: input.auditRunId,
          text: mockAu_parseCanonicalDraftAuditText(snapshot),
        },
        run.agent_run_id,
      );
      // Like native validate_findings: exactly one per category, stored in
      // category order.
      const ruleOrder = [
        "hook",
        "specificity",
        "generic_language",
        "authenticity",
        "clarity",
        "safety",
      ];
      if (
        output.findings.length !== ruleOrder.length ||
        new Set(output.findings.map((finding) => finding.ruleKey)).size !==
          ruleOrder.length ||
        output.findings.some((finding) => !ruleOrder.includes(finding.ruleKey))
      )
        throw new Error(
          "findings must contain exactly one entry for each required audit category",
        );
      const ordered = [...output.findings].sort(
        (left, right) =>
          ruleOrder.indexOf(left.ruleKey) - ruleOrder.indexOf(right.ruleKey),
      );
      mockAu_completeDraftAiAuditRun({
        ...input,
        summary: output.summary.trim(),
        findings: ordered,
      });
      // Native returns the settled run row.
      return mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
    }

    /** Mirrors linkgo_draft_ai_audit_fail (a linked agent fails with it). */
    function mockAu_fail(input: FailDraftAiAuditRunInput): unknown {
      if (input.agentRunId !== undefined && input.agentRunId !== null) {
        mockAu_settleDraftAiAuditFailure({
          auditRunId: input.auditRunId,
          draftVariantId: input.draftVariantId,
          contentRevision: input.contentRevision,
          agentRunId: input.agentRunId,
          errorMessage: input.errorMessage,
        });
        return mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
      }
      mockAu_failDraftAiAuditRun(input);
      return mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
    }

    /**
     * Test-only: stands in for a finished auditor agent run. Creates a completed
     * auditor agent with one completed audit_post call that answers the run's
     * durable request (findings authored in the input, preserved in the output)
     * and links it, so completion reads the auditor's own output like native.
     */
    function mockAu_recordAuditorOutput(input: {
      auditRunId: number;
      summary?: string;
      findings: MockAuditPostOutput["findings"];
      text?: string;
      outputFindings?: MockAuditPostOutput["findings"];
    }): unknown {
      const run = mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
      if (run.agent_run_id !== null) {
        // Already linked: replace that auditor's recorded audit_post output.
        const linkedAgentId = run.agent_run_id;
        const snapshotForRetry = mockAu_loadDraftAiAuditSnapshot(
          run.draft_variant_id,
        );
        const retryRequest = {
          campaignId: snapshotForRetry.campaign_id,
          draftVariantId: run.draft_variant_id,
          contentRevision: run.content_revision,
          auditRunId: run.id,
          text:
            input.text ?? mockAu_parseCanonicalDraftAuditText(snapshotForRetry),
        };
        const call = agentToolCalls.find(
          (row) =>
            row.agent_run_id === linkedAgentId &&
            row.tool_name === "audit_post",
        );
        if (call === undefined)
          throw new Error("Linked auditor has no audit_post call");
        call.input_json = JSON.stringify({
          ...retryRequest,
          findings: input.findings,
        });
        call.output_json = JSON.stringify({
          summary: input.summary ?? "",
          findings: input.outputFindings ?? input.findings,
        });
        return { agentRunId: linkedAgentId };
      }
      const snapshot = mockAu_loadDraftAiAuditSnapshot(run.draft_variant_id);
      const now = getNow();
      const agentRunId = nextAgentRunId;
      nextAgentRunId += 1;
      const request = {
        campaignId: snapshot.campaign_id,
        draftVariantId: run.draft_variant_id,
        contentRevision: run.content_revision,
        auditRunId: run.id,
        text: input.text ?? mockAu_parseCanonicalDraftAuditText(snapshot),
      };
      agentRuns.push({
        id: agentRunId,
        campaign_id: snapshot.campaign_id,
        workflow_run_id: null,
        workflow_step_id: null,
        agent_role: "auditor",
        provider_key: run.provider_key,
        model_name: run.model_name,
        playbook_key: "linkedin_humanizer",
        status: "completed",
        input_summary: "Audit draft variant #" + String(run.draft_variant_id),
        input_context_json: JSON.stringify({ auditRequest: request }),
        output_summary: input.summary ?? "",
        error_message: "",
        iteration_count: 1,
        started_at: now,
        completed_at: now,
        created_at: now,
        updated_at: now,
      } as AgentRun);
      agentToolCalls.push({
        id: nextAgentToolCallId,
        agent_run_id: agentRunId,
        provider_tool_call_id: "audit-" + String(run.id),
        tool_name: "audit_post",
        status: "completed",
        requires_approval: 0,
        input_json: JSON.stringify({ ...request, findings: input.findings }),
        output_json: JSON.stringify({
          summary: input.summary ?? "",
          findings: input.outputFindings ?? input.findings,
        }),
        error_message: "",
        started_at: now,
        completed_at: now,
        created_at: now,
      } as AgentToolCall);
      nextAgentToolCallId += 1;
      // Linking requires the reserved revision; a stale run is left unlinked so
      // completion reports the stale revision, as native does.
      if (mockAu_currentRevision(run.draft_variant_id) === run.content_revision)
        mockAu_linkDraftAiAuditAgentRun({
          auditRunId: run.id,
          draftVariantId: run.draft_variant_id,
          contentRevision: run.content_revision,
          agentRunId,
        });
      return { agentRunId };
    }

    function mockAuditCommand(
      cmd: string,
      args: unknown,
    ): Promise<unknown> | undefined {
      switch (cmd) {
        case "linkgo_test_record_auditor_output":
          return runAuditCommand(
            args,
            (input: Parameters<typeof mockAu_recordAuditorOutput>[0]) =>
              mockAu_recordAuditorOutput(input),
          );
        case "linkgo_draft_ai_audit_start":
          return runAuditCommand(args, (input: StartDraftAiAuditRunInput) =>
            mockAu_start(input),
          );
        case "linkgo_draft_ai_audit_link_agent_run":
          return runAuditCommand(
            args,
            (input: { auditRunId: number; agentRunId: number }) => {
              const run = mockAu_getDraftAiAuditRunInTransaction(
                input.auditRunId,
              );
              mockAu_linkDraftAiAuditAgentRun({
                auditRunId: run.id,
                draftVariantId: run.draft_variant_id,
                contentRevision: run.content_revision,
                agentRunId: input.agentRunId,
              });
              return mockAu_getDraftAiAuditRunInTransaction(input.auditRunId);
            },
          );
        case "linkgo_draft_ai_audit_complete":
          return runAuditCommand(args, (input: MockAuditIdentity) =>
            mockAu_complete(input),
          );
        case "linkgo_draft_ai_audit_fail":
          return runAuditCommand(args, (input: FailDraftAiAuditRunInput) =>
            mockAu_fail(input),
          );
        case "linkgo_draft_ai_audit_reconcile":
          return runAuditCommand(
            args,
            (input: { maxAuditRuns?: number; maxOrphanAgentRuns?: number }) =>
              mockAu_reconcileDraftAiAuditLifecycle(input),
          );
        default:
          return undefined;
      }
    }

    /** Candidate insert shared by manual create and source imports. */
    function mockInsertCandidate(raw: MockCandidateInput): number {
      {
        const input = {
          ...raw,
          normalizedUrl: mockNormalizeUrl(raw.url, false),
          authorName: raw.authorName ?? "",
          authorProfileUrl: raw.authorProfileUrl ?? "",
          postedAt: raw.postedAt ?? null,
          sourceKeyword: raw.sourceKeyword ?? "",
          relevanceScore: raw.relevanceScore ?? null,
          scoreReason: raw.scoreReason ?? "",
          notes: raw.notes ?? "",
        };
        mockAssertCandidateCampaignCanMutate(input.campaignId);
        const contentHash = mockContentHash(input.content);
        const urn =
          (input.platformResourceUrn ?? "").trim() ||
          mockResolveLinkedInTargetUrn(input.url);
        const duplicate = mockSqlSelect(
          `SELECT id FROM dedupe_keys WHERE campaign_id = $1 AND ((key_type = 'normalized_url' AND key_value = $2) OR (key_type = 'content_hash' AND key_value = $3)) LIMIT 1`,
          [input.campaignId, input.normalizedUrl, contentHash],
        );
        if (duplicate.length > 0)
          throw new Error("Candidate already exists for this campaign");
        const target = mockSqlSelect<{ id: number }>(
          `SELECT * FROM target_posts WHERE platform = 'linkedin' AND (normalized_url = $1 OR content_hash = $2) ORDER BY normalized_url = $1 DESC, id ASC LIMIT 1`,
          [input.normalizedUrl, contentHash],
        )[0];
        const targetPostId =
          target?.id ??
          mockSqlExecute(
            `INSERT INTO target_posts (platform, url, normalized_url, author_name, author_profile_url, platform_resource_urn, posted_at, content, content_hash, updated_at) VALUES ('linkedin', $1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
            [
              input.url,
              input.normalizedUrl,
              input.authorName,
              input.authorProfileUrl,
              urn,
              input.postedAt,
              input.content,
              contentHash,
            ],
          ).lastInsertId;
        const candidateId = mockSqlExecute(
          `INSERT INTO candidate_posts (campaign_id, target_post_id, source_keyword, relevance_score, score_reason, notes, updated_at) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
          [
            input.campaignId,
            targetPostId,
            input.sourceKeyword,
            input.relevanceScore,
            input.scoreReason,
            input.notes,
          ],
        ).lastInsertId;
        mockSqlExecute(
          `INSERT INTO dedupe_keys (campaign_id, key_type, key_value, candidate_post_id) VALUES ($1, 'normalized_url', $2, $3)`,
          [input.campaignId, input.normalizedUrl, candidateId],
        );
        mockSqlExecute(
          `INSERT INTO dedupe_keys (campaign_id, key_type, key_value, candidate_post_id) VALUES ($1, 'content_hash', $2, $3)`,
          [input.campaignId, contentHash, candidateId],
        );
        return candidateId;
      }
    }

    function promoteDiscoveryItemCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{ id: number; campaignId: number }>(args);
        mockAssertCandidateCampaignCanMutate(input.campaignId);
        const item = candidateDiscoveryItems.find(
          (row) => row.id === input.id && row.campaign_id === input.campaignId,
        );
        if (!item) throw new Error("Discovery suggestion was not found");
        const keyword = item.kind === "keyword" ? item.keyword.trim() : "";
        if (keyword)
          mockSqlExecute(
            `INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source) VALUES ($1, $2, $3)`,
            [input.campaignId, keyword, "generated"],
          );
        const updated = mockSqlExecute(
          `UPDATE candidate_discovery_items SET status = 'promoted', updated_at = datetime('now') WHERE id = $1 AND campaign_id = $2`,
          [input.id, input.campaignId],
        );
        if (updated.rowsAffected !== 1)
          throw new Error("Discovery suggestion was not found");
        return { id: input.id };
      });
    }

    function boundMockWorkflowSummary(value: string): string {
      const normalized = value.replace(/\s+/gu, " ").trim();
      return normalized.length <= 1000
        ? normalized
        : `${normalized.slice(0, 999).trimEnd()}…`;
    }

    function deleteCandidateCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const { id } = nativeInput<{ id: number }>(args);
        const requests = mockSqlSelect<{
          request_id: number;
          request_status: string;
          agent_run_id: number | null;
          campaign_id: number;
          workflow_run_id: number | null;
          workflow_step_id: number | null;
          run_status: string | null;
          current_step_key: string | null;
          step_status: string | null;
        }>(
          `SELECT dgr.id AS request_id, dgr.status AS request_status, dgr.agent_run_id, dgr.campaign_id, dgr.workflow_run_id, dgr.workflow_step_id, wr.status AS run_status, wr.current_step_key, ws.status AS step_status FROM draft_generation_requests dgr LEFT JOIN workflow_runs wr ON wr.id = dgr.workflow_run_id LEFT JOIN workflow_steps ws ON ws.id = dgr.workflow_step_id AND ws.workflow_run_id = dgr.workflow_run_id AND ws.step_key = 'draft' WHERE dgr.candidate_post_id = $1 AND dgr.status IN ('pending', 'generated') AND ( dgr.workflow_run_id IS NOT NULL OR dgr.workflow_step_id IS NOT NULL ) ORDER BY dgr.id ASC`,
          [id],
        );
        for (const request of requests) {
          const active =
            request.workflow_run_id !== null &&
            request.workflow_step_id !== null &&
            request.current_step_key === "draft" &&
            ["running", "blocked", "failed"].includes(
              request.run_status ?? "",
            ) &&
            ["pending", "running", "blocked", "failed"].includes(
              request.step_status ?? "",
            );
          if (!active)
            throw new Error(
              `Candidate cannot be deleted because linked draft request #${request.request_id} is not attached to an active draft workflow step. Resolve the request from Drafts first.`,
            );
          const reason = boundMockWorkflowSummary(
            `Candidate #${id} was deleted. Linked draft request #${request.request_id} was removed, and the candidate remains recorded as a removed workflow artifact.`,
          );
          if (
            request.request_status === "pending" &&
            request.agent_run_id !== null
          ) {
            const cancelled = mockSqlExecute(
              `UPDATE agent_runs SET status = 'cancelled', error_message = $1, completed_at = COALESCE(completed_at, datetime('now')), updated_at = datetime('now') WHERE id = $2 AND status IN ('queued', 'running')`,
              [reason, request.agent_run_id],
            );
            if (cancelled.rowsAffected === 1) {
              mockSqlExecute(
                `DELETE FROM agent_run_approval_checkpoints WHERE agent_run_id = $1`,
                [request.agent_run_id],
              );
              mockSqlExecute(
                `INSERT INTO agent_run_events (agent_run_id, event_type, summary) VALUES ($1, 'run_cancelled', $2)`,
                [request.agent_run_id, reason],
              );
            }
          }
          const dismissed = mockSqlExecute(
            `UPDATE draft_generation_requests SET status = 'dismissed', error_message = $1, updated_at = datetime('now') WHERE id = $2 AND status IN ('pending', 'generated')`,
            [reason, request.request_id],
          );
          if (dismissed.rowsAffected !== 1)
            throw new Error(
              `Linked draft request #${request.request_id} changed before candidate deletion`,
            );
          const run = workflowRuns.find(
            (row) => row.id === request.workflow_run_id,
          );
          const step = workflowSteps.find(
            (row) =>
              row.id === request.workflow_step_id &&
              row.workflow_run_id === request.workflow_run_id &&
              row.step_key === "draft",
          );
          if (
            run &&
            step &&
            run.campaign_id === request.campaign_id &&
            run.current_step_key === "draft" &&
            !["completed", "cancelled"].includes(run.status) &&
            !["completed", "skipped"].includes(step.status)
          ) {
            mockSqlExecute(
              `UPDATE workflow_steps SET status = 'blocked', output_summary = '', error_message = $1, completed_at = NULL, updated_at = datetime('now') WHERE id = $2`,
              [reason, step.id],
            );
            mockSqlExecute(
              `UPDATE workflow_runs SET status = 'blocked', current_step_key = 'draft', completed_at = NULL, updated_at = datetime('now') WHERE id = $1`,
              [run.id],
            );
            mockSqlExecute(
              `INSERT INTO workflow_events ( workflow_run_id, workflow_step_id, event_type, summary ) VALUES ($1, $2, 'step_blocked', $3)`,
              [run.id, step.id, reason],
            );
          }
        }
        mockSqlExecute(`DELETE FROM dedupe_keys WHERE candidate_post_id = $1`, [
          id,
        ]);
        const deleted = mockSqlExecute(
          `DELETE FROM candidate_posts WHERE id = $1`,
          [id],
        );
        if (deleted.rowsAffected !== 1)
          throw new Error("Candidate was not found");
        return { id };
      });
    }

    function updateCandidatePolicyCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => {
        const input = nativeInput<{
          campaignId: number;
          maxPostAgeDays: number;
          bannedTopics: string[];
        }>(args);
        const campaign = campaigns.find((row) => row.id === input.campaignId);
        if (!campaign) throw new Error("Campaign was not found");
        if (campaign.status === "archived")
          throw new Error("Campaign is archived");
        if (w.__LINKGO_FAIL_CANDIDATE_POLICY_SAVE__ === true) {
          w.__LINKGO_FAIL_CANDIDATE_POLICY_SAVE__ = undefined;
          throw new Error("Injected candidate policy save failure");
        }
        const now = getNow();
        let policy = candidateIntakePolicies.find(
          (row) => row.campaign_id === input.campaignId,
        );
        if (policy) {
          policy.max_post_age_days = input.maxPostAgeDays;
          policy.updated_at = now;
        } else {
          policy = {
            campaign_id: input.campaignId,
            max_post_age_days: input.maxPostAgeDays,
            created_at: now,
            updated_at: now,
          };
          candidateIntakePolicies.push(policy);
        }
        restoreRows(
          candidatePolicyBannedTopics,
          candidatePolicyBannedTopics.filter(
            (row) => row.campaign_id !== input.campaignId,
          ),
        );
        const topics = input.bannedTopics.map((topic) =>
          topic.trim().replace(/\s+/gu, " "),
        );
        for (const topic of topics) {
          candidatePolicyBannedTopics.push({
            id: nextCandidatePolicyBannedTopicId,
            campaign_id: input.campaignId,
            topic,
            normalized_topic: topic.toLowerCase(),
            created_at: now,
          });
          nextCandidatePolicyBannedTopicId += 1;
        }
        return {
          campaign_id: input.campaignId,
          max_post_age_days: policy.max_post_age_days,
          banned_topics: topics,
          created_at: policy.created_at,
          updated_at: policy.updated_at,
        };
      });
    }

    /**
     * Mirrors `candidate_queue_store.rs` and `source_import_reads.rs`.
     * Returns `undefined` for commands it does not own.
     */
    function mockCandidateQueueCommand(
      cmd: string,
      args: unknown,
    ): Promise<unknown> | undefined {
      const assertCampaignCanMutate = (campaignId: number): void => {
        const campaign = campaigns.find((row) => row.id === campaignId);
        if (!campaign) throw new Error("Campaign was not found");
        if (campaign.status === "archived")
          throw new Error("Campaign is archived");
      };
      const compact = (value: string | undefined, max: number): string =>
        (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);

      if (cmd === "linkgo_candidate_list") {
        const input = nativeInput<{ campaignId?: number }>(args);
        const matches = selectCandidateJoin(
          input.campaignId === undefined ? [] : [input.campaignId],
        );
        // Mirrors `candidate_queue_store::CandidateListPage`.
        return withCampaignGate(input.campaignId, {
          rows: matches.slice(0, 500),
          totalCount: matches.length,
        });
      }
      if (cmd === "linkgo_candidate_discovery_list") {
        const input = nativeInput<{ campaignId: number }>(args);
        const rows = candidateDiscoveryItems
          .filter(
            (item) =>
              item.campaign_id === input.campaignId &&
              item.status !== "dismissed",
          )
          .sort((left, right) => {
            const promoted =
              (left.status === "promoted" ? 1 : 0) -
              (right.status === "promoted" ? 1 : 0);
            if (promoted !== 0) return promoted;
            const confidence =
              (right.confidence_score ?? -1) - (left.confidence_score ?? -1);
            if (confidence !== 0) return confidence;
            return (
              right.updated_at.localeCompare(left.updated_at) ||
              right.id - left.id
            );
          })
          .slice(0, 200)
          .map((item) => ({ ...item }));
        return withCampaignGate(input.campaignId, rows);
      }
      if (cmd === "linkgo_candidate_agent_run_context") {
        return runNativeMutation(() => {
          const input = nativeInput<{ campaignId: number }>(args);
          assertCampaignCanMutate(input.campaignId);
          return {
            seedKeywords: keywords
              .filter((row) => row.campaign_id === input.campaignId)
              .map((row) => row.keyword)
              .sort()
              .slice(0, 12),
            scoringCandidateIds: candidatePosts
              .filter(
                (row) =>
                  row.campaign_id === input.campaignId &&
                  row.status === "new" &&
                  row.relevance_score === null,
              )
              .sort(
                (left, right) =>
                  left.created_at.localeCompare(right.created_at) ||
                  left.id - right.id,
              )
              .slice(0, 50)
              .map((row) => row.id),
          };
        });
      }
      if (cmd === "linkgo_candidate_update") {
        return runNativeMutation(() => {
          const input = nativeInput<{
            id: number;
            status?: CandidateStatus;
            relevanceScore?: number | null;
            scoreReason?: string;
            notes?: string;
          }>(args);
          const candidate = candidatePosts.find((row) => row.id === input.id);
          const changed =
            input.status !== undefined ||
            input.relevanceScore !== undefined ||
            input.scoreReason !== undefined ||
            input.notes !== undefined;
          if (!candidate || !changed) return null;
          if (input.status !== undefined) candidate.status = input.status;
          if (input.relevanceScore !== undefined)
            candidate.relevance_score = input.relevanceScore;
          if (input.scoreReason !== undefined)
            candidate.score_reason = input.scoreReason.trim();
          if (input.notes !== undefined) candidate.notes = input.notes.trim();
          candidate.updated_at = getNow();
          return null;
        });
      }
      if (cmd === "linkgo_candidate_dismiss_discovery_item") {
        return runNativeMutation(() => {
          const input = nativeInput<{ id: number; campaignId: number }>(args);
          assertCampaignCanMutate(input.campaignId);
          if (w.__LINKGO_FAIL_DISCOVERY_STATUS_UPDATE__) {
            w.__LINKGO_FAIL_DISCOVERY_STATUS_UPDATE__ = undefined;
            throw new Error("Injected discovery status update failure");
          }
          const item = candidateDiscoveryItems.find(
            (row) =>
              row.id === input.id && row.campaign_id === input.campaignId,
          );
          if (!item) throw new Error("Discovery suggestion was not found");
          item.status = "dismissed";
          item.updated_at = getNow();
          return null;
        });
      }
      if (cmd === "linkgo_candidate_discovery_insert") {
        return runNativeMutation(() => {
          const input = nativeInput<{
            campaignId: number;
            agentRunId: number;
            workflowRunId?: number | null;
            suggestions: Array<{
              kind: CandidateDiscoveryItem["kind"];
              title?: string;
              keyword?: string;
              rationale?: string;
              sourceKeyword?: string;
              confidenceScore?: number | null;
            }>;
          }>(args);
          assertCampaignCanMutate(input.campaignId);
          const saved: CandidateDiscoveryItem[] = [];
          const seen = new Set<string>();
          for (const suggestion of input.suggestions.slice(0, 25)) {
            const title = compact(suggestion.title, 160);
            const keyword = compact(suggestion.keyword, 80);
            if (!title && !keyword) continue;
            const key = `${suggestion.kind}:${keyword.toLocaleLowerCase()}:${title.toLocaleLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const existing = candidateDiscoveryItems.find(
              (item) =>
                item.campaign_id === input.campaignId &&
                item.kind === suggestion.kind &&
                item.keyword === keyword &&
                item.title === title &&
                item.status !== "dismissed",
            );
            if (existing) {
              saved.push({ ...existing });
              continue;
            }
            const now = getNow();
            const item: CandidateDiscoveryItem = {
              id: nextCandidateDiscoveryItemId,
              campaign_id: input.campaignId,
              agent_run_id: input.agentRunId,
              workflow_run_id: input.workflowRunId ?? null,
              kind: suggestion.kind,
              title,
              keyword,
              rationale: compact(suggestion.rationale, 500),
              source_keyword: compact(suggestion.sourceKeyword, 80),
              confidence_score: suggestion.confidenceScore ?? null,
              status: "suggested",
              created_at: now,
              updated_at: now,
            };
            nextCandidateDiscoveryItemId += 1;
            candidateDiscoveryItems.push(item);
            saved.push({ ...item });
          }
          return saved;
        });
      }
      if (cmd === "linkgo_source_import_dashboard") {
        const input = nativeInput<{ campaignId: number }>(args);
        const batches = sourceImportBatches
          .filter((batch) => batch.campaign_id === input.campaignId)
          .sort(
            (left, right) =>
              right.created_at.localeCompare(left.created_at) ||
              right.id - left.id,
          )
          .slice(0, 10)
          .map((batch) => ({
            ...batch,
            items: sourceImportItems
              .filter((item) => item.source_import_batch_id === batch.id)
              .sort((left, right) => left.row_number - right.row_number)
              .slice(0, 50)
              .map((item) => ({ ...item })),
          }));
        return withCampaignGate(input.campaignId, batches);
      }
      return undefined;
    }

    /** Mirrors `candidate_policy::get_policy` (defaults when unsaved). */
    function getCandidatePolicyCommand(args: unknown): Promise<unknown> {
      const input = nativeInput<{ campaignId: number }>(args);
      if (!Number.isInteger(input.campaignId) || input.campaignId <= 0)
        return Promise.reject(
          new Error("Campaign id must be a positive integer"),
        );
      if (w.__LINKGO_FAIL_CANDIDATE_POLICY_POST_COMMIT_LOAD__ === true) {
        w.__LINKGO_FAIL_CANDIDATE_POLICY_POST_COMMIT_LOAD__ = undefined;
        return Promise.reject(
          new Error("Injected post-commit policy load failure"),
        );
      }
      const policy = candidateIntakePolicies.find(
        (row) => row.campaign_id === input.campaignId,
      );
      return Promise.resolve({
        campaign_id: input.campaignId,
        max_post_age_days: policy?.max_post_age_days ?? 30,
        banned_topics: candidatePolicyBannedTopics
          .filter((topic) => topic.campaign_id === input.campaignId)
          .sort((left, right) => left.id - right.id)
          .map((topic) => topic.topic),
        created_at: policy?.created_at ?? null,
        updated_at: policy?.updated_at ?? null,
      });
    }

    /** Mirrors `safety_dashboard::get_safety_dashboard` (lists capped at 50). */
    /** Mirrors native `linkgo_scheduler_dashboard_get` (one snapshot, capped lists). */
    function getSchedulerDashboardCommand(args: unknown): Promise<unknown> {
      const input = nativeInput<{ campaignId?: number }>(args);
      const campaignId = input.campaignId ?? null;
      if (
        campaignId !== null &&
        (!Number.isInteger(campaignId) || campaignId <= 0)
      ) {
        return Promise.reject(
          new Error("Campaign id must be a positive integer"),
        );
      }
      const values = campaignId === null ? [] : [campaignId];
      const inCampaign = (job: ScheduleJob): boolean =>
        campaignId === null ||
        scheduleApproval(job)?.campaign_id === campaignId;
      const pendingJobs = scheduleJobs.filter(
        (job) =>
          job.status === "scheduled" &&
          scheduleApproval(job) !== undefined &&
          inCampaign(job),
      );
      const nowMs = Date.now();
      const recentAttempts = (
        selectSchedulerPublishAttempts(values) as Array<
          PublishAttempt & {
            campaign_id: number | null;
            campaign_name: string | null;
          }
        >
      ).map((attempt) => ({
        id: attempt.id,
        approval_id: attempt.approval_id,
        schedule_job_id: attempt.schedule_job_id,
        platform: attempt.platform,
        status: attempt.status,
        external_post_url: attempt.external_post_url,
        platform_post_id: attempt.platform_post_id,
        error_message: attempt.error_message,
        created_at: attempt.created_at,
        campaign_id: attempt.campaign_id,
        campaign_name: attempt.campaign_name,
      }));
      return Promise.resolve({
        settings: { ...schedulerSettings },
        summary: {
          pendingJobs: pendingJobs.length,
          dueJobs: pendingJobs.filter(
            (job) =>
              dateMs(job.scheduled_for) <= nowMs &&
              (job.next_attempt_at === null ||
                dateMs(job.next_attempt_at) <= nowMs),
          ).length,
          failedJobs: scheduleJobs.filter(
            (job) =>
              job.status === "failed" &&
              scheduleApproval(job) !== undefined &&
              inCampaign(job),
          ).length,
          recentAttempts: recentAttempts.length,
        },
        dueJobs: selectSchedulerDueJobs(values),
        recentEvents: (
          selectSchedulerEvents(values) as Array<
            SchedulerEvent & { campaign_name: string | null }
          >
        ).map((event) => ({
          id: event.id,
          campaign_id: event.campaign_id,
          approval_id: event.approval_id,
          schedule_job_id: event.schedule_job_id,
          event_type: event.event_type,
          severity: event.severity,
          summary: event.summary,
          metadata_json: event.metadata_json,
          created_at: event.created_at,
          campaign_name: event.campaign_name,
        })),
        recentAttempts,
        globalKillSwitchEnabled: safetySettings.global_kill_switch === 1,
        killSwitchReason: safetySettings.kill_switch_reason,
      });
    }

    function getSafetyDashboardCommand(args: unknown): Promise<unknown> {
      const input = nativeInput<{ campaignId?: number }>(args);
      const campaignId = input.campaignId ?? null;
      const matches = (id: number | null): boolean =>
        campaignId === null || id === campaignId;
      const newestFirst = <T extends { id: number; created_at: string }>(
        rows: T[],
      ): T[] =>
        [...rows]
          .sort(
            (left, right) =>
              right.created_at.localeCompare(left.created_at) ||
              right.id - left.id,
          )
          .slice(0, 50);
      const rateLimits = rateLimitEvents.filter((event) =>
        matches(event.campaign_id),
      );
      const audits = safetyAuditEvents.filter((event) =>
        matches(event.campaign_id),
      );
      // Like the previous SQL mock, fixtures are treated as "today".
      const countToday = (decision: string): number =>
        rateLimits.filter((event) => event.decision === decision).length;
      return Promise.resolve({
        settings: { ...safetySettings },
        summary: {
          openErrors: errorQueueItems.filter(
            (item) =>
              matches(item.campaign_id) &&
              ["open", "in_progress", "awaiting_review"].includes(item.status),
          ).length,
          blockedToday: countToday("blocked"),
          allowedToday: countToday("allowed"),
          auditEvents: audits.length,
        },
        errorQueueItems: selectSafetyErrorQueue(
          campaignId === null ? [] : [campaignId],
        ).slice(0, 50),
        rateLimitEvents: newestFirst(rateLimits),
        auditEvents: newestFirst(audits),
      });
    }

    function recordNativeCampaignCall(cmd: string, args: unknown): void {
      const calls = (w.__LINKGO_NATIVE_CAMPAIGN_CALLS__ ??= []) as Array<{
        cmd: string;
        input: unknown;
      }>;
      calls.push({ cmd, input: nativeInput<unknown>(args) });
    }

    function uniqueMockCampaignKeywords(values: string[]): string[] {
      const seen = new Set<string>();
      return values
        .map((keyword) => keyword.trim())
        .filter((keyword) => {
          if (!keyword) return false;
          const key = keyword.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function insertMockCampaignKeyword(
      campaignId: number,
      keyword: string,
      source: Keyword["source"],
    ): void {
      if (
        keywords.some(
          (row) => row.campaign_id === campaignId && row.keyword === keyword,
        )
      )
        return;
      keywords.push({
        id: nextKeywordId,
        campaign_id: campaignId,
        keyword,
        source,
        created_at: getNow(),
      });
      nextKeywordId += 1;
    }

    function mockCampaignWithKeywords(campaign: Campaign): unknown {
      return {
        ...campaign,
        keywords: keywords
          .filter((row) => row.campaign_id === campaign.id)
          .sort((a, b) =>
            a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0,
          )
          .map((row) => ({ ...row })),
      };
    }

    function mockCampaignCommand(cmd: string, args: unknown): unknown {
      if (!cmd.startsWith("linkgo_campaign_")) return undefined;
      if (cmd === "linkgo_campaign_list") {
        const input = nativeInput<{ limit?: number } | undefined>(args) ?? {};
        const limit = Math.min(input.limit ?? 500, 500);
        const rank = (value: string) =>
          Date.parse(
            value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"),
          ) || 0;
        return Promise.resolve(
          [...campaigns]
            .sort(
              (a, b) =>
                Number(a.status === "archived") -
                  Number(b.status === "archived") ||
                rank(b.updated_at) - rank(a.updated_at) ||
                b.id - a.id,
            )
            .slice(0, limit)
            .map(mockCampaignWithKeywords),
        );
      }
      recordNativeCampaignCall(cmd, args);
      if (cmd === "linkgo_campaign_create") {
        return runNativeMutation(() => {
          const input = nativeInput<{
            name: string;
            product: string;
            audience: string;
            voice: string;
            tone: string;
            autoPilot: boolean;
            dailyPostLimit: number;
            dailyCommentLimit: number;
            keywords: string[];
          }>(args);
          const name = input.name.trim();
          if (campaigns.some((row) => row.name === name))
            throw new Error("A campaign with this name already exists");
          const now = getNow();
          const campaign: Campaign = {
            id: nextCampaignId,
            name,
            product: input.product.trim(),
            audience: input.audience.trim(),
            voice: input.voice.trim(),
            tone: input.tone.trim(),
            auto_pilot: input.autoPilot ? 1 : 0,
            status: "draft",
            daily_post_limit: input.dailyPostLimit,
            daily_comment_limit: input.dailyCommentLimit,
            created_at: now,
            updated_at: now,
          };
          campaigns.push(campaign);
          nextCampaignId += 1;
          for (const keyword of uniqueMockCampaignKeywords(input.keywords))
            insertMockCampaignKeyword(campaign.id, keyword, "manual");
          return campaign.id;
        });
      }
      if (cmd === "linkgo_campaign_update") {
        return runNativeMutation(() => {
          const input = nativeInput<
            Partial<{
              name: string;
              product: string;
              audience: string;
              voice: string;
              tone: string;
              autoPilot: boolean;
              status: Campaign["status"];
              dailyPostLimit: number;
              dailyCommentLimit: number;
              keywords: string[];
            }> & { id: number }
          >(args);
          const campaign = campaigns.find((row) => row.id === input.id);
          if (!campaign) return null;
          if (input.name !== undefined) {
            const name = input.name.trim();
            if (
              campaigns.some((row) => row.id !== input.id && row.name === name)
            )
              throw new Error("A campaign with this name already exists");
          }
          let changed = false;
          const text = (
            value: string | undefined,
            apply: (v: string) => void,
          ) => {
            if (value === undefined) return;
            apply(value.trim());
            changed = true;
          };
          text(input.name, (v) => (campaign.name = v));
          text(input.product, (v) => (campaign.product = v));
          text(input.audience, (v) => (campaign.audience = v));
          text(input.voice, (v) => (campaign.voice = v));
          text(input.tone, (v) => (campaign.tone = v));
          if (input.autoPilot !== undefined) {
            campaign.auto_pilot = input.autoPilot ? 1 : 0;
            changed = true;
          }
          if (input.status !== undefined) {
            campaign.status = input.status;
            changed = true;
          }
          if (input.dailyPostLimit !== undefined) {
            campaign.daily_post_limit = input.dailyPostLimit;
            changed = true;
          }
          if (input.dailyCommentLimit !== undefined) {
            campaign.daily_comment_limit = input.dailyCommentLimit;
            changed = true;
          }
          if (changed) campaign.updated_at = getNow();
          if (input.keywords !== undefined) {
            removeRows(keywords, (row) => row.campaign_id === input.id);
            for (const keyword of uniqueMockCampaignKeywords(input.keywords))
              insertMockCampaignKeyword(input.id, keyword, "manual");
          }
          return null;
        });
      }
      if (cmd === "linkgo_campaign_status_set") {
        return runNativeMutation(() => {
          const input = nativeInput<{ id: number; status: Campaign["status"] }>(
            args,
          );
          const campaign = campaigns.find((row) => row.id === input.id);
          if (campaign) {
            campaign.status = input.status;
            campaign.updated_at = getNow();
          }
          return null;
        });
      }
      return undefined;
    }

    function pushSafetyAudit(
      event: Omit<SafetyAuditEvent, "id" | "created_at">,
    ): void {
      safetyAuditEvents.push({
        ...event,
        id: nextSafetyAuditEventId,
        created_at: getNow(),
      });
      nextSafetyAuditEventId += 1;
    }

    function setGlobalKillSwitchCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => setGlobalKillSwitchMutation(args));
    }

    function setGlobalKillSwitchMutation(args: unknown): unknown {
      const input = nativeInput<{ enabled: boolean; reason?: string }>(args);
      const reason = String(input.reason ?? "").trim();
      safetySettings.global_kill_switch = input.enabled ? 1 : 0;
      safetySettings.kill_switch_reason = reason;
      safetySettings.updated_at = getNow();
      pushSafetyAudit({
        campaign_id: null,
        subject_type: "safety_settings",
        subject_id: 1,
        event_type: input.enabled
          ? "kill_switch_enabled"
          : "kill_switch_disabled",
        severity: input.enabled ? "block" : "info",
        summary: input.enabled
          ? `Global kill switch enabled${reason ? `: ${reason}` : ""}`
          : "Global kill switch disabled",
        metadata_json: JSON.stringify({ reason }),
      });
      return { enabled: input.enabled, reason };
    }

    const mockErrorStatusTransitions: Record<
      ErrorQueueStatus,
      ErrorQueueStatus[]
    > = {
      open: ["in_progress", "failed"],
      in_progress: ["awaiting_review", "failed"],
      awaiting_review: ["resolved", "failed"],
      resolved: ["in_progress"],
      failed: ["in_progress"],
    };

    function setErrorQueueItemStatusCommand(args: unknown): Promise<unknown> {
      return runNativeMutation(() => setErrorQueueItemStatusMutation(args));
    }

    function setErrorQueueItemStatusMutation(args: unknown): unknown {
      const input = nativeInput<{
        id: number;
        status: ErrorQueueStatus;
        resolutionNotes?: string;
      }>(args);
      const item = errorQueueItems.find((row) => row.id === input.id);
      if (!item) throw new Error("Error queue item was not found");
      const campaign = campaigns.find((row) => row.id === item.campaign_id);
      if (campaign?.status === "archived")
        throw new Error("Archived campaign error items cannot be changed");
      if (!mockErrorStatusTransitions[item.status].includes(input.status))
        throw new Error("Unsupported error queue status transition");
      const previousStatus = item.status;
      const notes = String(input.resolutionNotes ?? "").trim();
      item.status = input.status;
      item.resolution_notes = notes;
      item.updated_at = getNow();
      pushSafetyAudit({
        campaign_id: item.campaign_id,
        subject_type: "error_queue_item",
        subject_id: item.id,
        event_type: "error_item_updated",
        severity: "info",
        summary: `Error item moved from ${previousStatus} to ${input.status}`,
        metadata_json: JSON.stringify({ resolutionNotes: notes }),
      });
      return { id: item.id, previousStatus, status: input.status };
    }

    const dispatchMockInvoke = (cmd: string, args?: unknown): unknown => {
      if (cmd === "linkgo_safety_set_global_kill_switch")
        return setGlobalKillSwitchCommand(args);
      if (cmd === "linkgo_safety_set_error_queue_item_status")
        return setErrorQueueItemStatusCommand(args);
      if (cmd === "linkgo_candidate_policy_update")
        return updateCandidatePolicyCommand(args);
      if (cmd === "linkgo_candidate_policy_get")
        return getCandidatePolicyCommand(args).then((policy) =>
          withCampaignGate(
            nativeInput<{ campaignId: number }>(args).campaignId,
            policy,
          ),
        );
      {
        const candidateQueueResult = mockCandidateQueueCommand(cmd, args);
        if (candidateQueueResult !== undefined) return candidateQueueResult;
      }
      if (cmd === "linkgo_safety_settings_get")
        return Promise.resolve({ ...safetySettings });
      if (cmd === "linkgo_safety_dashboard_get")
        return getSafetyDashboardCommand(args);
      if (cmd === "linkgo_scheduler_dashboard_get")
        return getSchedulerDashboardCommand(args);
      {
        const campaignResult = mockCampaignCommand(cmd, args);
        if (campaignResult !== undefined) return campaignResult;
        const playbookResult = mockPlaybookAndSettingsCommand(cmd, args);
        if (playbookResult !== undefined) return playbookResult;
      }
      {
        const workflowResult = mockWorkflowCommand(cmd, args);
        if (workflowResult !== undefined) return workflowResult;
        const agentRunResult = mockAgentRunCommand(cmd, args);
        if (agentRunResult !== undefined) return agentRunResult;
        const draftResult = mockDraftCommand(cmd, args);
        if (draftResult !== undefined) return draftResult;
        const auditResult = mockAuditCommand(cmd, args);
        if (auditResult !== undefined) return auditResult;
      }
      if (cmd === "linkgo_candidate_create")
        return createCandidateCommand(args);
      if (cmd === "linkgo_source_import_write_batch")
        return writeSourceImportBatchCommand(args);
      if (cmd === "linkgo_source_import_recover_interrupted")
        return recoverSourceImportsCommand(args);
      if (cmd === "linkgo_candidate_delete")
        return deleteCandidateCommand(args);
      if (cmd === "linkgo_candidate_promote_discovery_item")
        return promoteDiscoveryItemCommand(args);
      if (cmd === "linkgo_comment_thread_create")
        return createCommentThreadCommand(args);
      if (cmd === "linkgo_comment_thread_update")
        return updateCommentThreadCommand(args);
      if (cmd === "linkgo_comment_variant_update")
        return updateCommentVariantCommand(args);
      if (cmd === "linkgo_comment_variant_set_status")
        return setCommentVariantStatusCommand(args);
      if (cmd === "linkgo_comment_thread_set_status")
        return setCommentThreadStatusCommand(args);
      if (cmd === "linkgo_comment_assert_can_publish")
        return assertCommentCanPublishCommand(args);
      if (cmd === "linkgo_metrics_record_post_metric")
        return recordPostMetricCommand(args);
      if (cmd === "linkgo_metrics_create_campaign_memory")
        return createCampaignMemoryCommand(args);
      if (cmd === "linkgo_metrics_set_campaign_memory_status")
        return setCampaignMemoryStatusCommand(args);
      if (cmd === "linkgo_approval_create") return createApprovalCommand(args);
      if (cmd === "linkgo_approval_set_status")
        return setApprovalStatusCommand(args);
      {
        const calendarResult = calendarCommand(cmd, args);
        if (calendarResult !== undefined) return calendarResult;
      }
      {
        // Mirrors `metrics_reads.rs`: reuse the SQL-mock row builders with the
        // same campaign filter and caps.
        const metricsRead = (
          query: string,
          limit: number,
        ): Promise<unknown> => {
          const input = nativeInput<{ campaignId?: number }>(args);
          const values =
            input.campaignId === undefined ? [] : [input.campaignId];
          return Promise.resolve(
            (selectSql({ query, values }) as unknown[]).slice(0, limit),
          );
        };
        // Mirrors `drafts_reads.rs`, reusing the SQL-mock row builders.
        if (cmd === "linkgo_draft_list") {
          const input = nativeInput<{ campaignId?: number }>(args);
          const values =
            input.campaignId === undefined ? [] : [input.campaignId];
          const draftMatches = selectDraftJoin(values) as Array<{ id: number }>;
          const draftRows = draftMatches.slice(0, 500);
          const variants = selectDraftVariants(
            "FROM draft_variants",
            draftRows.map((row) => row.id),
          );
          const variantIds = variants.map((variant) => variant.id);
          const currentRevision = (variantId: number): number | undefined =>
            draftVariants.find((row) => row.id === variantId)?.content_revision;
          const latestPer = <
            T extends { id: number; draft_variant_id: number },
          >(
            rows: T[],
          ): T[] => {
            const seen = new Set<number>();
            return [...rows]
              .sort((left, right) => right.id - left.id)
              .filter((row) => {
                if (seen.has(row.draft_variant_id)) return false;
                seen.add(row.draft_variant_id);
                return true;
              });
          };
          const aiAuditRuns = latestPer(
            draftAiAuditRuns.filter(
              (run) =>
                variantIds.includes(run.draft_variant_id) &&
                run.content_revision === currentRevision(run.draft_variant_id),
            ),
          );
          const completedRunIds = new Set(
            aiAuditRuns
              .filter((run) => run.status === "completed")
              .map((run) => run.id),
          );
          const qualityRuns = latestPer(
            draftQualityRuns.filter(
              (run) =>
                variantIds.includes(run.draft_variant_id) &&
                run.current_content_revision ===
                  currentRevision(run.draft_variant_id),
            ),
          );
          const runIds = new Set(qualityRuns.map((run) => run.id));
          const attempts = draftQualityAttempts
            .filter((attempt) => runIds.has(attempt.run_id))
            .sort((left, right) => left.attempt_number - right.attempt_number);
          return withCampaignGate(input.campaignId, {
            drafts: draftRows,
            totalCount: draftMatches.length,
            variants,
            // Native selects these columns only (no `content_revision`).
            audits: selectDraftAudits(variantIds)
              .sort((left, right) => left.id - right.id)
              .map((audit) => ({
                id: audit.id,
                draft_variant_id: audit.draft_variant_id,
                rule_key: audit.rule_key,
                severity: audit.severity,
                message: audit.message,
                created_at: audit.created_at,
              })),
            aiAuditRuns: aiAuditRuns.map((run) => ({ ...run })),
            aiAuditFindings: draftAiAuditFindings
              .filter((finding) => completedRunIds.has(finding.audit_run_id))
              .sort((left, right) => left.id - right.id)
              .map((finding) => ({ ...finding })),
            // The mock stores partial quality rows; fill the remaining
            // columns with the table defaults so the shape matches native.
            qualityRuns: qualityRuns.map((run) => ({
              starting_content_revision: run.current_content_revision,
              threshold: 70,
              maximum_rewrite_count: 2,
              started_at: null,
              completed_at: null,
              created_at: run.updated_at,
              ...run,
            })),
            qualityAttempts: attempts.map((attempt) => ({
              input_hook: "",
              input_body: "",
              input_cta: "",
              input_hashtags: "",
              rewritten_hook: null,
              rewritten_body: null,
              rewritten_cta: null,
              rewritten_hashtags: null,
              overall_score: null,
              ai_audit_run_id: null,
              created_at: getNow(),
              updated_at: getNow(),
              completed_at: null,
              ...attempt,
            })),
            // Native: ORDER BY category_key ASC, id ASC; exact columns only.
            qualityScores: draftQualityCategoryScores
              .filter((score) =>
                attempts.some((attempt) => attempt.id === score.attempt_id),
              )
              .sort(
                (left, right) =>
                  (left.category_key < right.category_key
                    ? -1
                    : left.category_key > right.category_key
                      ? 1
                      : 0) || left.id - right.id,
              )
              .map((score) => ({
                id: score.id,
                attempt_id: score.attempt_id,
                category_key: score.category_key,
                score: score.score,
                feedback: score.feedback,
                created_at: score.created_at,
              })),
          });
        }
        if (cmd === "linkgo_draft_generation_request_list") {
          const input = nativeInput<{ campaignId?: number }>(args);
          const values =
            input.campaignId === undefined ? [] : [input.campaignId];
          return withCampaignGate(
            input.campaignId,
            selectDraftGenerationRequestJoin(
              input.campaignId === undefined
                ? "FROM draft_generation_requests dgr"
                : "FROM draft_generation_requests dgr WHERE dgr.campaign_id",
              values,
            ).slice(0, 500),
          );
        }
        if (cmd === "linkgo_draft_workflow_options") {
          const input = nativeInput<{ campaignId: number }>(args);
          return withCampaignGate(
            input.campaignId,
            (
              selectSql({
                query: "cp.id AS candidate_id FROM workflow_runs wr NOT EXISTS",
                values: [input.campaignId],
              }) as unknown[]
            ).slice(0, 200),
          );
        }
        if (cmd === "linkgo_draft_update") {
          return runNativeMutation(() => {
            const input = nativeInput<{
              id: number;
              angle?: string;
              notes?: string;
              status?: DraftStatus;
            }>(args);
            const draft = drafts.find((row) => row.id === input.id);
            const changed =
              input.angle !== undefined ||
              input.notes !== undefined ||
              input.status !== undefined;
            if (!draft || !changed) return null;
            if (input.angle !== undefined) draft.angle = input.angle.trim();
            if (input.notes !== undefined) draft.notes = input.notes.trim();
            if (input.status !== undefined) draft.status = input.status;
            draft.updated_at = getNow();
            return null;
          });
        }
        if (cmd === "linkgo_comment_thread_list") {
          // Mirrors `comment_reads::list_threads`: one snapshot, capped.
          const input = nativeInput<{ campaignId?: number }>(args);
          const threadMatches = selectCommentThreads(
            input.campaignId === undefined ? [] : [input.campaignId],
          ) as Array<{ id: number }>;
          const threads = threadMatches.slice(0, 500);
          const threadIds = new Set(threads.map((thread) => thread.id));
          const variants = commentVariants
            .filter((variant) => threadIds.has(variant.comment_thread_id))
            .sort(
              (left, right) =>
                left.variant_number - right.variant_number ||
                left.id - right.id,
            );
          const variantIds = new Set(variants.map((variant) => variant.id));
          return Promise.resolve({
            threads,
            variants: variants.map((variant) => ({ ...variant })),
            audits: commentAudits
              .filter((audit) => variantIds.has(audit.comment_variant_id))
              .sort((left, right) => left.id - right.id)
              .map((audit) => ({ ...audit })),
            attempts: commentAttempts
              .filter((attempt) => threadIds.has(attempt.comment_thread_id))
              .sort(
                (left, right) =>
                  right.created_at.localeCompare(left.created_at) ||
                  right.id - left.id,
              )
              .map((attempt) => ({ ...attempt })),
            totalCount: threadMatches.length,
          });
        }
        if (cmd === "linkgo_comment_eligible_candidates") {
          const input = nativeInput<{ campaignId?: number }>(args);
          return Promise.resolve(
            selectCommentEligibleCandidates(
              input.campaignId === undefined ? [] : [input.campaignId],
            ).slice(0, 200),
          );
        }
        // Mirrors `planning_reads.rs`, reusing the SQL-mock row builders
        // (and their failure and delay hooks).
        // Mirrors `workflow_store.rs`: reuse the SQL-mock builders and trim
        // rows to the exact native columns.
        {
          const pick = (
            row: Record<string, unknown>,
            keys: readonly string[],
          ): Record<string, unknown> =>
            Object.fromEntries(keys.map((key) => [key, row[key] ?? null]));
          const RUN_KEYS = [
            "id",
            "campaign_id",
            "workflow_type",
            "title",
            "status",
            "current_step_key",
            "context_summary",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
          ] as const;
          const AGENT_RUN_KEYS = [
            "id",
            "campaign_id",
            "workflow_run_id",
            "workflow_step_id",
            "agent_role",
            "provider_key",
            "model_name",
            "playbook_key",
            "status",
            "input_summary",
            "input_context_json",
            "output_summary",
            "error_message",
            "iteration_count",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
          ] as const;
          const failWith = (error: unknown): Promise<never> =>
            Promise.reject(
              error instanceof Error ? error : new Error(String(error)),
            );
          const listInput = (): { campaignId?: number } =>
            nativeInput<{ campaignId?: number }>(args);
          if (cmd === "linkgo_workflow_run_list") {
            try {
              const input = listInput();
              const runs = (
                selectWorkflowRunJoin(
                  input.campaignId === undefined ? [] : [input.campaignId],
                ) as Array<Record<string, unknown>>
              )
                .slice(0, 200)
                .map((row) =>
                  pick(row, [
                    ...RUN_KEYS,
                    "campaign_name",
                    "campaign_status",
                    "autopilot_plan_id",
                    "source_import_batch_id",
                  ]),
                );
              const runIds = runs.map((run) => Number(run.id));
              const eventCounts = new Map<number, number>();
              return withCampaignGate(input.campaignId, {
                runs,
                steps: selectWorkflowSteps(runIds),
                events: selectWorkflowEvents(runIds).filter((event) => {
                  const seen = eventCounts.get(event.workflow_run_id) ?? 0;
                  eventCounts.set(event.workflow_run_id, seen + 1);
                  return seen < 100;
                }),
                artifacts: selectWorkflowArtifacts(runIds),
              });
            } catch (error) {
              return failWith(error);
            }
          }
          if (cmd === "linkgo_workflow_run_validation") {
            const [row] = selectWorkflowRunValidation([
              nativeInput<{ id: number }>(args).id,
            ]) as Array<Record<string, unknown>>;
            return row === undefined
              ? Promise.reject(new Error("Workflow run was not found"))
              : Promise.resolve(
                  pick(row, [
                    ...RUN_KEYS,
                    "campaign_status",
                    "autopilot_plan_id",
                  ]),
                );
          }
          if (cmd === "linkgo_agent_run_list") {
            try {
              const input = listInput();
              const runs = (
                selectAgentRunJoin(
                  input.campaignId === undefined ? [] : [input.campaignId],
                ) as Array<Record<string, unknown>>
              )
                .slice(0, 200)
                .map((row) =>
                  pick(row, [
                    ...AGENT_RUN_KEYS,
                    "campaign_name",
                    "campaign_status",
                  ]),
                )
                .map((row) => ({
                  ...row,
                  quality_start_blocked: qualityStartBlocked(Number(row.id)),
                }));
              const runIds = runs.map((run) => Number(run.id));
              const eventCounts = new Map<number, number>();
              return withCampaignGate(input.campaignId, {
                runs,
                toolCalls: selectAgentToolCalls("", runIds),
                events: selectAgentRunEvents(runIds).filter((event) => {
                  const seen = eventCounts.get(event.agent_run_id) ?? 0;
                  eventCounts.set(event.agent_run_id, seen + 1);
                  return seen < 100;
                }),
                checkpoints: selectAgentApprovalCheckpoints(
                  "SELECT cp.*",
                  runIds,
                ),
              });
            } catch (error) {
              return failWith(error);
            }
          }
          if (cmd === "linkgo_agent_run_validation") {
            const [row] = selectAgentRunValidation([
              nativeInput<{ id: number }>(args).id,
            ]) as Array<Record<string, unknown>>;
            return row === undefined
              ? Promise.reject(new Error("Agent run was not found"))
              : Promise.resolve(
                  pick(row, [...AGENT_RUN_KEYS, "campaign_status"]),
                );
          }
          if (cmd === "linkgo_workflow_planner_scoring_scope") {
            try {
              const id = nativeInput<{ id: number }>(args).id;
              const [header] = selectSql({
                query:
                  "ws.status AS score_step_status INNER JOIN autopilot_plans ap",
                values: [id],
              }) as Array<{ campaign_id: number }>;
              return Promise.resolve({
                header: header ?? null,
                artifacts: (
                  selectSql({
                    query: "wa.id AS artifact_order tp.content",
                    values: [id],
                  }) as unknown[]
                ).slice(0, 500),
                keywords:
                  header === undefined
                    ? []
                    : keywords
                        .filter((row) => row.campaign_id === header.campaign_id)
                        .sort((left, right) => left.id - right.id)
                        .slice(0, 12)
                        .map((row) => row.keyword),
              });
            } catch (error) {
              return failWith(error);
            }
          }
          if (cmd === "linkgo_workflow_planner_draft_audit_scope") {
            try {
              return Promise.resolve(
                (
                  selectSql({
                    query:
                      "FROM workflow_runs wr dgr.created_draft_id artifact_type = 'draft'",
                    values: [nativeInput<{ id: number }>(args).id],
                  }) as unknown[]
                ).slice(0, 2),
              );
            } catch (error) {
              return failWith(error);
            }
          }
          if (cmd === "linkgo_workflow_step_execution_create") {
            return runNativeMutation(() => {
              const input = nativeInput<{
                workflowStepId: number;
                agentRunId?: number;
                executorRole: AgentRole;
              }>(args);
              if (
                !workflowSteps.some((step) => step.id === input.workflowStepId)
              )
                throw new Error("Workflow step was not found");
              const result = executeSql({
                query:
                  "INSERT INTO workflow_step_executions (workflow_step_id, agent_run_id, executor_role)",
                values: [
                  input.workflowStepId,
                  input.agentRunId ?? null,
                  input.executorRole,
                ],
              });
              return result.lastInsertId;
            });
          }
          if (cmd === "linkgo_workflow_step_execution_update") {
            return runNativeMutation(() => {
              const input = nativeInput<{
                id: number;
                agentRunId?: number;
                status: WorkflowStepExecutionStatus;
                errorSummary: string;
              }>(args);
              executeSql({
                query:
                  "UPDATE workflow_step_executions SET agent_run_id, status, error_summary WHERE id = $4",
                values: [
                  input.agentRunId ?? null,
                  input.status,
                  input.errorSummary.slice(0, 2000),
                  input.id,
                ],
              });
              return null;
            });
          }
        }
        if (cmd === "linkgo_campaign_backlog_dashboard") {
          try {
            const input = nativeInput<{
              campaignId?: number;
              owner: "all" | "operator" | "linkgo";
              view: "open" | "history";
            }>(args);
            const values: unknown[] = [];
            if (input.campaignId !== undefined) values.push(input.campaignId);
            if (input.owner !== "all") values.push(input.owner);
            const items = selectCampaignBacklog(
              input.view === "history"
                ? "cbi.status IN ('completed', 'cancelled')"
                : "cbi.status IN ('pending', 'in_progress', 'blocked')",
              values,
            ).slice(0, input.view === "history" ? 100 : 500);
            const [summary] = selectCampaignBacklog(
              "AS due_now",
              values,
            ) as Array<Record<string, number>>;
            const result = {
              items,
              summary: {
                dueNow: summary?.due_now ?? 0,
                inProgress: summary?.in_progress ?? 0,
                blocked: summary?.blocked ?? 0,
                linkgoOwned: summary?.linkgo_owned ?? 0,
              },
              totalItems: campaignBacklogItems.length,
            };
            const gate = backlogSelectGates.get(getBacklogSelectKey(values));
            if (gate === undefined) return Promise.resolve(result);
            gate.pending += 1;
            return gate.promise.then(() => {
              gate.pending -= 1;
              return result;
            });
          } catch (error) {
            return Promise.reject(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
        if (cmd === "linkgo_autopilot_planner_dashboard") {
          try {
            const input = nativeInput<{ campaignId?: number }>(args);
            const values =
              input.campaignId === undefined ? [] : [input.campaignId];
            const count = (query: string): number =>
              (
                selectAutopilotPlanner(query, values) as Array<{
                  count: number;
                }>
              )[0]?.count ?? 0;
            const result = {
              summary: {
                eligibleBatches: count(
                  "FROM source_import_batches sib LEFT JOIN autopilot_plans",
                ),
                plannedBatches: count(
                  "COUNT(*) AS count FROM autopilot_plans ap WHERE ap.status = 'planned'",
                ),
                skippedBatches: count(
                  "COUNT(*) AS count FROM autopilot_plans ap WHERE ap.status = 'skipped'",
                ),
                recentFailures: count(
                  "COUNT(*) AS count FROM autopilot_planner_events ape",
                ),
              },
              recentPlans: selectAutopilotPlanner(
                "FROM autopilot_plans ap",
                values,
              ),
              recentEvents: selectAutopilotPlanner(
                "FROM autopilot_planner_events ape",
                values,
              ),
              globalKillSwitchEnabled: safetySettings.global_kill_switch === 1,
              killSwitchReason: safetySettings.kill_switch_reason,
            };
            return withCampaignGate(input.campaignId, result);
          } catch (error) {
            return Promise.reject(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
        if (cmd === "linkgo_metrics_eligible_approvals")
          return metricsRead(
            "FROM approvals a INNER JOIN publish_attempts pa",
            500,
          );
        if (cmd === "linkgo_metrics_post_metrics_list")
          return metricsRead("FROM post_metrics pm", 500);
        if (cmd === "linkgo_metrics_campaign_memory_list")
          return metricsRead("FROM campaign_memory cm", 500);
        if (cmd === "linkgo_metrics_learning_events_list")
          return metricsRead("FROM learning_events le", 500);
        if (cmd === "linkgo_metrics_refresh_dashboard") {
          const input = nativeInput<{ campaignId?: number }>(args);
          const values =
            input.campaignId === undefined ? [] : [input.campaignId];
          const [summary] = selectSql({
            query: "SELECT\n      (SELECT COUNT(*) FROM metric_refresh_jobs",
            values,
          }) as Array<Record<string, number>>;
          return Promise.resolve({
            settings: { ...metricRefreshSettings },
            jobs: (
              selectSql({
                query: "FROM metric_refresh_jobs mrj",
                values,
              }) as unknown[]
            ).slice(0, 500),
            events: selectSql({
              query: "FROM metric_refresh_events mre",
              values,
            }),
            summary: {
              totalJobs: summary?.total_jobs ?? 0,
              activeJobs: summary?.active_jobs ?? 0,
              dueJobs: summary?.due_jobs ?? 0,
              unavailableJobs: summary?.unavailable_jobs ?? 0,
              failedJobs: summary?.failed_jobs ?? 0,
              apiSnapshots: summary?.api_snapshots ?? 0,
            },
          });
        }
      }
      if (cmd === "linkgo_approval_list") {
        const campaignId = nativeInput<{ campaignId?: number }>(
          args,
        ).campaignId;
        const calls = Array.isArray(w.__LINKGO_APPROVAL_LIST_CALLS__)
          ? (w.__LINKGO_APPROVAL_LIST_CALLS__ as unknown[])
          : [];
        calls.push(campaignId ?? null);
        w.__LINKGO_APPROVAL_LIST_CALLS__ = calls;
        if (w.__LINKGO_FAIL_APPROVAL_LIST__ === true) {
          w.__LINKGO_FAIL_APPROVAL_LIST__ = undefined;
          return withCampaignGate(campaignId, null).then(() => {
            throw new Error("Injected approval list failure");
          });
        }
        return approvalListCommand(args).then((result) =>
          withCampaignGate(campaignId, result),
        );
      }
      if (cmd === "linkgo_approval_eligible_drafts") {
        const campaignId = nativeInput<{ campaignId?: number }>(
          args,
        ).campaignId;
        return approvalEligibleDraftsCommand(args).then((result) =>
          withCampaignGate(campaignId, result),
        );
      }
      if (cmd === "linkgo_approval_publish_preflight")
        return approvalPublishPreflightCommand(args);
      if (cmd === "linkgo_approval_schedule")
        return scheduleApprovalCommand(args);
      if (cmd === "linkgo_approval_cancel_schedule")
        return cancelScheduleCommand(args);
      if (cmd === "linkgo_approval_record_publish_attempt") {
        return recordPublishAttemptCommand(args);
      }
      if (cmd === "linkgo_comment_record_attempt") {
        return recordCommentAttemptCommand(args);
      }
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
      if (cmd === "linkgo_planner_draft_audit_claim")
        return claimNativePlannerDraftAudit(args);
      if (cmd === "linkgo_planner_draft_audit_complete")
        return completeNativePlannerDraftAudit(args);
      if (cmd === "linkgo_planner_draft_audit_fail")
        return failNativePlannerDraftAudit(args);
      if (cmd === "linkgo_planner_draft_audit_reconcile_stale")
        return reconcileNativePlannerDraftAudits(args);
      if (cmd === "linkgo_draft_quality_reconcile_stale")
        return Promise.resolve({ reconciledRunIds: [] });
      if (cmd === "linkgo_draft_quality_claim")
        return claimDraftQualityCommand(args);
      if (cmd === "linkgo_draft_quality_apply_score")
        return applyDraftQualityScoreCommand(args);
      if (cmd === "linkgo_draft_quality_continue")
        return continueDraftQualityCommand(args);
      if (cmd === "linkgo_draft_quality_resume")
        return resumeDraftQualityCommand(args);
      if (cmd === "linkgo_draft_quality_fail")
        return failDraftQualityCommand(args);
      if (cmd === "linkgo_relevance_scoring_fail_agent") {
        return failNativeScoringAgentCommand(args);
      }
      // Production grants the renderer no `sql:*` permission, so the mock
      // rejects every SQL plugin command too. Specs seed fixtures through
      // the test-only `__linkgo_test_sql|*` channel below instead.
      if (cmd.startsWith("plugin:sql|")) {
        return Promise.reject(
          new Error(`${cmd} not allowed. Command not found`),
        );
      }
      if (cmd === "__linkgo_test_sql|select")
        return selectSqlWithCampaignDelay(args);
      if (cmd === "__linkgo_test_sql|execute") {
        const result = executeSql(args);
        return Promise.resolve([result.rowsAffected, result.lastInsertId]);
      }
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
        const stored = window.localStorage.getItem("linkgo.autostart.enabled");
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
                    allowLocalDestination?: boolean;
                  };
                }
              | undefined
          )?.input ?? {};
        const providerKey = input.providerKey ?? input.provider_key ?? "openai";
        const apiKey = input.apiKey ?? input.api_key ?? "test-key-00000000";
        const baseUrl = input.baseUrl ?? input.base_url;
        if (providerKey === "custom" && !baseUrl?.trim()) {
          throw new Error("Custom provider requires a Base URL override");
        }
        // Simplified mirror of the native destination policy
        // (src-tauri/src/net/destination.rs), which stays authoritative.
        if (baseUrl?.trim()) {
          let parsed: URL;
          try {
            parsed = new URL(baseUrl.trim());
          } catch {
            throw new Error("Base URL is not a valid URL");
          }
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            throw new Error("Base URL must start with https://");
          }
          if (parsed.username !== "" || parsed.password !== "") {
            throw new Error("Base URL must not include a username or password");
          }
          const host = parsed.hostname.toLowerCase();
          const local =
            host === "localhost" ||
            host.endsWith(".localhost") ||
            host === "[::1]" ||
            /^(127|10)\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^169\.254\./.test(host) ||
            /^198\.1[89]\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host);
          if (local && input.allowLocalDestination !== true) {
            throw new Error(
              "Base URL points to this computer or a private network. Reconnect the provider and allow the local endpoint to use it",
            );
          }
          if (!local && parsed.protocol === "http:") {
            throw new Error(
              "Base URL must use https:// unless it is an allowed local endpoint",
            );
          }
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
        const providerKey = input.providerKey ?? input.provider_key ?? "openai";
        removeRows(
          connectedAccounts,
          (account) => account.provider_key === providerKey,
        );
        return Promise.resolve(getAuthStatusMock());
      }
      if (cmd === "linkgo_auth_check")
        return Promise.resolve(getAuthStatusMock());
      if (cmd === "linkgo_agent_settle_approved_continuation") {
        agentContinuationSettlementInvocations += 1;
        sessionStorage.setItem(
          "linkgo-agent-continuation-settlement-count",
          String(agentContinuationSettlementInvocations),
        );
        const input = (args as { input?: { agentRunId?: number } } | undefined)
          ?.input;
        const runId = Number(input?.agentRunId ?? 0);
        if (activeAgentContinuationSettlements.has(runId)) {
          throw new Error("Agent continuation is already running");
        }
        activeAgentContinuationSettlements.add(runId);
        try {
          const checkpoint = agentApprovalCheckpoints.find(
            (row) => row.agent_run_id === runId,
          );
          if (!checkpoint)
            throw new Error("Agent approval checkpoint was not found");
          const run = agentRuns.find((row) => row.id === runId);
          if (!run)
            throw new Error("Agent run cannot resume from its current status");
          const tool = agentToolCalls.find(
            (row) =>
              row.id === checkpoint.pending_tool_call_id &&
              row.agent_run_id === runId,
          );
          if (!tool)
            throw new Error("Pending approval tool call was not found");
          if (
            tool.tool_name !== "schedule_post" ||
            tool.requires_approval !== 1
          )
            throw new Error(
              "Approval checkpoint does not reference schedule_post",
            );
          let scheduleInput: {
            campaignId?: number;
            approvalId?: number;
            scheduledFor?: string;
            timezone?: string;
          };
          let messages: Array<Record<string, unknown>>;
          let inputContext: Record<string, unknown>;
          try {
            scheduleInput = JSON.parse(tool.input_json) as typeof scheduleInput;
            messages = JSON.parse(checkpoint.messages_json) as Array<
              Record<string, unknown>
            >;
            inputContext = JSON.parse(run.input_context_json) as Record<
              string,
              unknown
            >;
            if (!Array.isArray(messages)) throw new Error("invalid messages");
          } catch {
            throw new Error("Agent continuation could not be settled");
          }
          const pendingMessageCalls = new Map<string, string>();
          for (const message of messages) {
            if (
              message.role === "assistant" &&
              typeof message.toolName === "string" &&
              typeof message.providerToolCallId === "string"
            ) {
              pendingMessageCalls.set(
                message.providerToolCallId,
                message.toolName,
              );
            } else if (message.role === "tool") {
              if (
                typeof message.toolName !== "string" ||
                typeof message.providerToolCallId !== "string" ||
                pendingMessageCalls.get(message.providerToolCallId) !==
                  message.toolName
              ) {
                throw new Error("Agent continuation could not be settled");
              }
              pendingMessageCalls.delete(message.providerToolCallId);
            }
          }
          if (
            scheduleInput.campaignId !== run.campaign_id ||
            scheduleInput.approvalId !== checkpoint.approval_id
          )
            throw new Error(
              "Approval checkpoint does not match the run campaign",
            );
          const approval = approvals.find(
            (row) => row.id === checkpoint.approval_id,
          );
          if (!approval)
            throw new Error("Agent continuation could not be settled");
          if (approval.campaign_id !== run.campaign_id)
            throw new Error("Linked approval belongs to a different campaign");
          if (approval.status === "rejected") {
            const linkedCheckpoints = agentApprovalCheckpoints.filter(
              (row) => row.approval_id === approval.id,
            );
            for (const linkedCheckpoint of linkedCheckpoints) {
              const linkedTool = agentToolCalls.find(
                (row) => row.id === linkedCheckpoint.pending_tool_call_id,
              );
              const linkedRun = agentRuns.find(
                (row) => row.id === linkedCheckpoint.agent_run_id,
              );
              if (linkedTool) {
                linkedTool.status = "rejected";
                linkedTool.error_message =
                  "Approval rejected: Approval rejected before continuation";
                linkedTool.completed_at = getNow();
              }
              if (linkedRun) {
                linkedRun.status = "cancelled";
                linkedRun.error_message =
                  "Approval rejected: Approval rejected before continuation";
                linkedRun.completed_at = getNow();
              }
            }
            removeRows(
              agentApprovalCheckpoints,
              (row) => row.approval_id === approval.id,
            );
            throw new Error("Linked approval was rejected");
          }
          if (approval.status !== "approved")
            throw new Error("Linked approval must be approved before resume");
          const campaign = campaigns.find((row) => row.id === run.campaign_id);
          if (campaign?.status === "archived")
            throw new Error("Campaign is archived");
          if (safetySettings.global_kill_switch === 1)
            throw new Error("Global kill switch is enabled");

          const recovered =
            checkpoint.phase === "continuation_ready" &&
            run.status === "failed";
          if (
            checkpoint.phase === "continuation_ready" &&
            run.status === "running"
          )
            throw new Error("Agent continuation is already running");
          if (
            !recovered &&
            (checkpoint.phase !== "waiting_approval" ||
              run.status !== "waiting_approval")
          )
            throw new Error("Agent run cannot resume from its current status");
          if (!recovered) {
            if (!["waiting_approval", "running"].includes(tool.status))
              throw new Error("Pending approval tool is not executable");
            const output = {
              scheduled: false,
              approvalId: checkpoint.approval_id,
              scheduledFor: scheduleInput.scheduledFor,
              timezone: scheduleInput.timezone,
              summary:
                "Approval confirmed for schedule metadata only; no schedule record or publish action was created.",
            };
            tool.status = "completed";
            tool.output_json = JSON.stringify(output);
            tool.error_message = "";
            tool.completed_at = getNow();
            messages.push({
              role: "tool",
              content: JSON.stringify(output),
              toolName: "schedule_post",
              providerToolCallId: tool.provider_tool_call_id,
            });
            checkpoint.phase = "continuation_ready";
            checkpoint.messages_json = JSON.stringify(messages);
            checkpoint.updated_at = getNow();
          } else if (tool.status !== "completed") {
            throw new Error("Approved tool call was already handled");
          }
          run.status = "running";
          run.completed_at = null;
          run.error_message = "";
          run.updated_at = getNow();
          return Promise.resolve({
            agentRunId: run.id,
            campaignId: run.campaign_id,
            workflowRunId: run.workflow_run_id,
            workflowStepId: run.workflow_step_id,
            agentRole: run.agent_role,
            providerKey: run.provider_key,
            modelName: run.model_name,
            playbookKey: run.playbook_key,
            inputSummary: run.input_summary,
            inputContext,
            messages,
            iterationCount: checkpoint.iteration_count,
            handledProviderToolCallIds: agentToolCalls
              .filter(
                (row) =>
                  row.agent_run_id === run.id &&
                  row.provider_tool_call_id !== "",
              )
              .map((row) => row.provider_tool_call_id),
            checkpointPhase: "continuation_ready",
            recovered,
          });
        } finally {
          activeAgentContinuationSettlements.delete(runId);
        }
      }
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
        if (secret === undefined) throw new Error("Provider is not connected");
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
        // Mirrors native execution: LinkedIn call plus attempt/thread/audit/
        // error settlement in one transaction, returning an ExecutionOutcome.
        const input =
          (
            args as
              | {
                  input?: {
                    commentThreadId?: number;
                    targetUrn?: string;
                    idempotencyKey?: string;
                  };
                }
              | undefined
          )?.input ?? {};
        const commentInvokes = Number(
          w.__LINKGO_LINKEDIN_COMMENT_INVOKES__ ?? 0,
        );
        w.__LINKGO_LINKEDIN_COMMENT_INVOKES__ = commentInvokes + 1;
        const commentThreadId = input.commentThreadId ?? 1;
        if (hasOpenPublishExecution("comment", commentThreadId)) {
          return Promise.resolve({
            status: "blocked",
            message: OPEN_EXECUTION_MESSAGE,
          });
        }
        const executionId = nextPublishExecutionId;
        nextPublishExecutionId += 1;
        const outcome = w.__LINKGO_LINKEDIN_COMMENT_OUTCOME__;
        if (outcome !== undefined) {
          return Promise.resolve(outcome);
        }
        const error = w.__LINKGO_LINKEDIN_COMMENT_ERROR__;
        if (typeof error === "string" && error.trim() !== "") {
          return settleCommentAttempt({
            input: {
              commentThreadId,
              status: "failed",
              idempotencyKey: input.idempotencyKey,
              errorMessage: error,
            },
          }).then(() => ({ status: "failed", executionId, message: error }));
        }
        const targetUrn = input.targetUrn ?? "urn:li:ugcPost:test";
        const override = w.__LINKGO_LINKEDIN_COMMENT_RESULT__ as
          | {
              platformCommentId?: string;
              platformCommentUrn?: string;
              externalCommentUrl?: string;
            }
          | undefined;
        const platformId =
          override?.platformCommentUrn ||
          override?.platformCommentId ||
          `urn:li:comment:(${targetUrn},test-comment-${commentThreadId})`;
        const externalUrl =
          override?.externalCommentUrl ??
          `https://www.linkedin.com/feed/update/${targetUrn}/`;
        return settleCommentAttempt({
          input: {
            commentThreadId,
            status: "succeeded",
            idempotencyKey: input.idempotencyKey,
            externalCommentUrl: externalUrl,
            platformCommentId: platformId,
          },
        }).then(() => ({
          status: "succeeded",
          executionId,
          platformId,
          externalUrl,
        }));
      }
      if (cmd === "linkgo_linkedin_publish_post") {
        const input =
          (
            args as
              | {
                  input?: {
                    approvalId?: number;
                    scheduleJobId?: number;
                  };
                }
              | undefined
          )?.input ?? {};
        const approvalId = input.approvalId ?? 1;
        if (hasOpenPublishExecution("post", approvalId)) {
          return Promise.resolve({
            status: "blocked",
            message: OPEN_EXECUTION_MESSAGE,
          });
        }
        const executionId = nextPublishExecutionId;
        nextPublishExecutionId += 1;
        const outcome = w.__LINKGO_LINKEDIN_PUBLISH_OUTCOME__;
        if (outcome !== undefined) {
          return Promise.resolve(outcome);
        }
        const scheduleJob =
          input.scheduleJobId === undefined
            ? {}
            : { scheduleJobId: input.scheduleJobId };
        const error = w.__LINKGO_LINKEDIN_PUBLISH_ERROR__;
        if (typeof error === "string" && error.trim() !== "") {
          return settlePublishAttempt({
            input: {
              approvalId,
              ...scheduleJob,
              status: "failed",
              errorMessage: error,
            },
          }).then(() => ({ status: "failed", executionId, message: error }));
        }
        const override = w.__LINKGO_LINKEDIN_PUBLISH_RESULT__ as
          | { platformPostId?: string; externalPostUrl?: string }
          | undefined;
        if (override !== undefined && !override.platformPostId?.trim()) {
          // Native classifies a 2xx without a parseable id as ambiguous.
          const now = new Date().toISOString();
          publishExecutionStore().push({
            id: executionId,
            kind: "post",
            subjectId: approvalId,
            campaignId: 1,
            campaignName: "Campaign",
            scheduleJobId: input.scheduleJobId ?? null,
            caller: "manual",
            status: "outcome_unknown",
            fence: 1,
            remoteOutcome: "ambiguous",
            remoteStatusCode: null,
            errorMessage:
              "LinkedIn accepted the request but the response could not be read",
            reservedAt: now,
            sentAt: now,
            updatedAt: now,
          });
          return Promise.resolve({
            status: "outcomeUnknown",
            executionId,
            message:
              "LinkedIn accepted the request but the response could not be read",
          });
        }
        const platformId =
          override?.platformPostId ?? `urn:li:ugcPost:test-${approvalId}`;
        const externalUrl =
          override?.externalPostUrl ??
          `https://www.linkedin.com/feed/update/${platformId}/`;
        return settlePublishAttempt({
          input: {
            approvalId,
            ...scheduleJob,
            status: "succeeded",
            externalPostUrl: externalUrl,
            platformPostId: platformId,
          },
        }).then(() => ({
          status: "succeeded",
          executionId,
          platformId,
          externalUrl,
        }));
      }
      if (cmd === "linkgo_publish_execution_list_open") {
        return Promise.resolve(
          publishExecutionStore().map((row) => ({ ...row })),
        );
      }
      if (cmd === "linkgo_publish_execution_reconcile") {
        const input =
          (
            args as
              | {
                  input?: {
                    executionId?: number;
                    fence?: number;
                    resolution?: string;
                    externalUrl?: string;
                    note?: string;
                    confirmation?: string;
                  };
                }
              | undefined
          )?.input ?? {};
        w.__LINKGO_PUBLISH_EXECUTION_RECONCILE_INPUTS__ = [
          ...((w.__LINKGO_PUBLISH_EXECUTION_RECONCILE_INPUTS__ as
            | unknown[]
            | undefined) ?? []),
          input,
        ];
        if (input.confirmation !== "RECONCILE") {
          throw new Error("Type RECONCILE to confirm");
        }
        const index = publishExecutionStore().findIndex(
          (row) => row.id === input.executionId,
        );
        const row = index === -1 ? undefined : publishExecutionStore()[index];
        if (row === undefined) {
          throw new Error("Publishing execution was not found");
        }
        if (row.status !== "outcome_unknown" || row.fence !== input.fence) {
          throw new Error(
            "This execution changed since it was loaded; refresh and try again",
          );
        }
        if (input.resolution === "posted") {
          const reference = (input.externalUrl ?? "").trim();
          if (reference === "") {
            throw new Error(
              "Paste the LinkedIn URL or URN of the published item",
            );
          }
          if (
            !reference.startsWith("https://www.linkedin.com/") &&
            !reference.startsWith("https://linkedin.com/") &&
            !reference.startsWith("urn:li:")
          ) {
            throw new Error(
              "Use a https://www.linkedin.com/ URL or a urn:li: identifier",
            );
          }
        } else if (input.resolution !== "not_posted") {
          throw new Error("Unknown reconciliation resolution");
        }
        publishExecutionStore().splice(index, 1);
        return Promise.resolve({
          executionId: row.id,
          status:
            input.resolution === "posted"
              ? "reconciled_posted"
              : "reconciled_not_posted",
        });
      }
      return Promise.resolve(null);
    };

    /**
     * Real Tauri v2 rejects `invoke` with the raw `Err(String)` payload of a
     * native command, never an `Error`; mirror that for every linkgo_* command.
     * `plugin:*` emulation keeps its existing behavior.
     */
    const invokeNativeCommandMock = (cmd: string, args?: unknown): unknown => {
      const toNativeRejection = (error: unknown): Promise<never> =>
        Promise.reject(error instanceof Error ? error.message : String(error));
      try {
        const result = dispatchMockInvoke(cmd, args);
        return result instanceof Promise
          ? result.catch(toNativeRejection)
          : result;
      } catch (error: unknown) {
        return toNativeRejection(error);
      }
    };

    w.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: unknown) =>
        cmd.startsWith("linkgo_")
          ? invokeNativeCommandMock(cmd, args)
          : dispatchMockInvoke(cmd, args),
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
