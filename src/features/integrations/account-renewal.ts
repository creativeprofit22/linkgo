import type { ConnectedAccount } from "@/features/integrations/types";

/**
 * True when an OpenAI/Anthropic account sign-in has only an expired access
 * token. Native code refreshes it before every agent call (and reports a
 * reconnect error if the refresh token is rejected), so the account is still
 * usable. `reauth_required` and LinkedIn are deliberately excluded.
 * Keep in sync with agent-runtime provider readiness.
 */
export function isAutoRenewingAiSignIn(
  account: Pick<ConnectedAccount, "provider_key" | "auth_method" | "status">,
): boolean {
  return (
    account.auth_method === "oauth" &&
    account.status === "expired" &&
    (account.provider_key === "openai" || account.provider_key === "anthropic")
  );
}
