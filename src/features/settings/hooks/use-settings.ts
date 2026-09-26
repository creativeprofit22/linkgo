import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getLaunchOnLoginSettings,
  setLaunchOnLogin,
} from "@/features/settings/data";
import type { LaunchOnLoginSettings } from "@/features/settings/types";
import { isBrowserPreview } from "@/lib/env";
import { DESKTOP_REQUIRED_MESSAGE } from "@/lib/tauri";

interface UseSettingsState {
  launchOnLogin: LaunchOnLoginSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Set in the browser preview, where OS settings cannot be changed. */
  desktopRequiredMessage: string | null;
  loadSettings: () => Promise<void>;
  setLaunchOnLoginEnabled: (enabled: boolean) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected settings error";
}

export function useSettings(): UseSettingsState {
  const [launchOnLogin, setLaunchOnLoginState] =
    useState<LaunchOnLoginSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [desktopRequiredMessage] = useState<string | null>(() =>
    isBrowserPreview() ? DESKTOP_REQUIRED_MESSAGE : null,
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLaunchOnLoginState(await getLaunchOnLoginSettings());
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const setLaunchOnLoginEnabled = useCallback(
    async (enabled: boolean) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const nextSettings = await setLaunchOnLogin({ enabled });
        setLaunchOnLoginState(nextSettings);
        if (nextSettings.enabled !== enabled) {
          toast.warning("Launch-on-login setting synced differently", {
            description: nextSettings.enabled
              ? "The OS reports launch on login is enabled."
              : "The OS reports launch on login is disabled.",
          });
          return;
        }

        toast.success(
          nextSettings.enabled
            ? "Launch on login enabled"
            : "Launch on login disabled",
        );
      } catch (caught) {
        const message = getErrorMessage(caught);
        setError(message);
        toast.error("Launch-on-login setting was not changed", {
          description: message,
        });
        await loadSettings();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [loadSettings],
  );

  return useMemo(
    () => ({
      launchOnLogin,
      loading,
      saving,
      error,
      desktopRequiredMessage,
      loadSettings,
      setLaunchOnLoginEnabled,
    }),
    [
      launchOnLogin,
      loading,
      saving,
      error,
      desktopRequiredMessage,
      loadSettings,
      setLaunchOnLoginEnabled,
    ],
  );
}
