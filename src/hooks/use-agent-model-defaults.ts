import { useCallback, useEffect, useState } from "react";
import {
  defaultAgentModelFor,
  GG_AI_PROVIDER_KEYS,
  type ModelDefaultAccount,
} from "@/agent/provider-catalog";
import type { AgentProviderKey } from "@/agent/types";
import { getAuthStatus } from "@/features/integrations/data";
import type { ConnectedAccount } from "@/features/integrations/types";

export interface AgentAccounts {
  /** Connected accounts, empty until loaded or when the read fails. */
  accounts: readonly ConnectedAccount[];
  /** True once the read finished (successfully or not). */
  loaded: boolean;
  defaultModelFor: (providerKey: AgentProviderKey) => string;
  /**
   * First AI service with a `connected` account, in catalog order, then
   * "Other AI service". Practice mode only when none is connected.
   */
  defaultProvider: AgentProviderKey;
  /** True when at least one AI service account is connected. */
  hasConnectedAi: boolean;
}

const AI_PROVIDER_ORDER: readonly AgentProviderKey[] = [
  ...GG_AI_PROVIDER_KEYS,
  "custom",
];

function firstConnectedAiProvider(
  accounts: readonly ConnectedAccount[],
): AgentProviderKey | null {
  for (const providerKey of AI_PROVIDER_ORDER)
    if (
      accounts.some(
        (account) =>
          account.provider_key === providerKey &&
          account.status === "connected",
      )
    )
      return providerKey;
  return null;
}

/**
 * Reads the connected accounts once on mount and derives the AI defaults
 * from them. If the read fails, Practice mode and the API-key model defaults
 * apply; native execution still validates every provider and model.
 */
export function useAgentAccounts(): AgentAccounts {
  const [state, setState] = useState<{
    accounts: readonly ConnectedAccount[];
    loaded: boolean;
  }>({ accounts: [], loaded: false });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await getAuthStatus();
        if (active) setState({ accounts: status.accounts, loaded: true });
      } catch {
        if (active) setState({ accounts: [], loaded: true });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { accounts, loaded } = state;
  const defaultModelFor = useCallback(
    (providerKey: AgentProviderKey) =>
      defaultAgentModelFor(providerKey, accounts),
    [accounts],
  );
  const connected = firstConnectedAiProvider(accounts);
  return {
    accounts,
    loaded,
    defaultModelFor,
    defaultProvider: connected ?? "dry_run",
    hasConnectedAi: connected !== null,
  };
}

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
