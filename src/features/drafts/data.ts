import { invokeCommand } from "@/lib/tauri";
import { DEFAULT_AGENT_MODELS } from "@/agent/providers";
import { z } from "zod";
import {
  draftGenerationRequestListSchema,
  draftListSnapshotSchema,
  draftWorkflowOptionListSchema,
} from "@/features/drafts/record-schemas";
import { reconcileStaleNativePlannerDraftAudits } from "@/workflows/draft-audit-commands";
import {
  createDraftSchema,
  draftAiAuditReconcileResultSchema,
  draftAiAuditStartResultSchema,
  draftGenerationClaimResultSchema,
  draftGenerationSettleResultSchema,
  draftMutationResultSchema,
  applyDraftQualityScoreInputSchema,
  completeDraftAiAuditRunSchema,
  dismissDraftGenerationRequestSchema,
  draftAiAuditFindingRowsSchema,
  draftAiAuditRunRowSchema,
  failDraftAiAuditRunSchema,
  generateDraftVariantsSchema,
  generatedDraftVariantSchema,
  reconcileDraftAiAuditLifecycleSchema,
  runDraftAiAuditSchema,
  saveGeneratedDraftSchema,
  setDraftVariantStatusSchema,
  startDraftAiAuditRunSchema,
  playbookKeySchema,
  updateDraftSchema,
  updateDraftVariantSchema,
} from "@/features/drafts/schemas";
import { buildDraftPromptSummary } from "@/features/drafts/prompt-routing";
import type {
  CandidateStatus,
  CandidateWithTarget,
} from "@/features/candidate-queue/types";
import { DRAFT_AI_AUDIT_RULE_KEYS } from "@/features/drafts/types";
import type {
  CompleteDraftAiAuditRunInput,
  CreateDraftInput,
  Draft,
  DraftAuditFinding,
  DraftAuditSeverity,
  DraftAiAuditFinding,
  DraftAiAuditRun,
  DraftAiAuditRunStatus,
  DraftGenerationRequest,
  DraftGenerationRequestStatus,
  DraftListPage,
  EligibleDraftWorkflowOption,
  DraftContentIntent,
  DraftStatus,
  DraftVariant,
  DraftVariantInput,
  DraftVariantStatus,
  DraftVariantWithAudits,
  DraftVariantAiAudit,
  DraftWithDetails,
  FailDraftAiAuditRunInput,
  GenerateDraftVariantsInput,
  GeneratedDraftVariant,
  ReconcileDraftAiAuditLifecycleInput,
  ReconcileDraftAiAuditLifecycleResult,
  RunDraftAiAuditInput,
  SaveGeneratedDraftInput,
  SetDraftVariantStatusInput,
  StartDraftAiAuditRunInput,
  ApplyDraftQualityScoreInput,
  ClaimDraftQualityInput,
  ContinueDraftQualityInput,
  DraftQualityCategoryScore,
  DraftQualityRun,
  DraftQualityScorecard,
  FailDraftQualityInput,
  ReconcileDraftQualityResult,
  UpdateDraftInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";

interface DraftRow {
  id: number;
  campaign_id: number;
  candidate_post_id: number;
  angle: string;
  notes: string;
  content_intent: DraftContentIntent;
  status: DraftStatus;
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

const SEVERITY_RANK: Record<DraftAuditSeverity, number> = {
  block: 0,
  warning: 1,
  pass: 2,
};

function normalizeVariantInput(
  input: DraftVariantInput,
): Required<DraftVariantInput> {
  return {
    hook: input.hook ?? "",
    body: input.body ?? "",
    cta: input.cta ?? "",
    hashtags: input.hashtags ?? "",
  };
}

function countHashtags(hashtags: string): number {
  return hashtags.match(/#[\p{L}\p{N}_-]+/gu)?.length ?? 0;
}

function hasExternalLink(text: string): boolean {
  return /https?:\/\/|www\./iu.test(text);
}

function createFinding(
  ruleKey: string,
  severity: DraftAuditSeverity,
  message: string,
): DraftAuditFinding {
  return { rule_key: ruleKey, severity, message };
}

const optionalCampaignIdSchema = z.number().int().positive().optional();

function campaignInput(campaignId?: number): { campaignId?: number } {
  const parsed = optionalCampaignIdSchema.parse(campaignId);
  return parsed === undefined ? {} : { campaignId: parsed };
}

function mapCandidate(row: DraftRow): CandidateWithTarget {
  return {
    id: row.candidate_post_id,
    campaign_id: row.campaign_id,
    target_post_id: row.target_id,
    source_keyword: row.candidate_source_keyword,
    status: row.candidate_status,
    relevance_score: row.candidate_relevance_score,
    score_reason: row.candidate_score_reason,
    notes: row.candidate_notes,
    created_at: row.candidate_created_at,
    updated_at: row.candidate_updated_at,
    campaign_name: row.campaign_name,
    target: {
      id: row.target_id,
      platform: row.target_platform,
      url: row.target_url,
      normalized_url: row.target_normalized_url,
      platform_resource_urn: row.target_platform_resource_urn,
      author_name: row.target_author_name,
      author_profile_url: row.target_author_profile_url,
      posted_at: row.target_posted_at,
      content: row.target_content,
      content_hash: row.target_content_hash,
      created_at: row.target_created_at,
      updated_at: row.target_updated_at,
    },
  };
}

function mapGeneratedVariants(value: string): GeneratedDraftVariant[] {
  try {
    return generatedDraftVariantSchema.array().parse(JSON.parse(value));
  } catch {
    return [];
  }
}

function mapGenerationCandidate(
  row: DraftGenerationRequestRow,
): CandidateWithTarget {
  return {
    id: row.candidate_post_id,
    campaign_id: row.campaign_id,
    target_post_id: row.target_id,
    source_keyword: row.candidate_source_keyword,
    status: row.candidate_status,
    relevance_score: row.candidate_relevance_score,
    score_reason: row.candidate_score_reason,
    notes: row.candidate_notes,
    created_at: row.candidate_created_at,
    updated_at: row.candidate_updated_at,
    campaign_name: row.campaign_name,
    target: {
      id: row.target_id,
      platform: row.target_platform,
      url: row.target_url,
      normalized_url: row.target_normalized_url,
      platform_resource_urn: row.target_platform_resource_urn,
      author_name: row.target_author_name,
      author_profile_url: row.target_author_profile_url,
      posted_at: row.target_posted_at,
      content: row.target_content,
      content_hash: row.target_content_hash,
      created_at: row.target_created_at,
      updated_at: row.target_updated_at,
    },
  };
}

function mapDraftGenerationRequest(
  row: DraftGenerationRequestRow,
  generatedVariants = mapGeneratedVariants(row.generated_variants_json),
): DraftGenerationRequest {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    candidate_post_id: row.candidate_post_id,
    agent_run_id: row.agent_run_id,
    provider_key: row.provider_key,
    model_name: row.model_name,
    playbook_key: row.playbook_key,
    variant_count: row.variant_count,
    content_intent: row.content_intent,
    workflow_run_id: row.workflow_run_id,
    workflow_step_id: row.workflow_step_id,
    angle: row.angle,
    voice_notes: row.voice_notes,
    status: row.status,
    summary: row.summary,
    generated_variants: generatedVariants,
    error_message: row.error_message,
    created_draft_id: row.created_draft_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    candidate: mapGenerationCandidate(row),
  };
}
export function mapDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    candidate_post_id: row.candidate_post_id,
    angle: row.angle,
    notes: row.notes,
    content_intent: row.content_intent,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDraftVariantBase(row: DraftVariantRow): DraftVariant {
  return {
    id: row.id,
    draft_id: row.draft_id,
    variant_number: row.variant_number,
    hook: row.hook,
    body: row.body,
    cta: row.cta,
    hashtags: row.hashtags,
    content_revision: row.content_revision,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDraftAiAuditRun(row: DraftAiAuditRunRow): DraftAiAuditRun {
  return draftAiAuditRunRowSchema.parse(row);
}

function mapCurrentDraftAiAudit(
  run: DraftAiAuditRun | undefined,
  findingRows: DraftAiAuditFinding[],
): DraftVariantAiAudit {
  if (run === undefined) return { status: null, run: null, findings: [] };

  const findings =
    run.status === "completed"
      ? draftAiAuditFindingRowsSchema
          .parse(findingRows)
          .sort(
            (left, right) =>
              DRAFT_AI_AUDIT_RULE_KEYS.indexOf(left.rule_key) -
              DRAFT_AI_AUDIT_RULE_KEYS.indexOf(right.rule_key),
          )
      : [];

  return { status: run.status, run, findings };
}

export function mapDraftAudit(row: DraftAuditRow): DraftAuditFinding {
  return {
    id: row.id,
    draft_variant_id: row.draft_variant_id,
    rule_key: row.rule_key,
    severity: row.severity,
    message: row.message,
    created_at: row.created_at,
  };
}

export function getAuditSeverity(
  audits: DraftAuditFinding[],
): DraftAuditSeverity {
  if (audits.some((audit) => audit.severity === "block")) return "block";
  if (audits.some((audit) => audit.severity === "warning")) return "warning";
  return "pass";
}

export function mapDraftVariant(
  row: DraftVariantRow,
  audits: DraftAuditFinding[],
  aiAudit: DraftVariantAiAudit = { status: null, run: null, findings: [] },
): DraftVariantWithAudits {
  return {
    ...mapDraftVariantBase(row),
    audits,
    auditSeverity: getAuditSeverity(audits),
    aiAudit,
    qualityScorecard: null,
  };
}

export function auditDraftVariant(
  input: DraftVariantInput,
): DraftAuditFinding[] {
  const variant = normalizeVariantInput(input);
  const hook = variant.hook.trim();
  const body = variant.body.trim();
  const cta = variant.cta.trim();
  const hashtags = variant.hashtags.trim();
  const combined = `${hook}${body}${cta}${hashtags}`;
  const combinedWithSpaces = `${hook} ${body} ${cta} ${hashtags}`.trim();
  const findings: DraftAuditFinding[] = [];

  if (!hook && !body) {
    findings.push(
      createFinding(
        "required_text",
        "block",
        "Add a hook or body before this variant can be reviewed.",
      ),
    );
  } else {
    findings.push(
      createFinding(
        "required_text",
        "pass",
        "This variant has draft text to review.",
      ),
    );
  }

  if (combined.length > 3000) {
    findings.push(
      createFinding(
        "total_length",
        "block",
        "Keep the combined hook, body, CTA, and hashtags under 3,000 characters.",
      ),
    );
  } else {
    findings.push(
      createFinding(
        "total_length",
        "pass",
        "This variant stays under the 3,000 character limit.",
      ),
    );
  }

  if (hasExternalLink(`${hook} ${body} ${cta}`)) {
    findings.push(
      createFinding(
        "external_link",
        "block",
        "Remove external links from the hook, body, and CTA before review.",
      ),
    );
  } else {
    findings.push(
      createFinding(
        "external_link",
        "pass",
        "No external link was found in the hook, body, or CTA.",
      ),
    );
  }

  if (countHashtags(hashtags) > 5) {
    findings.push(
      createFinding("hashtag_limit", "block", "Use five or fewer hashtags."),
    );
  } else {
    findings.push(
      createFinding(
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
      createFinding(
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
      createFinding(
        "specificity",
        "warning",
        "Add a number or first-person signal so the draft feels specific.",
      ),
    );
  }

  return findings.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      left.rule_key.localeCompare(right.rule_key),
  );
}

/**
 * Creates a manual draft natively: candidate eligibility, the draft, its
 * variants with deterministic audits (computed natively) and the candidate
 * status change settle in one transaction.
 */
export async function createDraft(input: CreateDraftInput): Promise<number> {
  const parsed = createDraftSchema.parse(input);
  return draftMutationResultSchema.parse(
    await invokeCommand("linkgo_draft_create", { input: parsed }),
  ).id;
}

interface EligibleDraftWorkflowOptionRow {
  workflow_run_id: number;
  workflow_step_id: number;
  candidate_id: number;
  title: string;
  status: EligibleDraftWorkflowOption["status"];
}

export async function listEligibleDraftWorkflowOptions(
  campaignId: number,
): Promise<EligibleDraftWorkflowOption[]> {
  const rows: EligibleDraftWorkflowOptionRow[] =
    draftWorkflowOptionListSchema.parse(
      await invokeCommand("linkgo_draft_workflow_options", {
        input: { campaignId: z.number().int().positive().parse(campaignId) },
      }),
    );

  return rows.map((row) => ({
    workflowRunId: row.workflow_run_id,
    workflowStepId: row.workflow_step_id,
    candidateId: row.candidate_id,
    title: row.title,
    status: row.status,
  }));
}

export async function listDraftGenerationRequests(
  campaignId?: number,
): Promise<DraftGenerationRequest[]> {
  const rows: DraftGenerationRequestRow[] = draftGenerationRequestListSchema
    .parse(
      await invokeCommand("linkgo_draft_generation_request_list", {
        input: campaignInput(campaignId),
      }),
    )
    .map((row) => ({
      ...row,
      playbook_key: playbookKeySchema.parse(row.playbook_key),
    }));

  return rows.map((row) => mapDraftGenerationRequest(row));
}

/**
 * Generates draft variants through a drafter agent run. Every write is
 * native: claim (request + linked draft step), link the agent run, then
 * settle, where native reads the drafter's own draft_post output and
 * cross-checks it against the durable request. On any failure the request
 * is failed and a linked draft step is blocked, in one transaction.
 */
export async function generateDraftVariants(
  input: GenerateDraftVariantsInput,
): Promise<number> {
  const parsed = generateDraftVariantsSchema.parse(input);
  const claimed = draftGenerationClaimResultSchema.parse(
    await invokeCommand("linkgo_draft_generation_claim", {
      input: parsed,
    }),
  );
  const requestId = claimed.requestId;
  const inputSummary = buildDraftPromptSummary({
    intent: parsed.contentIntent,
    variantCount: parsed.variantCount,
    angle: parsed.angle,
    voiceNotes: parsed.voiceNotes,
  });
  const inputContext = {
    draftRequest: {
      draftGenerationRequestId: requestId,
      campaignId: claimed.campaignId,
      candidatePostId: parsed.candidateId,
      variantCount: parsed.variantCount,
      contentIntent: parsed.contentIntent,
    },
    referenceData: claimed.candidateContext,
  };

  let failureMessage: string | null = null;
  try {
    const { createAgentRun, startAgentRun } =
      await import("@/features/agent-runtime/data");
    const agentRunId = await createAgentRun({
      campaignId: claimed.campaignId,
      ...(claimed.workflowRunId === null
        ? {}
        : { workflowRunId: claimed.workflowRunId }),
      agentRole: "drafter",
      providerKey: parsed.providerKey,
      modelName: parsed.modelName,
      playbookKey: parsed.playbookKey,
      inputSummary,
      inputContext,
    });
    await invokeCommand("linkgo_draft_generation_link_agent_run", {
      input: { requestId, agentRunId },
    });
    await startAgentRun({ id: agentRunId });
  } catch (caught) {
    failureMessage =
      caught instanceof Error ? caught.message : "Draft generation failed";
  }

  let settled: { status: string; errorMessage: string };
  try {
    settled = draftGenerationSettleResultSchema.parse(
      await invokeCommand("linkgo_draft_generation_settle", {
        input: { requestId, failureMessage },
      }),
    );
  } catch (settlementError) {
    throw Object.assign(
      new Error("Draft generation failure could not be settled"),
      { cause: settlementError },
    );
  }
  if (settled.status !== "generated") {
    throw new Error(settled.errorMessage || "Draft generation failed");
  }
  return requestId;
}

/**
 * Saves a generated request as a draft natively: the draft, variants with
 * natively computed audits, the request status and any linked workflow
 * advance (draft complete, audit started) settle in one transaction.
 */
export async function saveGeneratedDraft(
  input: SaveGeneratedDraftInput,
): Promise<number> {
  const parsed = saveGeneratedDraftSchema.parse(input);
  return draftMutationResultSchema.parse(
    await invokeCommand("linkgo_draft_generation_save", {
      input: parsed,
    }),
  ).id;
}

/**
 * Dismisses a request natively, cancelling an interrupted drafter run and
 * blocking its linked workflow draft step in the same transaction.
 */
export async function dismissDraftGenerationRequest(id: number): Promise<void> {
  const parsed = dismissDraftGenerationRequestSchema.parse({ id });
  draftMutationResultSchema.parse(
    await invokeCommand("linkgo_draft_generation_dismiss", {
      input: parsed,
    }),
  );
}

export async function claimDraftQuality(
  input: ClaimDraftQualityInput,
): Promise<{
  qualityRunId: number;
  attemptId: number;
  agentRunId: number;
  campaignId: number;
  draftVariantId: number;
  contentRevision: number;
}> {
  return invokeCommand("linkgo_draft_quality_claim", {
    input: { providerKey: "dry_run", modelName: "dry-run-local", ...input },
  });
}

export async function applyDraftQualityScore(
  input: ApplyDraftQualityScoreInput,
): Promise<unknown> {
  return invokeCommand("linkgo_draft_quality_apply_score", {
    input: applyDraftQualityScoreInputSchema.parse(input),
  });
}

export async function continueDraftQuality(
  input: ContinueDraftQualityInput,
): Promise<unknown> {
  return invokeCommand("linkgo_draft_quality_continue", { input });
}

export async function resumeDraftQuality(
  input: ContinueDraftQualityInput,
): Promise<unknown> {
  return invokeCommand("linkgo_draft_quality_resume", { input });
}

export async function failDraftQuality(
  input: FailDraftQualityInput,
): Promise<void> {
  await invokeCommand("linkgo_draft_quality_fail", { input });
}

export async function reconcileStaleDraftQuality(
  limit = 25,
): Promise<ReconcileDraftQualityResult> {
  return invokeCommand("linkgo_draft_quality_reconcile_stale", {
    input: { limit },
  });
}

export async function listDrafts(
  campaignId?: number,
): Promise<DraftWithDetails[]> {
  return (await listDraftPage(campaignId)).items;
}

/**
 * Same as `listDrafts`, plus `totalCount`: the uncapped number of matching
 * drafts, so callers can tell when `items` was truncated.
 */
export async function listDraftPage(
  campaignId?: number,
): Promise<DraftListPage> {
  // One native snapshot (`drafts_reads.rs`): capped at 500 drafts, with
  // current-revision AI audits and quality scorecards only.
  const snapshot = draftListSnapshotSchema.parse(
    await invokeCommand("linkgo_draft_list", {
      input: campaignInput(campaignId),
    }),
  );
  return {
    items: mapDraftSnapshot(snapshot),
    totalCount: Math.max(snapshot.totalCount, snapshot.drafts.length),
  };
}

function mapDraftSnapshot(
  snapshot: z.infer<typeof draftListSnapshotSchema>,
): DraftWithDetails[] {
  const rows: DraftRow[] = snapshot.drafts;
  if (rows.length === 0) return [];
  const variantRows: DraftVariantRow[] = snapshot.variants;
  const auditRows: DraftAuditRow[] = snapshot.audits;

  const currentAiAuditRunByVariantId = new Map<number, DraftAiAuditRun>();
  for (const runRow of snapshot.aiAuditRuns) {
    currentAiAuditRunByVariantId.set(
      runRow.draft_variant_id,
      mapDraftAiAuditRun(runRow),
    );
  }
  const aiAuditFindingsByRunId = new Map<number, DraftAiAuditFinding[]>();
  for (const findingRow of snapshot.aiAuditFindings) {
    const runFindings =
      aiAuditFindingsByRunId.get(findingRow.audit_run_id) ?? [];
    runFindings.push(findingRow);
    aiAuditFindingsByRunId.set(findingRow.audit_run_id, runFindings);
  }

  const currentQualityRunByVariantId = new Map<number, DraftQualityRun>();
  for (const run of snapshot.qualityRuns)
    currentQualityRunByVariantId.set(run.draft_variant_id, run);
  const qualityScoresByAttemptId = new Map<
    number,
    DraftQualityCategoryScore[]
  >();
  for (const score of snapshot.qualityScores)
    qualityScoresByAttemptId.set(score.attempt_id, [
      ...(qualityScoresByAttemptId.get(score.attempt_id) ?? []),
      score,
    ]);
  const qualityAttemptsByRunId = new Map<
    number,
    DraftQualityScorecard["attempts"]
  >();
  for (const attempt of snapshot.qualityAttempts)
    qualityAttemptsByRunId.set(attempt.run_id, [
      ...(qualityAttemptsByRunId.get(attempt.run_id) ?? []),
      {
        ...attempt,
        categoryScores: qualityScoresByAttemptId.get(attempt.id) ?? [],
      },
    ]);

  const auditsByVariantId = new Map<number, DraftAuditFinding[]>();
  for (const auditRow of auditRows) {
    const audits = auditsByVariantId.get(auditRow.draft_variant_id) ?? [];
    audits.push(mapDraftAudit(auditRow));
    auditsByVariantId.set(auditRow.draft_variant_id, audits);
  }

  for (const audits of auditsByVariantId.values()) {
    audits.sort(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        left.rule_key.localeCompare(right.rule_key),
    );
  }

  const variantsByDraftId = new Map<number, DraftVariantWithAudits[]>();
  for (const variantRow of variantRows) {
    const variants = variantsByDraftId.get(variantRow.draft_id) ?? [];
    const currentAiAuditRun = currentAiAuditRunByVariantId.get(variantRow.id);
    variants.push({
      ...mapDraftVariant(
        variantRow,
        auditsByVariantId.get(variantRow.id) ?? [],
        mapCurrentDraftAiAudit(
          currentAiAuditRun,
          currentAiAuditRun === undefined
            ? []
            : (aiAuditFindingsByRunId.get(currentAiAuditRun.id) ?? []),
        ),
      ),
      qualityScorecard: (() => {
        const run = currentQualityRunByVariantId.get(variantRow.id);
        return run === undefined
          ? null
          : { run, attempts: qualityAttemptsByRunId.get(run.id) ?? [] };
      })(),
    });
    variantsByDraftId.set(variantRow.draft_id, variants);
  }

  return rows.map((row) => ({
    ...mapDraft(row),
    campaign_name: row.campaign_name,
    candidate: mapCandidate(row),
    variants: variantsByDraftId.get(row.id) ?? [],
  }));
}

export async function updateDraft(input: UpdateDraftInput): Promise<void> {
  const parsed = updateDraftSchema.parse(input);
  // Native re-validates, sets only provided fields, and writes in one
  // transaction; a missing id is a silent no-op as before.
  await invokeCommand<null>("linkgo_draft_update", { input: parsed });
}

/** Edits variant text natively; changed text is re-audited in the same transaction. */
export async function updateDraftVariant(
  input: UpdateDraftVariantInput,
): Promise<void> {
  const parsed = updateDraftVariantSchema.parse(input);
  draftMutationResultSchema.parse(
    await invokeCommand("linkgo_draft_variant_update", {
      input: parsed,
    }),
  );
}

/** Selects, rejects or resets a variant natively, updating the draft status. */
export async function setDraftVariantStatus(
  input: SetDraftVariantStatusInput,
): Promise<void> {
  const parsed = setDraftVariantStatusSchema.parse(input);
  draftMutationResultSchema.parse(
    await invokeCommand("linkgo_draft_variant_set_status", {
      input: parsed,
    }),
  );
}

export async function archiveDraft(id: number): Promise<void> {
  const parsed = updateDraftSchema.pick({ id: true }).parse({ id });
  await updateDraft({ id: parsed.id, status: "archived" });
}

export function boundDraftAiAuditError(caught: unknown): string {
  const detail =
    caught instanceof Error ? caught.message : "Draft AI audit failed";
  if (detail.length <= 1000) return detail || "Draft AI audit failed";
  return `${detail.slice(0, 999)}…`;
}

/**
 * Fails stale draft AI audits natively. Planner-linked audits are reconciled
 * by the planner command; standalone reservations, executions and orphaned
 * auditor agents are reconciled in one native transaction.
 */
export async function reconcileDraftAiAuditLifecycle(
  input: ReconcileDraftAiAuditLifecycleInput = {},
): Promise<ReconcileDraftAiAuditLifecycleResult> {
  const parsed = reconcileDraftAiAuditLifecycleSchema.parse(input);
  const linked = await reconcileStaleNativePlannerDraftAudits({
    limit: parsed.maxAuditRuns,
  });
  const standalone = draftAiAuditReconcileResultSchema.parse(
    await invokeCommand("linkgo_draft_ai_audit_reconcile", {
      input: parsed,
    }),
  );
  return {
    failedAuditRunIds: [
      ...linked.failedAuditRunIds,
      ...standalone.failedAuditRunIds,
    ],
    failedAgentRunIds: [
      ...linked.failedAgentRunIds,
      ...standalone.failedAgentRunIds,
    ],
    failedExecutionIds: linked.failedExecutionIds,
    failedWorkflowRunIds: linked.failedWorkflowRunIds,
    clearedApprovalCheckpointCount: standalone.clearedApprovalCheckpointCount,
  };
}

/**
 * Runs a standalone AI audit for the variant's current revision. Native
 * reserves the run and returns the canonical text; the renderer runs the
 * auditor agent; native then reads the auditor's own findings and completes
 * the run, or fails it (and the agent) on any error.
 */
export async function runDraftAiAudit(
  input: RunDraftAiAuditInput,
): Promise<number> {
  const parsed = runDraftAiAuditSchema.parse(input);
  const modelName =
    parsed.modelName || DEFAULT_AGENT_MODELS[parsed.providerKey];
  const started = draftAiAuditStartResultSchema.parse(
    await invokeCommand("linkgo_draft_ai_audit_start", {
      input: {
        draftVariantId: parsed.draftVariantId,
        providerKey: parsed.providerKey,
        modelName,
      },
    }),
  );
  const auditRun = started.run;
  let agentRunId: number | null = null;

  try {
    const { createAgentRun, startAgentRun } =
      await import("@/features/agent-runtime/data");
    agentRunId = await createAgentRun({
      campaignId: started.campaignId,
      agentRole: "auditor",
      providerKey: parsed.providerKey,
      modelName,
      playbookKey: "linkedin_humanizer",
      inputSummary: `Audit draft variant #${auditRun.draft_variant_id} revision ${auditRun.content_revision}.`,
      inputContext: {
        auditRequest: {
          campaignId: started.campaignId,
          draftVariantId: auditRun.draft_variant_id,
          contentRevision: auditRun.content_revision,
          auditRunId: auditRun.id,
          text: started.text,
        },
      },
    });
    await invokeCommand("linkgo_draft_ai_audit_link_agent_run", {
      input: { auditRunId: auditRun.id, agentRunId },
    });
    await startAgentRun({ id: agentRunId });
    await completeDraftAiAuditRun({
      auditRunId: auditRun.id,
      draftVariantId: auditRun.draft_variant_id,
      contentRevision: auditRun.content_revision,
    });
  } catch (caught) {
    const errorMessage = boundDraftAiAuditError(caught);
    try {
      await invokeCommand("linkgo_draft_ai_audit_fail", {
        input: {
          auditRunId: auditRun.id,
          draftVariantId: auditRun.draft_variant_id,
          contentRevision: auditRun.content_revision,
          errorMessage,
          agentRunId,
        },
      });
    } catch (settlementError) {
      throw Object.assign(
        new Error("Draft AI audit failure could not be settled"),
        { cause: settlementError },
      );
    }
    throw Object.assign(new Error(errorMessage), { cause: caught });
  }

  return auditRun.id;
}

/** Reserves a running audit for the given (current) revision natively. */
export async function startDraftAiAuditRun(
  input: StartDraftAiAuditRunInput,
): Promise<DraftAiAuditRun> {
  const parsed = startDraftAiAuditRunSchema.parse(input);
  return mapDraftAiAuditRun(
    draftAiAuditStartResultSchema.parse(
      await invokeCommand("linkgo_draft_ai_audit_start", {
        input: parsed,
      }),
    ).run,
  );
}

/**
 * Completes an audit natively from its linked auditor's own persisted
 * `audit_post` output; callers never supply findings.
 */
export async function completeDraftAiAuditRun(
  input: CompleteDraftAiAuditRunInput,
): Promise<void> {
  const parsed = completeDraftAiAuditRunSchema.parse(input);
  draftAiAuditRunRowSchema.parse(
    await invokeCommand("linkgo_draft_ai_audit_complete", {
      input: parsed,
    }),
  );
}

export async function failDraftAiAuditRun(
  input: FailDraftAiAuditRunInput,
): Promise<void> {
  const parsed = failDraftAiAuditRunSchema.parse(input);
  draftAiAuditRunRowSchema.parse(
    await invokeCommand("linkgo_draft_ai_audit_fail", {
      input: parsed,
    }),
  );
}
