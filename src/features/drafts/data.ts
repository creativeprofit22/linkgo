import {
  draftPostInputSchema,
  draftPostOutputSchema,
} from "@/agent/schemas";
import { createAgentRun, startAgentRun } from "@/features/agent-runtime/data";
import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  blockLinkedDraftGenerationInTransaction,
  claimLinkedDraftGenerationInTransaction,
  completeLinkedDraftSaveInTransaction,
  validateLinkedDraftSaveInTransaction,
} from "@/workflows/draft-generation";
import {
  createDraftSchema,
  dismissDraftGenerationRequestSchema,
  generateDraftVariantsSchema,
  generatedDraftVariantSchema,
  saveGeneratedDraftSchema,
  setDraftVariantStatusSchema,
  updateDraftSchema,
  updateDraftVariantSchema,
} from "@/features/drafts/schemas";
import { buildDraftPromptSummary } from "@/features/drafts/prompt-routing";
import type { CampaignStatus } from "@/features/campaigns/types";
import type {
  CandidateStatus,
  CandidateWithTarget,
} from "@/features/candidate-queue/types";
import type {
  CreateDraftInput,
  Draft,
  DraftAuditFinding,
  DraftAuditSeverity,
  DraftGenerationRequest,
  DraftGenerationRequestStatus,
  EligibleDraftWorkflowOption,
  DraftContentIntent,
  DraftStatus,
  DraftVariant,
  DraftVariantInput,
  DraftVariantStatus,
  DraftVariantWithAudits,
  DraftWithDetails,
  GenerateDraftVariantsInput,
  GeneratedDraftVariant,
  SaveGeneratedDraftInput,
  SetDraftVariantStatusInput,
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

interface SelectedCountRow {
  selected_count: number;
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

function getPlaceholders(ids: number[]): string {
  return ids.map((_, index) => `$${index + 1}`).join(", ");
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

function generatedHashtagsToDraftString(hashtags: string[]): string {
  return hashtags
    .map((hashtag) => hashtag.trim())
    .filter(Boolean)
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`))
    .join(" ");
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
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
): DraftVariantWithAudits {
  return {
    ...mapDraftVariantBase(row),
    audits,
    auditSeverity: getAuditSeverity(audits),
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

async function rollbackDraftTransaction(db: LinkgoDatabase): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}

interface CampaignMutationStatusRow {
  status: CampaignStatus;
}

async function assertCampaignMutableInTransaction(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<void> {
  const campaigns = await db.select<CampaignMutationStatusRow[]>(
    "SELECT status FROM campaigns WHERE id = $1 LIMIT 1",
    [campaignId],
  );
  const campaign = campaigns[0];
  if (campaign === undefined) throw new Error("Campaign was not found");
  if (campaign.status === "archived") throw new Error("Campaign is archived");
}

async function insertAuditFindings(
  db: LinkgoDatabase,
  variantId: number,
  findings: DraftAuditFinding[],
): Promise<void> {
  for (const finding of findings) {
    await db.execute(
      `INSERT INTO draft_audits (draft_variant_id, rule_key, severity, message)
      VALUES ($1, $2, $3, $4)`,
      [variantId, finding.rule_key, finding.severity, finding.message],
    );
  }
}

interface DraftInsertInput {
  campaignId: number;
  candidateId: number;
  angle: string;
  notes: string;
  contentIntent: DraftContentIntent;
  variants: CreateDraftInput["variants"];
}

async function insertDraftInTransaction(
  db: LinkgoDatabase,
  input: DraftInsertInput,
): Promise<number> {
  const draftResult = await db.execute(
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
    const variantResult = await db.execute(
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
    await insertAuditFindings(
      db,
      variantResult.lastInsertId,
      auditDraftVariant(variant),
    );
  }

  const candidateUpdate = await db.execute(
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

export async function createDraft(input: CreateDraftInput): Promise<number> {
  const parsed = createDraftSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN IMMEDIATE");
  try {
    const candidate = await getEligibleDraftCandidate(db, parsed.candidateId);
    const draftId = await insertDraftInTransaction(db, {
      campaignId: candidate.campaign_id,
      candidateId: parsed.candidateId,
      angle: parsed.angle,
      notes: parsed.notes,
      contentIntent: parsed.contentIntent,
      variants: parsed.variants,
    });
    await db.execute("COMMIT");
    return draftId;
  } catch (error) {
    await rollbackDraftTransaction(db);
    throw error;
  }
}

async function getEligibleDraftCandidate(
  db: LinkgoDatabase,
  candidateId: number,
  campaignId?: number,
  includeGenerationContext = false,
): Promise<DraftCandidateRow | DraftCandidateContextRow> {
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
  const candidates = await db.select<DraftCandidateRow[]>(
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
  await assertCampaignMutableInTransaction(db, candidate.campaign_id);
  if (candidate.candidate_status === "rejected") {
    throw new Error("Rejected candidates cannot be drafted");
  }
  if (candidate.candidate_status === "drafted") {
    throw new Error("Candidate already has a draft");
  }
  return candidate;
}

async function loadDraftGenerationRequestRow(
  db: LinkgoDatabase,
  id: number,
): Promise<DraftGenerationRequestRow> {
  const rows = await db.select<DraftGenerationRequestRow[]>(
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

function getDraftGenerationSelectSql(whereClause: string): string {
  return `SELECT
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
    ${whereClause}`;
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
  const db = await getDb();
  const rows = await db.select<EligibleDraftWorkflowOptionRow[]>(
    `SELECT
      wr.id AS workflow_run_id,
      ws.id AS workflow_step_id,
      cp.id AS candidate_id,
      wr.title,
      wr.status
    FROM workflow_runs wr
    INNER JOIN workflow_steps ws
      ON ws.workflow_run_id = wr.id
      AND ws.step_key = 'draft'
    INNER JOIN workflow_artifacts wa
      ON wa.workflow_run_id = wr.id
      AND wa.artifact_type = 'candidate_post'
    INNER JOIN candidate_posts cp
      ON cp.id = wa.artifact_id
      AND cp.campaign_id = wr.campaign_id
    WHERE wr.campaign_id = $1
      AND wr.current_step_key = 'draft'
      AND wr.status IN ('running', 'blocked', 'failed')
      AND ws.status IN ('pending', 'running', 'blocked', 'failed')
      AND cp.status IN ('new', 'shortlisted')
      AND cp.relevance_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM draft_generation_requests dgr
        WHERE dgr.workflow_step_id = ws.id
          AND dgr.status IN ('pending', 'generated')
      )
    ORDER BY datetime(wr.updated_at) DESC, wr.id DESC, wa.id ASC`,
    [campaignId],
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
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE dgr.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<DraftGenerationRequestRow[]>(
    `${getDraftGenerationSelectSql(whereClause)}
    ORDER BY CASE dgr.status
      WHEN 'generated' THEN 1
      WHEN 'failed' THEN 2
      WHEN 'pending' THEN 3
      WHEN 'saved' THEN 4
      WHEN 'dismissed' THEN 5
      ELSE 6
    END, datetime(dgr.updated_at) DESC, dgr.id DESC`,
    values,
  );

  return rows.map((row) => mapDraftGenerationRequest(row));
}

function truncateDraftReference(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}â€¦`;
}

function buildDraftGenerationContext(
  parsed: ReturnType<typeof generateDraftVariantsSchema.parse>,
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
        name: truncateDraftReference(candidate.campaign_name, 160),
        product: truncateDraftReference(candidate.campaign_product, 500),
        audience: truncateDraftReference(candidate.campaign_audience, 500),
        voice: truncateDraftReference(candidate.campaign_voice, 500),
        tone: truncateDraftReference(candidate.campaign_tone, 500),
      },
      candidate: {
        id: candidate.candidate_id,
        sourceKeyword: truncateDraftReference(
          candidate.candidate_source_keyword,
          160,
        ),
        relevanceScore: candidate.candidate_relevance_score,
        scoreReason: truncateDraftReference(
          candidate.candidate_score_reason,
          500,
        ),
        notes: truncateDraftReference(candidate.candidate_notes, 500),
        targetAuthorName: truncateDraftReference(
          candidate.target_author_name,
          160,
        ),
        targetContent: truncateDraftReference(candidate.target_content, 2000),
      },
    },
  };
}

function assertDraftToolMatchesRequest(
  row: DraftToolCallRow,
  request: {
    requestId: number;
    campaignId: number;
    candidateId: number;
    variantCount: number;
    contentIntent: DraftContentIntent;
  },
): ReturnType<typeof draftPostOutputSchema.parse> {
  const toolInput = draftPostInputSchema.parse(JSON.parse(row.input_json));
  if (
    toolInput.draftGenerationRequestId !== request.requestId ||
    toolInput.campaignId !== request.campaignId ||
    toolInput.candidatePostId !== request.candidateId ||
    toolInput.variantCount !== request.variantCount ||
    toolInput.contentIntent !== request.contentIntent
  ) {
    throw new Error("Drafter tool input did not match the durable request");
  }
  const output = draftPostOutputSchema.parse(JSON.parse(row.output_json));
  if (output.variants.length !== request.variantCount) {
    throw new Error(
      "Drafter output did not contain the requested variant count",
    );
  }
  if (JSON.stringify(output.variants) !== JSON.stringify(toolInput.variants)) {
    throw new Error(
      "Drafter output did not preserve provider-authored variants",
    );
  }
  return output;
}

export async function generateDraftVariants(
  input: GenerateDraftVariantsInput,
): Promise<number> {
  const parsed = generateDraftVariantsSchema.parse(input);
  const db = await getDb();
  const candidate = (await getEligibleDraftCandidate(
    db,
    parsed.candidateId,
    parsed.campaignId,
    true,
  )) as DraftCandidateContextRow;
  const inputSummary = buildDraftPromptSummary({
    intent: parsed.contentIntent,
    variantCount: parsed.variantCount,
    angle: parsed.angle,
    voiceNotes: parsed.voiceNotes,
  });

  const { requestId, linkedScope } = await (async () => {
    await db.execute("BEGIN IMMEDIATE");
    try {
      const claimedScope = await claimLinkedDraftGenerationInTransaction(db, {
        workflowRunId: parsed.workflowRunId,
        campaignId: candidate.campaign_id,
        candidateId: parsed.candidateId,
      });
      const requestResult = await db.execute(
        `INSERT INTO draft_generation_requests (
          campaign_id, candidate_post_id, provider_key, model_name, playbook_key,
          variant_count, content_intent, workflow_run_id, workflow_step_id, angle,
          voice_notes, status, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', datetime('now')
        )`,
        [
          candidate.campaign_id,
          parsed.candidateId,
          parsed.providerKey,
          parsed.modelName,
          parsed.playbookKey,
          parsed.variantCount,
          parsed.contentIntent,
          claimedScope?.workflowRunId ?? null,
          claimedScope?.workflowStepId ?? null,
          parsed.angle,
          parsed.voiceNotes,
        ],
      );
      await db.execute("COMMIT");
      return {
        requestId: requestResult.lastInsertId,
        linkedScope: claimedScope,
      };
    } catch (error) {
      await rollbackDraftTransaction(db);
      throw error;
    }
  })();

  const inputContext = buildDraftGenerationContext(
    parsed,
    candidate,
    requestId,
  );

  try {
    const agentRunId = await createAgentRun({
      campaignId: candidate.campaign_id,
      ...(linkedScope === null
        ? {}
        : { workflowRunId: linkedScope.workflowRunId }),
      agentRole: "drafter",
      providerKey: parsed.providerKey,
      modelName: parsed.modelName,
      playbookKey: parsed.playbookKey,
      inputSummary,
      inputContext,
    });
    const linkResult = await db.execute(
      `UPDATE draft_generation_requests
      SET agent_run_id = $1, updated_at = datetime('now')
      WHERE id = $2 AND status = 'pending'`,
      [agentRunId, requestId],
    );
    if (linkResult.rowsAffected !== 1) {
      throw new Error(
        "Draft generation request could not be linked to its agent run",
      );
    }

    await startAgentRun({ id: agentRunId });
    const toolRows = await db.select<DraftToolCallRow[]>(
      `SELECT input_json, output_json
      FROM agent_tool_calls
      WHERE agent_run_id = $1 AND tool_name = 'draft_post' AND status = 'completed'
      ORDER BY id DESC
      LIMIT 2`,
      [agentRunId],
    );
    if (toolRows.length !== 1 || toolRows[0] === undefined) {
      throw new Error(
        "Drafter must return exactly one completed draft_post call",
      );
    }
    const output = assertDraftToolMatchesRequest(toolRows[0], {
      requestId,
      campaignId: candidate.campaign_id,
      candidateId: parsed.candidateId,
      variantCount: parsed.variantCount,
      contentIntent: parsed.contentIntent,
    });
    const generatedResult = await db.execute(
      `UPDATE draft_generation_requests
      SET status = 'generated',
        summary = $1,
        generated_variants_json = $2,
        error_message = '',
        updated_at = datetime('now')
      WHERE id = $3 AND status = 'pending'`,
      [output.summary, JSON.stringify(output.variants), requestId],
    );
    if (generatedResult.rowsAffected !== 1) {
      throw new Error("Draft generation request is no longer pending");
    }
  } catch (caught) {
    const message = truncateDraftReference(
      caught instanceof Error ? caught.message : "Draft generation failed",
      1000,
    );
    await db.execute("BEGIN IMMEDIATE");
    try {
      const failedResult = await db.execute(
        `UPDATE draft_generation_requests
        SET status = 'failed', error_message = $1, updated_at = datetime('now')
        WHERE id = $2 AND status = 'pending'`,
        [message, requestId],
      );
      if (failedResult.rowsAffected === 1) {
        await blockLinkedDraftGenerationInTransaction(db, {
          workflowRunId: linkedScope?.workflowRunId ?? null,
          workflowStepId: linkedScope?.workflowStepId ?? null,
          campaignId: candidate.campaign_id,
          candidateId: parsed.candidateId,
          reason: `Draft generation failed: ${message}`,
        });
      }
      await db.execute("COMMIT");
    } catch (settlementError) {
      await rollbackDraftTransaction(db);
      throw Object.assign(
        new Error("Draft generation failure could not be settled"),
        {
          cause: settlementError,
        },
      );
    }
    throw Object.assign(new Error(message), { cause: caught });
  }

  return requestId;
}

export async function saveGeneratedDraft(
  input: SaveGeneratedDraftInput,
): Promise<number> {
  const parsed = saveGeneratedDraftSchema.parse(input);
  const db = await getDb();
  await db.execute("BEGIN IMMEDIATE");
  try {
    const request = await loadDraftGenerationRequestRow(db, parsed.id);
    if (request.status !== "generated") {
      throw new Error("Only generated draft requests can be saved");
    }
    await getEligibleDraftCandidate(
      db,
      request.candidate_post_id,
      request.campaign_id,
    );
    const generatedVariants = mapGeneratedVariants(
      request.generated_variants_json,
    );
    if (generatedVariants.length !== request.variant_count) {
      throw new Error(
        "Generated request does not have its exact requested variants",
      );
    }
    const linkedScope = await validateLinkedDraftSaveInTransaction(db, {
      workflowRunId: request.workflow_run_id,
      workflowStepId: request.workflow_step_id,
      campaignId: request.campaign_id,
      candidateId: request.candidate_post_id,
    });
    const draftId = await insertDraftInTransaction(db, {
      campaignId: request.campaign_id,
      candidateId: request.candidate_post_id,
      angle: request.angle,
      notes: `Generated by ${request.provider_key}/${request.model_name || "default"} from request #${request.id}.`,
      contentIntent: request.content_intent,
      variants: generatedVariants.map((variant) => ({
        hook: variant.hook,
        body: variant.body,
        cta: variant.cta,
        hashtags: generatedHashtagsToDraftString(variant.hashtags),
      })),
    });
    const savedResult = await db.execute(
      `UPDATE draft_generation_requests
      SET status = 'saved', created_draft_id = $1, updated_at = datetime('now')
      WHERE id = $2 AND status = 'generated'`,
      [draftId, request.id],
    );
    if (savedResult.rowsAffected !== 1) {
      throw new Error("Draft generation request is no longer saveable");
    }
    if (linkedScope !== null) {
      await completeLinkedDraftSaveInTransaction(db, {
        ...linkedScope,
        draftId,
        contentIntent: request.content_intent,
      });
    }
    await db.execute("COMMIT");
    return draftId;
  } catch (error) {
    await rollbackDraftTransaction(db);
    throw error;
  }
}

export async function dismissDraftGenerationRequest(id: number): Promise<void> {
  const parsed = dismissDraftGenerationRequestSchema.parse({ id });
  const db = await getDb();
  await db.execute("BEGIN IMMEDIATE");
  try {
    const request = await loadDraftGenerationRequestRow(db, parsed.id);
    const interruptedReason =
      request.status === "pending"
        ? `Draft generation request #${request.id} was dismissed after an interrupted provider call. Generate variants again to retry.`
        : "Draft generation dismissed by operator";

    if (request.status === "pending" && request.agent_run_id !== null) {
      const cancelledRun = await db.execute(
        `UPDATE agent_runs
        SET status = 'cancelled',
          error_message = $1,
          completed_at = COALESCE(completed_at, datetime('now')),
          updated_at = datetime('now')
        WHERE id = $2 AND status IN ('queued', 'running')`,
        [interruptedReason, request.agent_run_id],
      );
      if (cancelledRun.rowsAffected === 1) {
        await db.execute(
          `DELETE FROM agent_run_approval_checkpoints
          WHERE agent_run_id = $1`,
          [request.agent_run_id],
        );
        await db.execute(
          `INSERT INTO agent_run_events (agent_run_id, event_type, summary)
          VALUES ($1, $2, $3)`,
          [request.agent_run_id, "run_cancelled", interruptedReason],
        );
      }
    }

    const dismissedResult = await db.execute(
      `UPDATE draft_generation_requests
      SET status = 'dismissed',
        error_message = CASE WHEN status = 'pending' THEN $1 ELSE error_message END,
        updated_at = datetime('now')
      WHERE id = $2 AND status IN ('generated', 'failed', 'pending')`,
      [interruptedReason, parsed.id],
    );
    if (dismissedResult.rowsAffected === 1 && request.status !== "failed") {
      await blockLinkedDraftGenerationInTransaction(db, {
        workflowRunId: request.workflow_run_id,
        workflowStepId: request.workflow_step_id,
        campaignId: request.campaign_id,
        candidateId: request.candidate_post_id,
        reason: interruptedReason,
      });
    }
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackDraftTransaction(db);
    throw error;
  }
}

export async function listDrafts(
  campaignId?: number,
): Promise<DraftWithDetails[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE d.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<DraftRow[]>(
    `SELECT
      d.id,
      d.campaign_id,
      d.candidate_post_id,
      d.angle,
      d.notes,
      d.content_intent,
      d.status,
      d.created_at,
      d.updated_at,
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
    FROM drafts d
    INNER JOIN campaigns c ON c.id = d.campaign_id
    INNER JOIN candidate_posts cp ON cp.id = d.candidate_post_id
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    ${whereClause}
    ORDER BY d.status = 'archived', datetime(d.updated_at) DESC, d.id DESC`,
    values,
  );

  if (rows.length === 0) return [];

  const draftIds = rows.map((row) => row.id);
  const variantRows = await db.select<DraftVariantRow[]>(
    `SELECT * FROM draft_variants
    WHERE draft_id IN (${getPlaceholders(draftIds)})
    ORDER BY variant_number ASC`,
    draftIds,
  );

  const variantIds = variantRows.map((row) => row.id);
  const auditRows =
    variantIds.length === 0
      ? []
      : await db.select<DraftAuditRow[]>(
          `SELECT * FROM draft_audits
          WHERE draft_variant_id IN (${getPlaceholders(variantIds)})`,
          variantIds,
        );

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
    variants.push(
      mapDraftVariant(variantRow, auditsByVariantId.get(variantRow.id) ?? []),
    );
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
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  function addUpdate(column: string, value: unknown): void {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (parsed.angle !== undefined) addUpdate("angle", parsed.angle);
  if (parsed.notes !== undefined) addUpdate("notes", parsed.notes);
  if (parsed.status !== undefined) addUpdate("status", parsed.status);
  if (updates.length === 0) return;

  values.push(parsed.id);
  await db.execute(
    `UPDATE drafts
    SET ${updates.join(", ")}, updated_at = datetime('now')
    WHERE id = $${values.length}`,
    values,
  );
}

export async function updateDraftVariant(
  input: UpdateDraftVariantInput,
): Promise<void> {
  const parsed = updateDraftVariantSchema.parse(input);
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  function addUpdate(column: string, value: unknown): void {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (parsed.hook !== undefined) addUpdate("hook", parsed.hook);
  if (parsed.body !== undefined) addUpdate("body", parsed.body);
  if (parsed.cta !== undefined) addUpdate("cta", parsed.cta);
  if (parsed.hashtags !== undefined) addUpdate("hashtags", parsed.hashtags);
  if (updates.length === 0) return;

  await db.execute("BEGIN TRANSACTION");
  try {
    values.push(parsed.id);
    await db.execute(
      `UPDATE draft_variants
      SET ${updates.join(", ")}, updated_at = datetime('now')
      WHERE id = $${values.length}`,
      values,
    );

    const variants = await db.select<DraftVariantRow[]>(
      `SELECT * FROM draft_variants WHERE id = $1 LIMIT 1`,
      [parsed.id],
    );
    const variant = variants[0];
    if (variant === undefined) throw new Error("Draft variant was not found");

    await db.execute(`DELETE FROM draft_audits WHERE draft_variant_id = $1`, [
      parsed.id,
    ]);
    await insertAuditFindings(db, parsed.id, auditDraftVariant(variant));
    await db.execute(
      `UPDATE drafts
      SET updated_at = datetime('now')
      WHERE id = $1`,
      [variant.draft_id],
    );
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackDraftTransaction(db);
    throw error;
  }
}

export async function setDraftVariantStatus(
  input: SetDraftVariantStatusInput,
): Promise<void> {
  const parsed = setDraftVariantStatusSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const variants = await db.select<DraftVariantRow[]>(
      `SELECT * FROM draft_variants WHERE id = $1 LIMIT 1`,
      [parsed.id],
    );
    const variant = variants[0];
    if (variant === undefined) throw new Error("Draft variant was not found");

    if (parsed.status === "selected") {
      const audits = await db.select<DraftAuditRow[]>(
        `SELECT * FROM draft_audits WHERE draft_variant_id = $1`,
        [parsed.id],
      );
      if (audits.some((audit) => audit.severity === "block")) {
        throw new Error("Blocked variants cannot be selected");
      }
      await db.execute(
        `UPDATE draft_variants
        SET status = 'draft', updated_at = datetime('now')
        WHERE draft_id = $1 AND id <> $2`,
        [variant.draft_id, parsed.id],
      );
      await db.execute(
        `UPDATE draft_variants
        SET status = 'selected', updated_at = datetime('now')
        WHERE id = $1`,
        [parsed.id],
      );
      await db.execute(
        `UPDATE drafts
        SET status = 'ready_for_review', updated_at = datetime('now')
        WHERE id = $1`,
        [variant.draft_id],
      );
    } else {
      await db.execute(
        `UPDATE draft_variants
        SET status = $1, updated_at = datetime('now')
        WHERE id = $2`,
        [parsed.status, parsed.id],
      );

      if (parsed.status === "draft") {
        const selectedCounts = await db.select<SelectedCountRow[]>(
          `SELECT COUNT(*) AS selected_count
          FROM draft_variants
          WHERE draft_id = $1 AND status = 'selected'`,
          [variant.draft_id],
        );
        if ((selectedCounts[0]?.selected_count ?? 0) === 0) {
          await db.execute(
            `UPDATE drafts
            SET status = 'needs_revision', updated_at = datetime('now')
            WHERE id = $1`,
            [variant.draft_id],
          );
        }
      }
    }

    await db.execute("COMMIT");
  } catch (error) {
    await rollbackDraftTransaction(db);
    throw error;
  }
}

export async function archiveDraft(id: number): Promise<void> {
  const parsed = updateDraftSchema.pick({ id: true }).parse({ id });
  await updateDraft({ id: parsed.id, status: "archived" });
}
