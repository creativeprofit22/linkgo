import type { AgentProviderKey } from "@/agent";
import type { ConnectedAccount } from "@/features/integrations/types";

export function isAgentProviderReady(
  providerKey: AgentProviderKey,
  connectedAccounts: ConnectedAccount[],
): boolean {
  if (providerKey === "dry_run") return true;
  return connectedAccounts.some(
    (account) =>
      account.provider_key === providerKey &&
      account.status === "connected" &&
      (providerKey !== "custom" || account.has_base_url_override),
  );
}
