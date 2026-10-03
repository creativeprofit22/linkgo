import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderLoginDialog } from "@/features/integrations/components/provider-login-dialog";
import { isAutoRenewingAiSignIn } from "@/features/integrations/account-renewal";
import { useIntegrations } from "@/features/integrations/hooks/use-integrations";
import { getAuthProvider } from "@/features/integrations/providers";
import { integrationsRoute } from "@/features/integrations/schemas";
import type {
  AuthProgressEvent,
  AuthProvider,
  ConnectedAccount,
  ConnectedAccountStatus,
} from "@/features/integrations/types";
import {
  navigateTo,
  useRouteParams,
} from "@/lib/navigation/use-hash-navigation";
import { toPlainMessage } from "@/lib/plain-message";

const statusLabels: Record<ConnectedAccountStatus, string> = {
  disconnected: "Disconnected",
  connected: "Connected",
  expired: "Expired",
  reauth_required: "Sign in again",
  error: "Problem connecting",
};

const methodLabels: Record<string, string> = {
  api_key: "access key",
  oauth: "account sign-in",
};

const progressStatusLabels: Record<string, string> = {
  auth_url: "Sign-in page opened",
  auth_status: "Signing in",
  auth_need_code: "Waiting for your sign-in code",
  auth_done: "Signed in",
  auth_error: "Sign-in failed",
};

function providerName(key: string): string {
  return getAuthProvider(key)?.label ?? key;
}

/**
 * The desktop app may send older wording; show the plain on-screen name and
 * key field label from the app's own catalog instead.
 */
function withPlainLabel(provider: AuthProvider): AuthProvider {
  const known = getAuthProvider(provider.key);
  return known === null
    ? provider
    : { ...provider, label: known.label, secretLabel: known.secretLabel };
}

/** LinkedIn first (it's the first setup step), then the catalog order. */
function linkedInFirst(providers: readonly AuthProvider[]): AuthProvider[] {
  return [
    ...providers.filter((provider) => provider.key === "linkedin"),
    ...providers.filter((provider) => provider.key !== "linkedin"),
  ];
}

export function IntegrationsView(): React.ReactNode {
  const {
    providers,
    accounts,
    progressEvents,
    loading,
    error,
    desktopRequiredMessage,
    loadIntegrations,
    saveKey,
    beginOAuth,
    submitCode,
    cancelSignIn,
    disconnect,
    check,
  } = useIntegrations();
  const { params: linkParams } = useRouteParams(integrationsRoute);
  // A `connect` link opens that service's dialog once accounts have loaded;
  // the browser preview can't connect anything, so it only shows the screen.
  const linkedProviderKey =
    !loading && desktopRequiredMessage === null
      ? (linkParams?.connect ?? null)
      : null;
  // Closing a dialog a link opened drops `connect` from the address
  // (replace), so refresh doesn't reopen it while Back/Forward still work.
  const closeConnectLink = (open: boolean): void => {
    if (!open && linkParams?.connect !== undefined) {
      navigateTo(integrationsRoute, undefined, { replace: true });
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-11 items-center justify-center rounded-xl">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Connected accounts
              </h2>
              <p className="text-muted-foreground text-sm">
                Connect LinkedIn and your AI account. Your sign-in details stay
                private on this computer.
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadIntegrations()}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-destructive size-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadIntegrations()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {desktopRequiredMessage && (
        <Card className="border-dashed">
          <CardContent
            id="integrations-desktop-required"
            className="text-muted-foreground p-4 text-sm"
          >
            {desktopRequiredMessage}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading connected accounts…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {linkedInFirst(providers).map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={withPlainLabel(provider)}
                linkOpen={linkedProviderKey === provider.key}
                onLinkOpenChange={closeConnectLink}
                account={
                  accounts.find(
                    (candidate) => candidate.provider_key === provider.key,
                  ) ?? null
                }
                onSaveKey={saveKey}
                onStartOAuth={beginOAuth}
                onSubmitCode={submitCode}
                onCancelSignIn={cancelSignIn}
                onDisconnect={disconnect}
                onCheck={check}
                progressEvent={
                  progressEvents.find(
                    (event) => event.providerKey === provider.key,
                  ) ?? null
                }
                desktopRequired={desktopRequiredMessage !== null}
              />
            ))}
          </div>

          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">
                Recent sign-in activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {progressEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No sign-in activity yet. Connect an account to see updates
                  here.
                </p>
              ) : (
                progressEvents.map((event, index) => (
                  <div
                    key={`${event.providerKey}-${event.status}-${index}`}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {toPlainMessage(event.summary)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {providerName(event.providerKey)} ·{" "}
                      {progressStatusLabels[event.status] ?? event.status}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  account,
  onSaveKey,
  onStartOAuth,
  onSubmitCode,
  onCancelSignIn,
  onDisconnect,
  onCheck,
  progressEvent,
  desktopRequired,
  linkOpen,
  onLinkOpenChange,
}: {
  provider: AuthProvider;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
  account: ConnectedAccount | null;
  onSaveKey: React.ComponentProps<typeof ProviderLoginDialog>["onSaveKey"];
  onStartOAuth: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onStartOAuth"];
  onSubmitCode: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onSubmitCode"];
  onCancelSignIn: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onCancelSignIn"];
  onDisconnect: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onDisconnect"];
  progressEvent: AuthProgressEvent | null;
  onCheck: React.ComponentProps<typeof ProviderLoginDialog>["onCheck"];
  desktopRequired: boolean;
}): React.ReactNode {
  const status = account?.status ?? "disconnected";
  const renewing = account !== null && isAutoRenewingAiSignIn(account);
  const connected = status === "connected" || renewing;

  return (
    <Card className="bg-card/70">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{provider.label}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {getAuthProvider(provider.key)?.description ??
                provider.description}
            </p>
          </div>
          <Badge variant={connected ? "secondary" : "outline"}>
            {connected && <ShieldCheck className="mr-1 size-3" />}
            {renewing ? "Renews next time it's used" : statusLabels[status]}
          </Badge>
        </div>
        <div className="text-muted-foreground text-xs">
          Connect with:{" "}
          {provider.methods
            .map((method) => methodLabels[method] ?? method)
            .join(" or ")}
        </div>
        {account?.auth_method === "oauth" &&
          account.provider_key !== "linkedin" && (
            <p className="text-muted-foreground text-xs">
              Signed in with account
              {account.account_label ? ` · ${account.account_label}` : ""}
            </p>
          )}
        {renewing && (
          <p className="text-muted-foreground text-xs">
            Your sign-in expired. It renews automatically the next time the AI
            assistant uses it. Nothing to do.
          </p>
        )}
        {account?.last_error && (
          <p className="text-destructive text-sm">
            {toPlainMessage(account.last_error)}
          </p>
        )}
        <div className="mt-auto flex justify-end">
          <ProviderLoginDialog
            provider={provider}
            account={account}
            onSaveKey={onSaveKey}
            onStartOAuth={onStartOAuth}
            onSubmitCode={onSubmitCode}
            onCancelSignIn={onCancelSignIn}
            onDisconnect={onDisconnect}
            onCheck={onCheck}
            progressEvent={progressEvent}
            disabled={desktopRequired}
            disabledReasonId="integrations-desktop-required"
            open={linkOpen ? true : undefined}
            onOpenChange={linkOpen ? onLinkOpenChange : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}
