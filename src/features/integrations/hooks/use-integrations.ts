import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  cancelOAuth,
  checkProvider,
  disconnectProvider,
  getAuthStatus,
  saveApiKey,
  startOAuth,
  submitOAuthCode,
  subscribeToAuthProgress,
} from "@/features/integrations/data";
import { toPlainMessage } from "@/lib/plain-message";
import type {
  AuthProgressEvent,
  AuthStatus,
  LogoutInput,
  OAuthCodeInput,
  OAuthStartInput,
  OAuthStartResult,
  SaveApiKeyInput,
} from "@/features/integrations/types";
import { isBrowserPreview } from "@/lib/env";
import { DESKTOP_REQUIRED_MESSAGE } from "@/lib/tauri";

interface UseIntegrationsState extends AuthStatus {
  loading: boolean;
  error: string | null;
  /** Set in the browser preview, where credential changes are unavailable. */
  desktopRequiredMessage: string | null;
  progressEvents: AuthProgressEvent[];
  loadIntegrations: () => Promise<void>;
  saveKey: (input: SaveApiKeyInput) => Promise<void>;
  beginOAuth: (input: OAuthStartInput) => Promise<OAuthStartResult>;
  submitCode: (input: OAuthCodeInput) => Promise<void>;
  cancelSignIn: (input: LogoutInput) => Promise<void>;
  disconnect: (input: LogoutInput) => Promise<void>;
  check: (input: LogoutInput) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "Something went wrong with your connected accounts. Try again.";
}

export function useIntegrations(): UseIntegrationsState {
  const [status, setStatus] = useState<AuthStatus>({
    providers: [],
    accounts: [],
    events: [],
  });
  const [progressEvents, setProgressEvents] = useState<AuthProgressEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desktopRequiredMessage] = useState<string | null>(() =>
    isBrowserPreview() ? DESKTOP_REQUIRED_MESSAGE : null,
  );

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getAuthStatus());
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | null = null;
    void subscribeToAuthProgress((event) => {
      if (!active) return;
      setProgressEvents((current) => [event, ...current].slice(0, 8));
      // Loopback sign-in finishes natively; reload so the card reflects it.
      if (event.status === "auth_done" || event.status === "auth_error") {
        void (async () => {
          try {
            const next = await getAuthStatus();
            if (active) setStatus(next);
          } catch {
            // The next manual refresh surfaces load errors.
          }
        })();
      }
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  const saveKey = useCallback(async (input: SaveApiKeyInput) => {
    try {
      setStatus(await saveApiKey(input));
      toast.success("Account connected");
    } catch (caught) {
      toast.error("We couldn't connect this account", {
        description: getErrorMessage(caught),
      });
      throw caught;
    }
  }, []);

  const beginOAuth = useCallback(async (input: OAuthStartInput) => {
    try {
      const result = await startOAuth(input);
      toast.success("Sign-in started");
      return result;
    } catch (caught) {
      toast.error("We couldn't start sign-in", {
        description: getErrorMessage(caught),
      });
      throw caught;
    }
  }, []);

  const submitCode = useCallback(async (input: OAuthCodeInput) => {
    try {
      setStatus(await submitOAuthCode(input));
      toast.success("Account connected");
    } catch (caught) {
      toast.error("That sign-in code didn't work", {
        description: getErrorMessage(caught),
      });
      throw caught;
    }
  }, []);

  const cancelSignIn = useCallback(async (input: LogoutInput) => {
    try {
      setStatus(await cancelOAuth(input));
    } catch (caught) {
      toast.error("We couldn't cancel sign-in", {
        description: getErrorMessage(caught),
      });
      throw caught;
    }
  }, []);

  const disconnect = useCallback(async (input: LogoutInput) => {
    try {
      setStatus(await disconnectProvider(input));
      toast.success("Account disconnected");
    } catch (caught) {
      toast.error("We couldn't disconnect this account", {
        description: getErrorMessage(caught),
      });
      throw caught;
    }
  }, []);

  const check = useCallback(async (input: LogoutInput) => {
    try {
      setStatus(await checkProvider(input));
    } catch (caught) {
      toast.error("Connection check failed", {
        description: getErrorMessage(caught),
      });
      throw caught;
    }
  }, []);

  return useMemo(
    () => ({
      ...status,
      loading,
      error,
      desktopRequiredMessage,
      progressEvents,
      loadIntegrations,
      saveKey,
      beginOAuth,
      submitCode,
      cancelSignIn,
      disconnect,
      check,
    }),
    [
      status,
      loading,
      error,
      desktopRequiredMessage,
      progressEvents,
      loadIntegrations,
      saveKey,
      beginOAuth,
      submitCode,
      cancelSignIn,
      disconnect,
      check,
    ],
  );
}
