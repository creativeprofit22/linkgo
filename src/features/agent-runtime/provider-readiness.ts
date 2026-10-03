import type { AgentProviderKey } from "@/agent";
import { isUsableAiAccount } from "@/features/integrations/data";
import type { ConnectedAccount } from "@/features/integrations/types";

/**
 * Practice mode is always ready. Any other provider needs a usable account
 * (see isUsableAiAccount): connected, or an OpenAI/Anthropic sign-in whose
 * access token expired — native code refreshes it before each agent call and
 * returns a clear reconnect error if the refresh token is rejected. A custom
 * service also needs its own address. `reauth_required` stays not ready.
 */
export function isAgentProviderReady(
  providerKey: AgentProviderKey,
  connectedAccounts: ConnectedAccount[],
): boolean {
  if (providerKey === "dry_run") return true;
  return connectedAccounts.some(
    (account) =>
      account.provider_key === providerKey && isUsableAiAccount(account),
  );
}
