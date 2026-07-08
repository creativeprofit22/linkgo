import { draftPostOutputSchema } from "@/agent/schemas";
import { createAgentRun, startAgentRun } from "@/features/agent-runtime/data";
import { getDb, type LinkgoDatabase } from "@/lib/db";
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
  candidate_source_keyword: string;
  candidate_score_reason: string;
  candidate_notes: string;
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

export async function createDraft(input: CreateDraftInput): Promise<number> {
  const parsed = createDraftSchema.parse(input);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const candidates = await db.select<DraftCandidateRow[]>(
      `SELECT
        cp.id AS candidate_id,
        cp.campaign_id,
        c.status AS campaign_status,
        cp.status AS candidate_status
      FROM candidate_posts cp
      INNER JOIN campaigns c ON c.id = cp.campaign_id
      INNER JOIN target_posts tp ON tp.id = cp.target_post_id
      WHERE cp.id = $1
      LIMIT 1`,
      [parsed.candidateId],
    );
    const candidate = candidates[0];
    if (candidate === undefined) throw new Error("Candidate was not found");
    if (candidate.campaign_status === "archived") {
      throw new Error("Campaign is archived");
    }
    if (candidate.candidate_status === "rejected") {
      throw new Error("Rejected candidates cannot be drafted");
    }
    if (candidate.candidate_status === "drafted") {
      throw new Error("Candidate already has a draft");
    }

    const draftResult = await db.execute(
      `INSERT INTO drafts (
        campaign_id,
        candidate_post_id,
        angle,
        notes,
        updated_at
      ) VALUES ($1, $2, $3, $4, datetime('now'))`,
      [candidate.campaign_id, parsed.candidateId, parsed.angle, parsed.notes],
    );
    const draftId = draftResult.lastInsertId;

    for (const [index, variant] of parsed.variants.entries()) {
      const variantResult = await db.execute(
        `INSERT INTO draft_variants (
          draft_id,
          variant_number,
          hook,
          body,
          cta,
          hashtags,
          updated_at
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

    await db.execute(
      `UPDATE candidate_posts
      SET status = 'drafted', updated_at = datetime('now')
      WHERE id = $1`,
      [parsed.candidateId],
    );
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
      cp.source_keyword AS candidate_source_keyword,
      cp.score_reason AS candidate_score_reason,
      cp.notes AS candidate_notes,
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
  if (candidate.campaign_status === "archived") {
    throw new Error("Campaign is archived");
  }
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

function truncateForAgentSummary(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildDraftGenerationInputSummary(
  parsed: GenerateDraftVariantsInput,
  candidate: DraftCandidateContextRow,
  maxLength = 1000,
): string {
  const targetExcerpt = truncateForAgentSummary(candidate.target_content, 360);
  const lines = [
    `Generate ${parsed.variantCount} LinkedIn draft variants for candidate #${parsed.candidateId}.`,
    parsed.angle ? `Angle: ${parsed.angle}.` : "",
    parsed.voiceNotes ? `Voice notes: ${parsed.voiceNotes}.` : "",
    `Campaign: ${candidate.campaign_name}.`,
    `Target author: ${candidate.target_author_name || "Unknown"}.`,
    targetExcerpt ? `Target post excerpt: "${targetExcerpt}".` : "",
    candidate.candidate_source_keyword
      ? `Source keyword: ${candidate.candidate_source_keyword}.`
      : "",
    candidate.candidate_score_reason
      ? `Score reason: ${candidate.candidate_score_reason}.`
      : "",
    candidate.candidate_notes
      ? `Candidate notes: ${candidate.candidate_notes}.`
      : "",
  ];

  return truncateForAgentSummary(lines.filter(Boolean).join(" "), maxLength);
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
  const inputSummary = buildDraftGenerationInputSummary(parsed, candidate);

  const agentRunId = await createAgentRun({
    campaignId: candidate.campaign_id,
    agentRole: "drafter",
    providerKey: parsed.providerKey,
    modelName: parsed.modelName,
    playbookKey: parsed.playbookKey,
    inputSummary,
  });

  const requestResult = await db.execute(
    `INSERT INTO draft_generation_requests (
      campaign_id, candidate_post_id, agent_run_id, provider_key, model_name,
      playbook_key, variant_count, angle, voice_notes, status, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', datetime('now'))`,
    [
      candidate.campaign_id,
      parsed.candidateId,
      agentRunId,
      parsed.providerKey,
      parsed.modelName,
      parsed.playbookKey,
      parsed.variantCount,
      parsed.angle,
      parsed.voiceNotes,
    ],
  );
  const requestId = requestResult.lastInsertId;

  try {
    await startAgentRun({ id: agentRunId });
    const toolRows = await db.select<DraftToolCallRow[]>(
      `SELECT output_json
      FROM agent_tool_calls
      WHERE agent_run_id = $1 AND tool_name = 'draft_post' AND status = 'completed'
      ORDER BY id DESC
      LIMIT 1`,
      [agentRunId],
    );
    const toolRow = toolRows[0];
    if (toolRow === undefined) {
      throw new Error("Drafter did not return draft_post variants");
    }
    const output = draftPostOutputSchema.parse(JSON.parse(toolRow.output_json));
    await db.execute(
      `UPDATE draft_generation_requests
      SET status = 'generated',
        summary = $1,
        generated_variants_json = $2,
        error_message = '',
        updated_at = datetime('now')
      WHERE id = $3`,
      [output.summary, JSON.stringify(output.variants), requestId],
    );
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Draft generation failed";
    await db.execute(
      `UPDATE draft_generation_requests
      SET status = 'failed', error_message = $1, updated_at = datetime('now')
      WHERE id = $2`,
      [message, requestId],
    );
    throw Object.assign(new Error(message), { cause: caught });
  }

  return requestId;
}

export async function saveGeneratedDraft(
  input: SaveGeneratedDraftInput,
): Promise<number> {
  const parsed = saveGeneratedDraftSchema.parse(input);
  const db = await getDb();
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
  if (generatedVariants.length === 0) {
    throw new Error("Generated request has no variants to save");
  }

  const draftId = await createDraft({
    candidateId: request.candidate_post_id,
    angle: request.angle,
    notes: `Generated by ${request.provider_key}/${request.model_name || "default"} from request #${request.id}.`,
    variants: generatedVariants.map((variant) => ({
      hook: variant.hook,
      body: variant.body,
      cta: variant.cta,
      hashtags: generatedHashtagsToDraftString(variant.hashtags),
    })),
  });
  await db.execute(
    `UPDATE draft_generation_requests
    SET status = 'saved', created_draft_id = $1, updated_at = datetime('now')
    WHERE id = $2`,
    [draftId, request.id],
  );
  return draftId;
}

export async function dismissDraftGenerationRequest(id: number): Promise<void> {
  const parsed = dismissDraftGenerationRequestSchema.parse({ id });
  const db = await getDb();
  await db.execute(
    `UPDATE draft_generation_requests
    SET status = 'dismissed', updated_at = datetime('now')
    WHERE id = $1 AND status IN ('generated', 'failed', 'pending')`,
    [parsed.id],
  );
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
