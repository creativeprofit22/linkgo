import { z } from "zod";
import {
  AUTH_METHODS,
  AUTH_PROVIDER_KEYS,
  CONNECTED_ACCOUNT_STATUSES,
  CREDENTIAL_EVENT_TYPES,
} from "@/features/integrations/types";

export const authMethodSchema = z.enum(AUTH_METHODS);
export const authProviderKeySchema = z.enum(AUTH_PROVIDER_KEYS);
export const connectedAccountStatusSchema = z.enum(CONNECTED_ACCOUNT_STATUSES);
export const credentialEventTypeSchema = z.enum(CREDENTIAL_EVENT_TYPES);

export const authProviderSchema = z.object({
  key: authProviderKeySchema,
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  methods: z.array(authMethodSchema).min(1),
  defaultMethod: authMethodSchema,
  scopes: z.array(z.string().trim().min(1)),
  models: z.array(z.string().trim().min(1)),
  secretLabel: z.string().trim().min(1),
  docsUrl: z.string().trim(),
});

export const connectedAccountSchema = z.object({
  id: z.number().int().positive(),
  provider_key: authProviderKeySchema,
  provider_label: z.string().trim().min(1),
  auth_method: authMethodSchema,
  status: connectedAccountStatusSchema,
  scopes: z.string(),
  account_label: z.string(),
  account_id: z.string(),
  expires_at: z.string().nullable(),
  refresh_expires_at: z.string().nullable(),
  has_base_url_override: z.boolean().default(false),
  last_checked_at: z.string().nullable(),
  last_error: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const credentialEventSchema = z.object({
  id: z.number().int().positive(),
  provider_key: authProviderKeySchema,
  event_type: credentialEventTypeSchema,
  summary: z.string(),
  metadata_json: z.string(),
  created_at: z.string(),
});

export const authStatusSchema = z.object({
  providers: z.array(authProviderSchema),
  accounts: z.array(connectedAccountSchema),
  events: z.array(credentialEventSchema),
});

export const saveApiKeySchema = z
  .object({
    providerKey: authProviderKeySchema.exclude(["linkedin"]),
    apiKey: z.string().trim().min(8).max(4000),
    baseUrl: z.string().trim().optional().or(z.literal("")),
    accountLabel: z.string().trim().max(120).optional(),
  })
  .superRefine((input, context) => {
    if (input.providerKey !== "custom") return;
    if (input.baseUrl !== undefined && input.baseUrl.trim() !== "") return;

    context.addIssue({
      code: "custom",
      path: ["baseUrl"],
      message: "Custom provider requires a Base URL override",
    });
  });

export const oauthStartSchema = z.object({
  providerKey: authProviderKeySchema,
  scopes: z.array(z.string().trim().min(1)).optional(),
});

export const oauthStartResultSchema = z.object({
  providerKey: authProviderKeySchema,
  authUrl: z.string().trim(),
  state: z.string().trim().min(8),
  needsCode: z.boolean(),
});

export const oauthCodeSchema = z.object({
  providerKey: authProviderKeySchema,
  code: z.string().trim().min(1).max(2000),
  state: z.string().trim().min(8),
});

export const logoutSchema = z.object({
  providerKey: authProviderKeySchema,
});

export const providerSecretInputSchema = z.object({
  providerKey: authProviderKeySchema.exclude(["linkedin"]),
});

export const providerSecretSchema = z.object({
  providerKey: authProviderKeySchema.exclude(["linkedin"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().optional(),
});

export const authProgressEventSchema = z.object({
  providerKey: authProviderKeySchema,
  status: z.enum([
    "auth_url",
    "auth_status",
    "auth_need_code",
    "auth_done",
    "auth_error",
  ]),
  summary: z.string().trim().min(1),
  authUrl: z.string().trim().optional(),
});
