import type { InvokeArgs } from "@tauri-apps/api/core";
import { IS_TEST, IS_TAURI } from "@/lib/env";
import {
  DesktopRequiredError,
  invokeCommand as invokeNativeCommand,
  toNativeCommandError,
} from "@/lib/tauri";
import {
  AGENT_PROVIDER_KEYS,
  defaultAgentModelFor,
} from "@/agent/provider-catalog";
import type { AgentProviderKey } from "@/agent/types";
import { isAutoRenewingAiSignIn } from "@/features/integrations/account-renewal";
import { AUTH_PROVIDERS } from "@/features/integrations/providers";
import {
  authProgressEventSchema,
  authStatusSchema,
  logoutSchema,
  oauthCancelSchema,
  oauthCodeSchema,
  oauthStartResultSchema,
  oauthStartSchema,
  saveApiKeySchema,
} from "@/features/integrations/schemas";
import type {
  AuthProgressEvent,
  AuthStatus,
  ConnectedAccount,
  LogoutInput,
  OAuthCodeInput,
  OAuthStartInput,
  OAuthStartResult,
  SaveApiKeyInput,
} from "@/features/integrations/types";

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;
type UnlistenFn = () => void;
type ListenFn = (
  event: string,
  handler: (event: { payload: unknown }) => void,
) => Promise<UnlistenFn>;

interface TauriWindowLike {
  __TAURI__?: { core?: { invoke?: unknown }; event?: { listen?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

const localStatus: AuthStatus = {
  providers: AUTH_PROVIDERS,
  accounts: [],
  events: [],
};

function isInvoke(candidate: unknown): candidate is InvokeFn {
  return typeof candidate === "function";
}

function isListen(candidate: unknown): candidate is ListenFn {
  return typeof candidate === "function";
}

function getInjectedInvoke(): InvokeFn | null {
  if (!IS_TEST || typeof window === "undefined") return null;
  const tauriWindow = window as unknown as TauriWindowLike;
  const candidate =
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke;
  return isInvoke(candidate) ? candidate : null;
}

async function invokeCommand(cmd: string, args?: unknown): Promise<unknown> {
  const injected = getInjectedInvoke();
  if (injected) {
    try {
      return await injected(cmd, args);
    } catch (error: unknown) {
      throw toNativeCommandError(error);
    }
  }
  if (!IS_TAURI) return null;
  return invokeNativeCommand(cmd, args as InvokeArgs | undefined);
}

/**
 * Credential changes need the native keychain boundary. Without a Tauri
 * runtime (browser preview) they fail closed instead of faking success.
 */
async function invokeMutation(cmd: string, args?: unknown): Promise<unknown> {
  const result = await invokeCommand(cmd, args);
  if (result === null) throw new DesktopRequiredError(cmd);
  return result;
}

const AI_ACCOUNT_KEYS: ReadonlySet<string> = new Set<string>(
  AGENT_PROVIDER_KEYS.filter((key) => key !== "dry_run"),
);

/**
 * True when a saved account lets the AI assistant write: an AI service that is
 * connected, or an OpenAI/Anthropic sign-in that renews itself. A custom
 * service also needs its own address. Single source for the setup checklist,
 * agent-runtime readiness and the AI service defaults in drafting dialogs.
 */
export function isUsableAiAccount(
  account: Pick<
    ConnectedAccount,
    "provider_key" | "auth_method" | "status" | "has_base_url_override"
  >,
): boolean {
  if (!AI_ACCOUNT_KEYS.has(account.provider_key)) return false;
  if (account.provider_key === "custom" && !account.has_base_url_override)
    return false;
  return account.status === "connected" || isAutoRenewingAiSignIn(account);
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const result = await invokeCommand("linkgo_auth_status");
  if (result === null) return localStatus;
  return authStatusSchema.parse(result);
}

/**
 * Default model for a provider, honouring how the operator connected it.
 * Only OpenAI's default depends on the auth method, so other providers skip
 * the status read. An unreadable status keeps the API-key default; native
 * execution still validates the model against the stored credential.
 */
export async function resolveDefaultAgentModel(
  providerKey: AgentProviderKey,
): Promise<string> {
  if (providerKey !== "openai") return defaultAgentModelFor(providerKey, []);
  try {
    const status = await getAuthStatus();
    return defaultAgentModelFor(providerKey, status.accounts);
  } catch {
    return defaultAgentModelFor(providerKey, []);
  }
}

export async function saveApiKey(input: SaveApiKeyInput): Promise<AuthStatus> {
  const parsed = saveApiKeySchema.parse(input);
  const result = await invokeMutation("linkgo_auth_api_key", {
    input: parsed,
  });
  return authStatusSchema.parse(result);
}

export async function startOAuth(
  input: OAuthStartInput,
): Promise<OAuthStartResult> {
  const parsed = oauthStartSchema.parse(input);
  const result = await invokeMutation("linkgo_auth_oauth_start", {
    input: parsed,
  });
  return oauthStartResultSchema.parse(result);
}

export async function submitOAuthCode(
  input: OAuthCodeInput,
): Promise<AuthStatus> {
  const parsed = oauthCodeSchema.parse(input);
  const result = await invokeMutation("linkgo_auth_oauth_code", {
    input: parsed,
  });
  return authStatusSchema.parse(result);
}

/** Stops a waiting OpenAI/Anthropic sign-in; saved credentials are untouched. */
export async function cancelOAuth(input: LogoutInput): Promise<AuthStatus> {
  const parsed = oauthCancelSchema.parse(input);
  const result = await invokeMutation("linkgo_auth_oauth_cancel", {
    input: parsed,
  });
  return authStatusSchema.parse(result);
}

export async function disconnectProvider(
  input: LogoutInput,
): Promise<AuthStatus> {
  const parsed = logoutSchema.parse(input);
  const result = await invokeMutation("linkgo_auth_logout", {
    input: parsed,
  });
  return authStatusSchema.parse(result);
}

export async function checkProvider(input: LogoutInput): Promise<AuthStatus> {
  const parsed = logoutSchema.parse(input);
  const result = await invokeMutation("linkgo_auth_check", {
    input: parsed,
  });
  return authStatusSchema.parse(result);
}

export async function subscribeToAuthProgress(
  handler: (event: AuthProgressEvent) => void,
): Promise<UnlistenFn> {
  if (IS_TEST && typeof window !== "undefined") {
    const listen = (window as unknown as TauriWindowLike).__TAURI__?.event
      ?.listen;
    if (isListen(listen)) {
      return listen("linkgo://auth-progress", (event) => {
        handler(authProgressEventSchema.parse(event.payload));
      });
    }
  }
  if (!IS_TAURI) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("linkgo://auth-progress", (event) => {
    handler(authProgressEventSchema.parse(event.payload));
  });
}

if (IS_TEST && typeof window !== "undefined") {
  (
    window as unknown as {
      __LINKGO_INTEGRATIONS_TEST_API__?: {
        getAuthStatus: typeof getAuthStatus;
        saveApiKey: typeof saveApiKey;
        startOAuth: typeof startOAuth;
        submitOAuthCode: typeof submitOAuthCode;
        cancelOAuth: typeof cancelOAuth;
        disconnectProvider: typeof disconnectProvider;
      };
    }
  ).__LINKGO_INTEGRATIONS_TEST_API__ = {
    getAuthStatus,
    saveApiKey,
    startOAuth,
    submitOAuthCode,
    cancelOAuth,
    disconnectProvider,
  };
}
