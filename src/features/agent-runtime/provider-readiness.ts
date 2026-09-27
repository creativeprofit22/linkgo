import type { AgentProviderKey } from "@/agent";
import type { ConnectedAccount } from "@/features/integrations/types";

/**
 * An OpenAI/Anthropic account sign-in whose access token expired is still
 * usable: native code refreshes it before each agent call and returns a clear
 * reconnect error if the refresh token is rejected. `reauth_required` stays
 * not ready. Mirrors isAutoRenewingAiSignIn in the integrations feature.
 */
function isRenewableAiSignIn(account: ConnectedAccount): boolean {
  return (
    account.auth_method === "oauth" &&
    account.status === "expired" &&
    (account.provider_key === "openai" || account.provider_key === "anthropic")
  );
}

export function isAgentProviderReady(
  providerKey: AgentProviderKey,
  connectedAccounts: ConnectedAccount[],
): boolean {
  if (providerKey === "dry_run") return true;
  return connectedAccounts.some(
    (account) =>
      account.provider_key === providerKey &&
      (account.status === "connected" || isRenewableAiSignIn(account)) &&
      (providerKey !== "custom" || account.has_base_url_override),
  );
}
