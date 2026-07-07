import { getDb } from "@/lib/db";
import {
  createCampaignSchema,
  updateCampaignSchema,
} from "@/features/campaigns/schemas";
import type {
  Campaign,
  CampaignKeyword,
  CampaignStatus,
  CampaignWithKeywords,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

interface CampaignRow {
  id: number;
  name: string;
  product: string;
  audience: string;
  voice: string;
  tone: string;
  auto_pilot: number;
  status: CampaignStatus;
  daily_post_limit: number;
  daily_comment_limit: number;
  created_at: string;
  updated_at: string;
}

interface CampaignKeywordRow {
  id: number;
  campaign_id: number;
  keyword: string;
  source: "manual" | "generated" | "learned";
  created_at: string;
}

function uniqueKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  return keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      if (!keyword) return false;
      const key = keyword.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    product: row.product,
    audience: row.audience,
    voice: row.voice,
    tone: row.tone,
    auto_pilot: row.auto_pilot,
    status: row.status,
    daily_post_limit: row.daily_post_limit,
    daily_comment_limit: row.daily_comment_limit,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<number> {
  const parsed = createCampaignSchema.parse(input);
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO campaigns (
      name,
      product,
      audience,
      voice,
      tone,
      auto_pilot,
      daily_post_limit,
      daily_comment_limit,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
    [
      parsed.name,
      parsed.product,
      parsed.audience,
      parsed.voice,
      parsed.tone,
      parsed.autoPilot ? 1 : 0,
      parsed.dailyPostLimit,
      parsed.dailyCommentLimit,
    ],
  );

  const campaignId = result.lastInsertId;
  for (const keyword of uniqueKeywords(parsed.keywords)) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source) VALUES ($1, $2, 'manual')`,
      [campaignId, keyword],
    );
  }

  return campaignId;
}

export async function listCampaigns(): Promise<CampaignWithKeywords[]> {
  const db = await getDb();
  const rows = await db.select<CampaignRow[]>(
    `SELECT * FROM campaigns ORDER BY status = 'archived', datetime(updated_at) DESC, id DESC`,
  );
  return attachKeywords(rows.map(mapCampaign));
}

export async function getCampaign(
  id: number,
): Promise<CampaignWithKeywords | null> {
  const db = await getDb();
  const rows = await db.select<CampaignRow[]>(
    `SELECT * FROM campaigns WHERE id = $1 LIMIT 1`,
    [id],
  );
  const firstRow = rows[0];
  if (!firstRow) return null;
  const [campaign] = await attachKeywords([mapCampaign(firstRow)]);
  return campaign ?? null;
}

export async function updateCampaign(
  input: UpdateCampaignInput,
): Promise<void> {
  const parsed = updateCampaignSchema.parse(input);
  const db = await getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  function addUpdate(column: string, value: unknown): void {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (parsed.name !== undefined) addUpdate("name", parsed.name);
  if (parsed.product !== undefined) addUpdate("product", parsed.product);
  if (parsed.audience !== undefined) addUpdate("audience", parsed.audience);
  if (parsed.voice !== undefined) addUpdate("voice", parsed.voice);
  if (parsed.tone !== undefined) addUpdate("tone", parsed.tone);
  if (parsed.autoPilot !== undefined)
    addUpdate("auto_pilot", parsed.autoPilot ? 1 : 0);
  if (parsed.status !== undefined) addUpdate("status", parsed.status);
  if (parsed.dailyPostLimit !== undefined)
    addUpdate("daily_post_limit", parsed.dailyPostLimit);
  if (parsed.dailyCommentLimit !== undefined)
    addUpdate("daily_comment_limit", parsed.dailyCommentLimit);

  if (updates.length > 0) {
    values.push(parsed.id);
    await db.execute(
      `UPDATE campaigns SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = $${values.length}`,
      values,
    );
  }

  if (parsed.keywords !== undefined) {
    await db.execute(`DELETE FROM campaign_keywords WHERE campaign_id = $1`, [
      parsed.id,
    ]);
    for (const keyword of uniqueKeywords(parsed.keywords)) {
      await db.execute(
        `INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source) VALUES ($1, $2, 'manual')`,
        [parsed.id, keyword],
      );
    }
  }
}

export async function addCampaignKeyword(
  campaignId: number,
  keyword: string,
  source: "manual" | "generated" | "learned" = "generated",
): Promise<void> {
  const trimmedKeyword = keyword.trim();
  if (!trimmedKeyword) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO campaign_keywords (campaign_id, keyword, source) VALUES ($1, $2, $3)`,
    [campaignId, trimmedKeyword, source],
  );
}

export async function deleteCampaign(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM campaign_keywords WHERE campaign_id = $1`, [
    id,
  ]);
  await db.execute(`DELETE FROM campaigns WHERE id = $1`, [id]);
}

export async function setCampaignStatus(
  id: number,
  status: CampaignStatus,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE campaigns SET status = $1, updated_at = datetime('now') WHERE id = $2`,
    [status, id],
  );
}

export async function attachKeywords(
  campaigns: Campaign[],
): Promise<CampaignWithKeywords[]> {
  if (campaigns.length === 0) return [];
  const db = await getDb();
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const placeholders = campaignIds
    .map((_, index) => `$${index + 1}`)
    .join(", ");
  const keywordRows = await db.select<CampaignKeywordRow[]>(
    `SELECT * FROM campaign_keywords WHERE campaign_id IN (${placeholders}) ORDER BY keyword ASC`,
    campaignIds,
  );

  const keywordsByCampaign = new Map<number, CampaignKeyword[]>();
  for (const row of keywordRows) {
    const current = keywordsByCampaign.get(row.campaign_id) ?? [];
    current.push(row);
    keywordsByCampaign.set(row.campaign_id, current);
  }

  return campaigns.map((campaign) => ({
    ...campaign,
    keywords: keywordsByCampaign.get(campaign.id) ?? [],
  }));
}
