import type { AuthProviderKey } from "@/agent/provider-catalog";

export { AUTH_PROVIDER_KEYS } from "@/agent/provider-catalog";
export type { AuthProviderKey } from "@/agent/provider-catalog";

export const AUTH_METHODS = ["oauth", "api_key"] as const;

export const CONNECTED_ACCOUNT_STATUSES = [
  "disconnected",
  "connected",
  "expired",
  "reauth_required",
  "error",
] as const;

export const CREDENTIAL_EVENT_TYPES = [
  "connected",
  "disconnected",
  "refresh_succeeded",
  "refresh_failed",
  "reauth_required",
  "auth_error",
] as const;

export type AuthMethod = (typeof AUTH_METHODS)[number];
export type ConnectedAccountStatus =
  (typeof CONNECTED_ACCOUNT_STATUSES)[number];
export type CredentialEventType = (typeof CREDENTIAL_EVENT_TYPES)[number];

export interface AuthProvider {
  key: AuthProviderKey;
  label: string;
  description: string;
  methods: AuthMethod[];
  defaultMethod: AuthMethod;
  scopes: string[];
  models: string[];
  secretLabel: string;
  docsUrl: string;
}

export interface ConnectedAccount {
  id: number;
  provider_key: AuthProviderKey;
  provider_label: string;
  auth_method: AuthMethod;
  status: ConnectedAccountStatus;
  scopes: string;
  account_label: string;
  account_id: string;
  expires_at: string | null;
  refresh_expires_at: string | null;
  has_base_url_override: boolean;
  last_checked_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialEvent {
  id: number;
  provider_key: AuthProviderKey;
  event_type: CredentialEventType;
  summary: string;
  metadata_json: string;
  created_at: string;
}

export interface AuthStatus {
  providers: AuthProvider[];
  accounts: ConnectedAccount[];
  events: CredentialEvent[];
}

export interface SaveApiKeyInput {
  providerKey: AuthProviderKey;
  apiKey: string;
  baseUrl?: string | undefined;
  accountLabel?: string | undefined;
  /** Explicit consent to use a loopback/private or plain-HTTP Base URL. */
  allowLocalDestination?: boolean | undefined;
}

export interface OAuthStartInput {
  providerKey: AuthProviderKey;
  /** LinkedIn only; OpenAI/Anthropic scopes are fixed and non-empty values are rejected. */
  scopes?: string[] | undefined;
  /**
   * Required for OpenAI/Anthropic account sign-in: the operator accepted the
   * provider-terms and account risk. Native code rejects the start otherwise.
   */
  acknowledgeTermsRisk?: boolean | undefined;
}

export interface OAuthStartResult {
  providerKey: AuthProviderKey;
  authUrl: string;
  state: string;
  needsCode: boolean;
}

export interface OAuthCodeInput {
  providerKey: AuthProviderKey;
  code: string;
  state: string;
}

/** Providers whose account sign-in reuses another product's client. */
export const AI_ACCOUNT_SIGN_IN_PROVIDERS = ["openai", "anthropic"] as const;
export type AiAccountSignInProvider =
  (typeof AI_ACCOUNT_SIGN_IN_PROVIDERS)[number];

export interface LogoutInput {
  providerKey: AuthProviderKey;
}

export interface AuthProgressEvent {
  providerKey: AuthProviderKey;
  status:
    | "auth_url"
    | "auth_status"
    | "auth_need_code"
    | "auth_done"
    | "auth_error";
  summary: string;
  authUrl?: string | null | undefined;
}
