import { getDb, type LinkgoDatabase } from "@/lib/db";
import {
  createCandidateSchema,
  updateCandidateSchema,
} from "@/features/candidate-queue/schemas";
import type { CampaignStatus } from "@/features/campaigns/types";
import type {
  CandidateStatus,
  CandidateWithTarget,
  CreateCandidateInput,
  TargetPost,
  UpdateCandidateInput,
} from "@/features/candidate-queue/types";

interface TargetPostRow {
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
  status: CampaignStatus;
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

async function rollbackCandidateCreation(db: LinkgoDatabase): Promise<void> {
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
        posted_at,
        content,
        content_hash,
        updated_at
      ) VALUES ('linkedin', $1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
        [
          parsed.url,
          normalizedUrl,
          parsed.authorName,
          parsed.authorProfileUrl,
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
    await rollbackCandidateCreation(db);
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
