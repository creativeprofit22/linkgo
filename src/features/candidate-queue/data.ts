import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  createCandidateSchema,
  dismissDiscoveryItemSchema,
  promoteDiscoveryItemSchema,
  runCandidateDiscoverySchema,
  scoreCandidatesSchema,
  updateCandidateSchema,
} from "@/features/candidate-queue/schemas";
import type { CampaignStatus } from "@/features/campaigns/types";
import { resolveLinkedInTargetUrn } from "@/features/linkedin-actions/urn";
import type {
  CandidateDiscoveryItem,
  CandidateDiscoveryKind,
  CandidateDiscoveryStatus,
  CandidateStatus,
  CandidateWithTarget,
  CreateCandidateInput,
  DismissDiscoveryItemInput,
  PromoteDiscoveryItemInput,
  RunCandidateDiscoveryInput,
  ScoreCandidatesInput,
  TargetPost,
  UpdateCandidateInput,
} from "@/features/candidate-queue/types";
import type {
  ResearchPostsInput,
  ResearchPostsOutput,
  ScoreRelevanceInput,
  ScoreRelevanceOutput,
} from "@/agent/schemas";
import type { AgentToolExecutionContext } from "@/agent/types";
import { DEFAULT_AGENT_MODELS } from "@/agent/provider-catalog";

interface TargetPostRow {
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
}

interface CandidateWithTargetRow {
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
  campaign_name: string;
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

interface DedupeMatchRow {
  id: number;
}

interface CandidateCampaignRow {
  id?: number;
  status: CampaignStatus;
}

interface CandidateDiscoveryItemRow {
  id: number;
  campaign_id: number;
  agent_run_id: number | null;
  workflow_run_id: number | null;
  kind: CandidateDiscoveryKind;
  title: string;
  keyword: string;
  rationale: string;
  source_keyword: string;
  confidence_score: number | null;
  status: CandidateDiscoveryStatus;
  created_at: string;
  updated_at: string;
}

const DUPLICATE_CANDIDATE_MESSAGE =
  "Candidate already exists for this campaign";

export function normalizeCandidateUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    parsed.protocol = parsed.protocol.toLocaleLowerCase();
    parsed.hostname = parsed.hostname.toLocaleLowerCase();
    parsed.hash = "";
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
    }
    return parsed.toString();
  } catch {
    return trimmed.toLocaleLowerCase();
  }
}

export function createContentHash(content: string): string {
  const normalized = content.trim().replace(/\s+/gu, " ");
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function mapTargetPost(row: TargetPostRow): TargetPost {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    normalized_url: row.normalized_url,
    platform_resource_urn: row.platform_resource_urn,
    author_name: row.author_name,
    author_profile_url: row.author_profile_url,
    posted_at: row.posted_at,
    content: row.content,
    content_hash: row.content_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapCandidateWithTarget(
  row: CandidateWithTargetRow,
): CandidateWithTarget {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    target_post_id: row.target_post_id,
    source_keyword: row.source_keyword,
    status: row.status,
    relevance_score: row.relevance_score,
    score_reason: row.score_reason,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
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

function mapDiscoveryItem(
  row: CandidateDiscoveryItemRow,
): CandidateDiscoveryItem {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    agent_run_id: row.agent_run_id,
    workflow_run_id: row.workflow_run_id,
    kind: row.kind,
    title: row.title,
    keyword: row.keyword,
    rationale: row.rationale,
    source_keyword: row.source_keyword,
    confidence_score: row.confidence_score,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toToolDiscoveryItem(
  item: CandidateDiscoveryItem,
): ResearchPostsOutput["discoveryItems"][number] {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    keyword: item.keyword,
    rationale: item.rationale,
    sourceKeyword: item.source_keyword,
    confidenceScore: item.confidence_score,
    status: item.status,
  };
}

async function rollbackTransaction(db: LinkgoDatabase): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}

export async function createCandidate(
  input: CreateCandidateInput,
): Promise<number> {
  const parsed = createCandidateSchema.parse(input);
  const normalizedUrl = normalizeCandidateUrl(parsed.url);
  const contentHash = createContentHash(parsed.content);
  const platformResourceUrn =
    parsed.platformResourceUrn?.trim() || resolveLinkedInTargetUrn(parsed.url);
  const db = await getDb();

  await db.execute("BEGIN TRANSACTION");
  try {
    const campaigns = await db.select<CandidateCampaignRow[]>(
      `SELECT status FROM campaigns WHERE id = $1 LIMIT 1`,
      [parsed.campaignId],
    );
    const campaign = campaigns[0];
    if (campaign === undefined) {
      throw new Error("Campaign was not found");
    }
    if (campaign.status === "archived") {
      throw new Error("Campaign is archived");
    }

    const existingDedupe = await db.select<DedupeMatchRow[]>(
      `SELECT id FROM dedupe_keys
      WHERE campaign_id = $1
        AND ((key_type = 'normalized_url' AND key_value = $2)
          OR (key_type = 'content_hash' AND key_value = $3))
      LIMIT 1`,
      [parsed.campaignId, normalizedUrl, contentHash],
    );
    if (existingDedupe.length > 0) {
      throw new Error(DUPLICATE_CANDIDATE_MESSAGE);
    }

    const existingTargets = await db.select<TargetPostRow[]>(
      `SELECT * FROM target_posts
      WHERE platform = 'linkedin'
        AND (normalized_url = $1 OR content_hash = $2)
      ORDER BY normalized_url = $1 DESC, id ASC
      LIMIT 1`,
      [normalizedUrl, contentHash],
    );

    let targetPostId = existingTargets[0]?.id;
    if (targetPostId === undefined) {
      const targetResult = await db.execute(
        `INSERT INTO target_posts (
        platform,
        url,
        normalized_url,
        author_name,
        author_profile_url,
        platform_resource_urn,
        posted_at,
        content,
        content_hash,
        updated_at
      ) VALUES ('linkedin', $1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
        [
          parsed.url,
          normalizedUrl,
          parsed.authorName,
          parsed.authorProfileUrl,
          platformResourceUrn,
          parsed.postedAt,
          parsed.content,
          contentHash,
        ],
      );
      targetPostId = targetResult.lastInsertId;
    }

    const candidateResult = await db.execute(
      `INSERT INTO candidate_posts (
      campaign_id,
      target_post_id,
      source_keyword,
      relevance_score,
      score_reason,
      notes,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
      [
        parsed.campaignId,
        targetPostId,
        parsed.sourceKeyword,
        parsed.relevanceScore,
        parsed.scoreReason,
        parsed.notes,
      ],
    );
    const candidateId = candidateResult.lastInsertId;

    await db.execute(
      `INSERT INTO dedupe_keys (campaign_id, key_type, key_value, candidate_post_id)
      VALUES ($1, 'normalized_url', $2, $3)`,
      [parsed.campaignId, normalizedUrl, candidateId],
    );
    await db.execute(
      `INSERT INTO dedupe_keys (campaign_id, key_type, key_value, candidate_post_id)
      VALUES ($1, 'content_hash', $2, $3)`,
      [parsed.campaignId, contentHash, candidateId],
    );

    await db.execute("COMMIT");
    return candidateId;
  } catch (error) {
    await rollbackTransaction(db);
    throw error;
  }
}

export async function listCandidates(
  campaignId?: number,
): Promise<CandidateWithTarget[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const whereClause =
    campaignId === undefined ? "" : "WHERE cp.campaign_id = $1";
  if (campaignId !== undefined) values.push(campaignId);

  const rows = await db.select<CandidateWithTargetRow[]>(
    `SELECT
      cp.id,
      cp.campaign_id,
      cp.target_post_id,
      cp.source_keyword,
      cp.status,
      cp.relevance_score,
      cp.score_reason,
      cp.notes,
      cp.created_at,
      cp.updated_at,
      c.name AS campaign_name,
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
    FROM candidate_posts cp
    INNER JOIN target_posts tp ON tp.id = cp.target_post_id
    INNER JOIN campaigns c ON c.id = cp.campaign_id
    ${whereClause}
    ORDER BY cp.status = 'rejected', datetime(cp.updated_at) DESC, cp.id DESC`,
    values,
  );

  return rows.map(mapCandidateWithTarget);
}

export async function listDiscoveryItems(
  campaignId: number,
): Promise<CandidateDiscoveryItem[]> {
  const db = await getDb();
  const rows = await db.select<CandidateDiscoveryItemRow[]>(
    `SELECT * FROM candidate_discovery_items
    WHERE campaign_id = $1
      AND status != 'dismissed'
    ORDER BY status = 'promoted', confidence_score DESC, datetime(updated_at) DESC, id DESC`,
    [campaignId],
  );
  return rows.map(mapDiscoveryItem);
}

async function getCampaignSeedKeywords(
  db: LinkgoDatabase,
  campaignId: number,
  fallbackKeywords: string[],
): Promise<string[]> {
  if (fallbackKeywords.length > 0) return fallbackKeywords;
  const rows = await db.select<Array<{ keyword: string }>>(
    `SELECT keyword FROM campaign_keywords WHERE campaign_id = $1 ORDER BY keyword ASC LIMIT 12`,
    [campaignId],
  );
  return rows.map((row) => row.keyword);
}

export async function runCandidateDiscovery(
  input: RunCandidateDiscoveryInput,
): Promise<number> {
  const parsed = runCandidateDiscoverySchema.parse(input);
  const db = await getDb();
  await assertCandidateCampaignCanMutate(db, parsed.campaignId);
  const seedKeywords = await getCampaignSeedKeywords(
    db,
    parsed.campaignId,
    parsed.seedKeywords,
  );
  const providerKey = parsed.providerKey;
  const modelName = parsed.modelName || DEFAULT_AGENT_MODELS[providerKey];
  const inputSummary = [
    "Run operator-triggered local discovery for the Candidate Queue.",
    `Seed keywords: ${seedKeywords.join(", ") || "campaign context"}.`,
    parsed.notes ? `Notes: ${parsed.notes}` : "Notes: none.",
  ].join("\n");
  const { createAgentRun, startAgentRun } =
    await import("@/features/agent-runtime/data");
  const runId = await createAgentRun({
    campaignId: parsed.campaignId,
    agentRole: "researcher",
    providerKey,
    modelName,
    inputSummary,
    ...(parsed.playbookKey ? { playbookKey: parsed.playbookKey } : {}),
  });
  await startAgentRun({ id: runId });
  return runId;
}

async function getDefaultScoringCandidateIds(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<number[]> {
  const rows = await db.select<Array<{ id: number }>>(
    `SELECT id FROM candidate_posts
    WHERE campaign_id = $1
      AND status = 'new'
      AND relevance_score IS NULL
    ORDER BY datetime(created_at) ASC, id ASC
    LIMIT 50`,
    [campaignId],
  );
  return rows.map((row) => row.id);
}

export async function scoreCandidates(
  input: ScoreCandidatesInput,
): Promise<number> {
  const parsed = scoreCandidatesSchema.parse(input);
  const db = await getDb();
  await assertCandidateCampaignCanMutate(db, parsed.campaignId);
  const candidatePostIds =
    parsed.candidatePostIds && parsed.candidatePostIds.length > 0
      ? parsed.candidatePostIds
      : await getDefaultScoringCandidateIds(db, parsed.campaignId);
  const providerKey = parsed.providerKey;
  const modelName = parsed.modelName || DEFAULT_AGENT_MODELS[providerKey];
  const inputSummary = [
    "Score operator-selected Candidate Queue posts.",
    `Candidate IDs: ${candidatePostIds.join(", ") || "none"}.`,
    `Minimum score: ${parsed.minimumScore}.`,
    `Auto-reject: ${parsed.autoRejectBelowMinimum ? "true" : "false"}.`,
  ].join("\n");
  const { createAgentRun, startAgentRun } =
    await import("@/features/agent-runtime/data");
  const runId = await createAgentRun({
    campaignId: parsed.campaignId,
    agentRole: "scorer",
    providerKey,
    modelName,
    inputSummary,
    ...(parsed.playbookKey ? { playbookKey: parsed.playbookKey } : {}),
  });
  await startAgentRun({ id: runId });
  return runId;
}

export async function promoteDiscoveryItem(
  input: PromoteDiscoveryItemInput,
): Promise<void> {
  const parsed = promoteDiscoveryItemSchema.parse(input);
  const db = await getDb();
  await db.execute("BEGIN TRANSACTION");
  try {
    await assertCandidateCampaignCanMutate(db, parsed.campaignId);
    const rows = await db.select<CandidateDiscoveryItemRow[]>(
      `SELECT * FROM candidate_discovery_items
      WHERE id = $1
        AND campaign_id = $2
      LIMIT 1`,
      [parsed.id, parsed.campaignId],
    );
    const item = rows[0];
    if (item === undefined)
      throw new Error("Discovery suggestion was not found");
    const keyword = item.kind === "keyword" ? item.keyword.trim() : "";
    if (keyword) {
      await db.execute(
        `INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source) VALUES ($1, $2, $3)`,
        [parsed.campaignId, keyword, "generated"],
      );
    }
    const result = await db.execute(
      `UPDATE candidate_discovery_items
      SET status = 'promoted', updated_at = datetime('now')
      WHERE id = $1
        AND campaign_id = $2`,
      [parsed.id, parsed.campaignId],
    );
    if (result.rowsAffected !== 1) {
      throw new Error("Discovery suggestion was not found");
    }
    await db.execute("COMMIT");
  } catch (error) {
    await rollbackTransaction(db);
    throw error;
  }
}

export async function dismissDiscoveryItem(
  input: DismissDiscoveryItemInput,
): Promise<void> {
  const parsed = dismissDiscoveryItemSchema.parse(input);
  const db = await getDb();
  await assertCandidateCampaignCanMutate(db, parsed.campaignId);
  const result = await db.execute(
    `UPDATE candidate_discovery_items
    SET status = 'dismissed', updated_at = datetime('now')
    WHERE id = $1
      AND campaign_id = $2`,
    [parsed.id, parsed.campaignId],
  );
  if (result.rowsAffected !== 1) {
    throw new Error("Discovery suggestion was not found");
  }
}

export async function updateCandidate(
  input: UpdateCandidateInput,
): Promise<void> {
  const parsed = updateCandidateSchema.parse(input);
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  function addUpdate(column: string, value: unknown): void {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (parsed.status !== undefined) addUpdate("status", parsed.status);
  if (parsed.relevanceScore !== undefined) {
    addUpdate("relevance_score", parsed.relevanceScore);
  }
  if (parsed.scoreReason !== undefined)
    addUpdate("score_reason", parsed.scoreReason);
  if (parsed.notes !== undefined) addUpdate("notes", parsed.notes);

  if (updates.length === 0) return;

  values.push(parsed.id);
  await db.execute(
    `UPDATE candidate_posts
      SET ${updates.join(", ")}, updated_at = datetime('now')
      WHERE id = $${values.length}`,
    values,
  );
}

export async function setCandidateStatus(
  id: number,
  status: CandidateStatus,
): Promise<void> {
  await updateCandidate({ id, status });
}

export async function deleteCandidate(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM dedupe_keys WHERE candidate_post_id = $1`, [
    id,
  ]);
  await db.execute(`DELETE FROM candidate_posts WHERE id = $1`, [id]);
}

async function assertCandidateCampaignCanMutate(
  db: LinkgoDatabase,
  campaignId: number,
): Promise<void> {
  const campaigns = await db.select<CandidateCampaignRow[]>(
    `SELECT id, status FROM campaigns WHERE id = $1 LIMIT 1`,
    [campaignId],
  );
  const campaign = campaigns[0];
  if (campaign === undefined) throw new Error("Campaign was not found");
  if (campaign.status === "archived") throw new Error("Campaign is archived");
}

function compactText(value: string | undefined, maxLength: number): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, maxLength);
}

function getScoreInputs(
  input: ScoreRelevanceInput,
): ScoreRelevanceOutput["scores"] {
  if (input.scores.length > 0) return input.scores.slice(0, 50);
  return input.candidatePostIds.slice(0, 50).map((candidatePostId, index) => ({
    candidatePostId,
    score: Math.min(100, Math.max(input.minimumScore, 72 + index)),
    rationale: "Dry-run score based on bounded local contract inputs.",
  }));
}

export async function insertDiscoveryItemsFromTool(
  input: ResearchPostsInput,
  context: AgentToolExecutionContext,
): Promise<ResearchPostsOutput["discoveryItems"]> {
  const db = await getDb();
  await assertCandidateCampaignCanMutate(db, input.campaignId);

  const persistedItems: CandidateDiscoveryItem[] = [];
  const seen = new Set<string>();
  const suggestions = input.suggestions.slice(0, 25);

  for (const suggestion of suggestions) {
    const kind = suggestion.kind;
    const title = compactText(suggestion.title, 160);
    const keyword = compactText(suggestion.keyword, 80);
    const rationale = compactText(suggestion.rationale, 500);
    const sourceKeyword = compactText(suggestion.sourceKeyword, 80);
    const confidenceScore = suggestion.confidenceScore ?? null;
    if (!title && !keyword) continue;

    const dedupeKey = `${input.campaignId}:${kind}:${keyword.toLocaleLowerCase()}:${title.toLocaleLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const existingRows = await db.select<CandidateDiscoveryItemRow[]>(
      `SELECT * FROM candidate_discovery_items
      WHERE campaign_id = $1
        AND kind = $2
        AND keyword = $3
        AND title = $4
        AND status != 'dismissed'
      LIMIT 1`,
      [input.campaignId, kind, keyword, title],
    );
    const existing = existingRows[0];
    if (existing !== undefined) {
      persistedItems.push(mapDiscoveryItem(existing));
      continue;
    }

    const result = await db.execute(
      `INSERT INTO candidate_discovery_items (
        campaign_id,
        agent_run_id,
        workflow_run_id,
        kind,
        title,
        keyword,
        rationale,
        source_keyword,
        confidence_score,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, datetime('now'))`,
      [
        input.campaignId,
        context.request.runId,
        context.request.workflowRunId,
        kind,
        title,
        keyword,
        rationale,
        sourceKeyword,
        confidenceScore,
      ],
    );
    const rows = await db.select<CandidateDiscoveryItemRow[]>(
      `SELECT * FROM candidate_discovery_items WHERE id = $1 LIMIT 1`,
      [result.lastInsertId],
    );
    const inserted = rows[0];
    if (inserted !== undefined) persistedItems.push(mapDiscoveryItem(inserted));
  }

  return persistedItems.map(toToolDiscoveryItem);
}

interface CandidateScoreOwnershipRow {
  id: number;
  status: CandidateStatus;
}

export async function applyRelevanceScoresFromTool(
  input: ScoreRelevanceInput,
  _context: AgentToolExecutionContext,
): Promise<ScoreRelevanceOutput["scores"]> {
  const db = await getDb();
  await assertCandidateCampaignCanMutate(db, input.campaignId);

  const requestedScores = getScoreInputs(input);
  if (requestedScores.length === 0) return [];

  const uniqueRequestedScores = new Map<
    number,
    (typeof requestedScores)[number]
  >();
  for (const score of requestedScores) {
    if (!uniqueRequestedScores.has(score.candidatePostId)) {
      uniqueRequestedScores.set(score.candidatePostId, score);
    }
  }
  const dedupedScores = Array.from(uniqueRequestedScores.values()).slice(0, 50);
  const allowedInputIds = new Set(input.candidatePostIds);
  const candidateIds = Array.from(
    new Set(
      dedupedScores
        .map((score) => score.candidatePostId)
        .filter((id) => allowedInputIds.size === 0 || allowedInputIds.has(id)),
    ),
  ).slice(0, 50);
  if (candidateIds.length === 0) return [];

  const placeholders = candidateIds
    .map((_, index) => `$${index + 2}`)
    .join(", ");
  const ownedRows = await db.select<CandidateScoreOwnershipRow[]>(
    `SELECT id, status FROM candidate_posts
    WHERE campaign_id = $1
      AND id IN (${placeholders})`,
    [input.campaignId, ...candidateIds],
  );
  const ownedIds = new Set(ownedRows.map((row) => row.id));
  const appliedScores: ScoreRelevanceOutput["scores"] = [];

  for (const score of dedupedScores) {
    if (!ownedIds.has(score.candidatePostId)) continue;
    const rationale = compactText(score.rationale, 500);
    await db.execute(
      `UPDATE candidate_posts
      SET relevance_score = $1,
        score_reason = $2,
        status = CASE
          WHEN $3 = 1 AND status = 'new' AND $1 < $4 THEN 'rejected'
          ELSE status
        END,
        updated_at = datetime('now')
      WHERE id = $5
        AND campaign_id = $6`,
      [
        score.score,
        rationale,
        input.autoRejectBelowMinimum ? 1 : 0,
        input.minimumScore,
        score.candidatePostId,
        input.campaignId,
      ],
    );
    appliedScores.push({
      candidatePostId: score.candidatePostId,
      score: score.score,
      rationale,
    });
    if (appliedScores.length >= 50) break;
  }

  return appliedScores;
}
