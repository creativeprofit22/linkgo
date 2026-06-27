import { AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderLoginDialog } from "@/features/integrations/components/provider-login-dialog";
import { useIntegrations } from "@/features/integrations/hooks/use-integrations";
import type {
  AuthProvider,
  ConnectedAccount,
  ConnectedAccountStatus,
} from "@/features/integrations/types";

const statusLabels: Record<ConnectedAccountStatus, string> = {
  disconnected: "Disconnected",
  connected: "Connected",
  expired: "Expired",
  reauth_required: "Reauth required",
  error: "Error",
};

export function IntegrationsView(): React.ReactNode {
  const {
    providers,
    accounts,
    progressEvents,
    loading,
    error,
    loadIntegrations,
    saveKey,
    beginOAuth,
    submitCode,
    disconnect,
    check,
  } = useIntegrations();

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
                Integrations
              </h2>
              <p className="text-muted-foreground text-sm">
                Native credential boundary for AI providers and LinkedIn OAuth
                foundation.
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
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            Loading integrations…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                account={
                  accounts.find(
                    (candidate) => candidate.provider_key === provider.key,
                  ) ?? null
                }
                onSaveKey={saveKey}
                onStartOAuth={beginOAuth}
                onSubmitCode={submitCode}
                onDisconnect={disconnect}
                onCheck={check}
              />
            ))}
          </div>

          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle className="text-base">Recent auth progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {progressEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No auth progress events yet. Connect a provider to see native
                  status updates.
                </p>
              ) : (
                progressEvents.map((event, index) => (
                  <div
                    key={`${event.providerKey}-${event.status}-${index}`}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <p className="font-medium">{event.summary}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {event.providerKey} · {event.status}
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
  onDisconnect,
  onCheck,
}: {
  provider: AuthProvider;
  account: ConnectedAccount | null;
  onSaveKey: React.ComponentProps<typeof ProviderLoginDialog>["onSaveKey"];
  onStartOAuth: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onStartOAuth"];
  onSubmitCode: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onSubmitCode"];
  onDisconnect: React.ComponentProps<
    typeof ProviderLoginDialog
  >["onDisconnect"];
  onCheck: React.ComponentProps<typeof ProviderLoginDialog>["onCheck"];
}): React.ReactNode {
  const status = account?.status ?? "disconnected";
  const connected = status === "connected";

  return (
    <Card className="bg-card/70">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{provider.label}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {provider.description}
            </p>
          </div>
          <Badge variant={connected ? "secondary" : "outline"}>
            {connected && <ShieldCheck className="mr-1 size-3" />}
            {statusLabels[status]}
          </Badge>
        </div>
        <div className="text-muted-foreground text-xs">
          Methods: {provider.methods.join(", ")}
          {provider.scopes.length > 0
            ? ` · Scopes: ${provider.scopes.join(" ")}`
            : ""}
        </div>
        {account?.last_error && (
          <p className="text-destructive text-sm">{account.last_error}</p>
        )}
        <div className="mt-auto flex justify-end">
          <ProviderLoginDialog
            provider={provider}
            account={account}
            onSaveKey={onSaveKey}
            onStartOAuth={onStartOAuth}
            onSubmitCode={onSubmitCode}
            onDisconnect={onDisconnect}
            onCheck={onCheck}
          />
        </div>
      </CardContent>
    </Card>
  );
}
