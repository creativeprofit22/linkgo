import { defineRoute, emptyRouteSearch } from "@/lib/navigation/route-contract";
import { z } from "zod";

export const campaignStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "archived",
]);

export const campaignKeywordSourceSchema = z.enum([
  "manual",
  "generated",
  "learned",
]);

/** Field limits mirrored by native `validate_create`/`validate_update`. */
export const CAMPAIGN_NAME_MAX = 120;
export const CAMPAIGN_TEXT_MAX = 500;
export const CAMPAIGN_TONE_MAX = 240;
export const CAMPAIGN_KEYWORD_MAX = 80;
export const CAMPAIGN_KEYWORDS_MAX = 30;
export const CAMPAIGN_DAILY_POST_LIMIT_MAX = 10;
export const CAMPAIGN_DAILY_COMMENT_LIMIT_MAX = 50;

const keywordLimitMessage = `Up to ${CAMPAIGN_KEYWORDS_MAX} keywords, each at most ${CAMPAIGN_KEYWORD_MAX} characters.`;

const keywordListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Keywords cannot be empty.")
      .max(CAMPAIGN_KEYWORD_MAX, keywordLimitMessage),
  )
  .max(CAMPAIGN_KEYWORDS_MAX, keywordLimitMessage);

function maxTextSchema(label: string, max: number): z.ZodString {
  return z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`);
}

/**
 * Default-free campaign fields. Zod 4 `.partial()` still applies `.default()`
 * values, so the partial update schema must be built from this base; otherwise
 * omitted fields would be filled in and overwrite stored columns natively.
 */
const campaignFieldsSchema = z.object({
  name: maxTextSchema("Name", CAMPAIGN_NAME_MAX).min(1, "Name is required"),
  product: maxTextSchema("Product", CAMPAIGN_TEXT_MAX),
  audience: maxTextSchema("Audience", CAMPAIGN_TEXT_MAX),
  voice: maxTextSchema("Voice", CAMPAIGN_TEXT_MAX),
  tone: maxTextSchema("Tone", CAMPAIGN_TONE_MAX),
  autoPilot: z.boolean(),
  dailyPostLimit: z
    .number()
    .int("Daily post limit must be a whole number.")
    .min(0, "Daily post limit cannot be negative.")
    .max(
      CAMPAIGN_DAILY_POST_LIMIT_MAX,
      `Daily post limit must be at most ${CAMPAIGN_DAILY_POST_LIMIT_MAX}.`,
    ),
  dailyCommentLimit: z
    .number()
    .int("Daily comment limit must be a whole number.")
    .min(0, "Daily comment limit cannot be negative.")
    .max(
      CAMPAIGN_DAILY_COMMENT_LIMIT_MAX,
      `Daily comment limit must be at most ${CAMPAIGN_DAILY_COMMENT_LIMIT_MAX}.`,
    ),
  keywords: keywordListSchema,
});

const campaignFields = campaignFieldsSchema.shape;

export const createCampaignSchema = campaignFieldsSchema.extend({
  product: campaignFields.product.default(""),
  audience: campaignFields.audience.default(""),
  voice: campaignFields.voice.default(""),
  tone: campaignFields.tone.default(""),
  autoPilot: campaignFields.autoPilot.default(false),
  dailyPostLimit: campaignFields.dailyPostLimit.default(1),
  dailyCommentLimit: campaignFields.dailyCommentLimit.default(5),
  keywords: campaignFields.keywords.default([]),
});

/** Partial update: omitted fields stay omitted so native leaves them as-is. */
export const updateCampaignSchema = campaignFieldsSchema.partial().extend({
  id: z.number().int().positive(),
  status: campaignStatusSchema.optional(),
});

/** Native `linkgo_campaign_list` keyword row. */
export const campaignKeywordRowSchema = z
  .object({
    id: z.number().int(),
    campaign_id: z.number().int(),
    keyword: z.string(),
    source: campaignKeywordSourceSchema,
    created_at: z.string(),
  })
  .strict();

/** Native campaign row with keywords ordered `keyword ASC`. */
export const campaignWithKeywordsSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    product: z.string(),
    audience: z.string(),
    voice: z.string(),
    tone: z.string(),
    auto_pilot: z.number().int(),
    status: campaignStatusSchema,
    daily_post_limit: z.number().int(),
    daily_comment_limit: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
    keywords: z.array(campaignKeywordRowSchema),
  })
  .strict();

export const campaignListSchema = z.array(campaignWithKeywordsSchema);

/** Address of the Campaigns screen (`#/campaigns`). See docs/features/navigation.md. */
export const campaignsRoute = defineRoute("campaigns", emptyRouteSearch());
