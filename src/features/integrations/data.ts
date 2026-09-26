import type { InvokeArgs } from "@tauri-apps/api/core";
import { IS_TEST, IS_TAURI } from "@/lib/env";
import {
  DesktopRequiredError,
  invokeCommand as invokeNativeCommand,
  toNativeCommandError,
} from "@/lib/tauri";
import { AUTH_PROVIDERS } from "@/features/integrations/providers";
import {
  authProgressEventSchema,
  authStatusSchema,
  logoutSchema,
  oauthCodeSchema,
  oauthStartResultSchema,
  oauthStartSchema,
  providerSecretInputSchema,
  providerSecretSchema,
  saveApiKeySchema,
} from "@/features/integrations/schemas";
import type {
  AuthProgressEvent,
  AuthStatus,
  LogoutInput,
  OAuthCodeInput,
  OAuthStartInput,
  OAuthStartResult,
  ProviderSecret,
  ProviderSecretInput,
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

export async function getAuthStatus(): Promise<AuthStatus> {
  const result = await invokeCommand("linkgo_auth_status");
  if (result === null) return localStatus;
  return authStatusSchema.parse(result);
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

export async function getProviderSecret(
  input: ProviderSecretInput,
): Promise<ProviderSecret> {
  const parsed = providerSecretInputSchema.parse(input);
  const result = await invokeMutation("linkgo_auth_provider_secret", {
    input: parsed,
  });
  return providerSecretSchema.parse(result);
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
        disconnectProvider: typeof disconnectProvider;
        getProviderSecret: typeof getProviderSecret;
      };
    }
  ).__LINKGO_INTEGRATIONS_TEST_API__ = {
    getAuthStatus,
    saveApiKey,
    startOAuth,
    submitOAuthCode,
    disconnectProvider,
    getProviderSecret,
  };
}
