import { useCallback, useEffect, useState } from "react";
import {
  defaultAgentModelFor,
  type ModelDefaultAccount,
} from "@/agent/provider-catalog";
import type { AgentProviderKey } from "@/agent/types";
import { getAuthStatus } from "@/features/integrations/data";

/**
 * Returns a resolver for the default model of each provider, aware of how the
 * operator connected it (OpenAI account sign-in defaults to a ChatGPT-plan
 * model). Pass `accounts` when the caller already has them; otherwise the
 * connected accounts are read once on mount. Until they load, and if the read
 * fails, the API-key defaults apply.
 */
export function useAgentModelDefaults(
  accounts?: readonly ModelDefaultAccount[],
): (providerKey: AgentProviderKey) => string {
  const [loadedAccounts, setLoadedAccounts] = useState<
    readonly ModelDefaultAccount[]
  >([]);
  const shouldLoad = accounts === undefined;

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    void (async () => {
      try {
        const status = await getAuthStatus();
        if (active) setLoadedAccounts(status.accounts);
      } catch {
        // Keep the API-key defaults; native execution still validates models.
      }
    })();
    return () => {
      active = false;
    };
  }, [shouldLoad]);

  const effectiveAccounts = accounts ?? loadedAccounts;
  return useCallback(
    (providerKey: AgentProviderKey) =>
      defaultAgentModelFor(providerKey, effectiveAccounts),
    [effectiveAccounts],
  );
}
