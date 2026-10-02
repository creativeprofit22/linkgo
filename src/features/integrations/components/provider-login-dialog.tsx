import { useMemo, useState } from "react";
import { Copy, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiAccountSignIn } from "@/features/integrations/components/ai-account-sign-in";
import { isAutoRenewingAiSignIn } from "@/features/integrations/account-renewal";
import { needsLocalDestinationConsent } from "@/features/integrations/destination";
import type {
  AiAccountSignInProvider,
  AuthMethod,
  AuthProgressEvent,
  AuthProvider,
  AuthProviderKey,
  ConnectedAccount,
  OAuthStartResult,
  SaveApiKeyInput,
} from "@/features/integrations/types";

interface ProviderLoginDialogProps {
  provider: AuthProvider;
  account: ConnectedAccount | null;
  onSaveKey: (input: SaveApiKeyInput) => Promise<void>;
  onStartOAuth: (input: {
    providerKey: AuthProviderKey;
    acknowledgeTermsRisk?: boolean;
  }) => Promise<OAuthStartResult>;
  onSubmitCode: (input: {
    providerKey: AuthProviderKey;
    code: string;
    state: string;
  }) => Promise<void>;
  onCancelSignIn: (input: { providerKey: AuthProviderKey }) => Promise<void>;
  onDisconnect: (input: { providerKey: AuthProviderKey }) => Promise<void>;
  onCheck: (input: { providerKey: AuthProviderKey }) => Promise<void>;
  /** Latest native auth progress event for this provider. */
  progressEvent?: AuthProgressEvent | null;
  /** Blocks opening the dialog, e.g. in the browser preview. */
  disabled?: boolean;
  /** Element id explaining why the dialog is disabled. */
  disabledReasonId?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText === undefined) return false;

    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function aiAccountProvider(
  key: AuthProviderKey,
): AiAccountSignInProvider | null {
  return key === "openai" || key === "anthropic" ? key : null;
}

function formatExpiry(expiresAt: string | null): string | null {
  if (expiresAt === null || expiresAt === "") return null;
  const seconds = Number(expiresAt);
  const date = Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

/** Matches the native LocalWithoutConsent destination error. */
function isLocalConsentRequiredError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("allow the local endpoint")
  );
}

export function ProviderLoginDialog({
  provider,
  account,
  onSaveKey,
  onStartOAuth,
  onSubmitCode,
  onCancelSignIn,
  onDisconnect,
  onCheck,
  progressEvent = null,
  disabled = false,
  disabledReasonId,
}: ProviderLoginDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const aiProvider = aiAccountProvider(provider.key);
  const [method, setMethod] = useState<AuthMethod>(provider.defaultMethod);
  const [confirmReplaceSignIn, setConfirmReplaceSignIn] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [allowLocalDestination, setAllowLocalDestination] = useState(false);
  const [oauthStart, setOauthStart] = useState<OAuthStartResult | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [copiedAuthUrl, setCopiedAuthUrl] = useState(false);
  const [copyAuthUrlError, setCopyAuthUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const renewing = account !== null && isAutoRenewingAiSignIn(account);
  const connected = account?.status === "connected" || renewing;
  const signedIn = aiProvider !== null && account?.auth_method === "oauth";
  const needsReconnect = account?.status === "reauth_required";
  const expiry = signedIn ? formatExpiry(account?.expires_at ?? null) : null;
  const offersBothMethods =
    aiProvider !== null &&
    provider.methods.includes("api_key") &&
    provider.methods.includes("oauth");
  const supportsApiKey =
    provider.methods.includes("api_key") &&
    (!offersBothMethods || method === "api_key");
  const supportsOAuth =
    provider.methods.includes("oauth") &&
    (!offersBothMethods || method === "oauth");
  const requiresBaseUrl = provider.key === "custom";
  // Native policy is authoritative; when it rejects a destination the
  // renderer hint missed, show the consent checkbox anyway.
  const [nativeRequiresConsent, setNativeRequiresConsent] = useState(false);
  const showLocalConsent =
    nativeRequiresConsent || needsLocalDestinationConsent(baseUrl);
  const canSaveApiKey =
    !busy &&
    apiKey.trim().length >= 8 &&
    (!requiresBaseUrl || baseUrl.trim() !== "");
  const safeAccountLabel = account?.account_label || account?.provider_label;
  const maskedSecret = useMemo(
    () =>
      connected ? "Connected. Your key is stored safely and never shown." : "",
    [connected],
  );

  async function handleSaveKey(): Promise<void> {
    // Saving a key replaces an account sign-in for the same provider.
    if (signedIn && !confirmReplaceSignIn) {
      setConfirmReplaceSignIn(true);
      return;
    }
    setBusy(true);
    try {
      await onSaveKey({
        providerKey: provider.key,
        apiKey,
        baseUrl: baseUrl.trim() || undefined,
        accountLabel: accountLabel.trim() || undefined,
        allowLocalDestination: showLocalConsent && allowLocalDestination,
      });
      setApiKey("");
      setBaseUrl("");
      setAccountLabel("");
      setAllowLocalDestination(false);
      setNativeRequiresConsent(false);
      setConfirmReplaceSignIn(false);
    } catch (caught) {
      // The caller already reports the error; only react to the consent case.
      if (isLocalConsentRequiredError(caught)) setNativeRequiresConsent(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartOAuth(): Promise<void> {
    setBusy(true);
    try {
      setOauthStart(await onStartOAuth({ providerKey: provider.key }));
      setCopiedAuthUrl(false);
      setCopyAuthUrlError(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyAuthUrl(): Promise<void> {
    if (oauthStart === null) return;

    setCopiedAuthUrl(false);
    setCopyAuthUrlError(null);

    const copied = await copyText(oauthStart.authUrl);
    if (copied) {
      setCopiedAuthUrl(true);
      return;
    }

    setCopyAuthUrlError(
      "We couldn't copy the link. Open the sign-in link and copy it from your browser's address bar.",
    );
  }

  async function handleSubmitCode(): Promise<void> {
    if (oauthStart === null) return;
    setBusy(true);
    try {
      await onSubmitCode({
        providerKey: provider.key,
        code: oauthCode,
        state: oauthStart.state,
      });
      setOauthCode("");
      setOauthStart(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    setBusy(true);
    try {
      await onDisconnect({ providerKey: provider.key });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={connected ? "outline" : "default"}
          disabled={disabled}
          aria-describedby={disabled ? disabledReasonId : undefined}
        >
          {connected ? (
            <ShieldCheck className="size-4" />
          ) : (
            <KeyRound className="size-4" />
          )}
          {connected ? "Manage" : "Connect"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider.label} connection</DialogTitle>
          <DialogDescription>
            Your sign-in details stay private on this computer. Linkgo only
            shows whether the connection works.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(connected || needsReconnect) && account !== null && (
            <div className="bg-muted/50 rounded-lg border p-3 text-sm">
              <p className="font-medium">{safeAccountLabel}</p>
              {signedIn && (
                <p className="text-muted-foreground mt-1">
                  Signed in with {provider.label} account
                  {renewing
                    ? " · access renews automatically the next time the AI assistant uses it"
                    : expiry !== null
                      ? ` · access renews before ${expiry}`
                      : ""}
                </p>
              )}
              {needsReconnect ? (
                <p className="text-destructive mt-1" role="status">
                  Reconnect needed: sign in again to keep using {provider.label}
                  .
                </p>
              ) : (
                <p className="text-muted-foreground mt-1">{maskedSecret}</p>
              )}
            </div>
          )}

          {offersBothMethods && (
            <div
              className="flex gap-2"
              role="group"
              aria-label="Connection method"
            >
              <Button
                type="button"
                size="sm"
                variant={method === "api_key" ? "default" : "outline"}
                aria-pressed={method === "api_key"}
                onClick={() => setMethod("api_key")}
              >
                API key
              </Button>
              <Button
                type="button"
                size="sm"
                variant={method === "oauth" ? "default" : "outline"}
                aria-pressed={method === "oauth"}
                onClick={() => setMethod("oauth")}
              >
                Account sign-in
              </Button>
            </div>
          )}

          {supportsApiKey && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={`${provider.key}-api-key`}>
                  {provider.secretLabel}
                </Label>
                <Input
                  id={`${provider.key}-api-key`}
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder="Paste your key once. Linkgo won't show it again."
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${provider.key}-base-url`}>
                  Web address{requiresBaseUrl ? " (required)" : ""}
                </Label>
                <Input
                  id={`${provider.key}-base-url`}
                  value={baseUrl}
                  required={requiresBaseUrl}
                  placeholder={
                    requiresBaseUrl
                      ? "Required, for example https://api.example.com/v1"
                      : "Optional — leave blank unless you know you need it"
                  }
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    setNativeRequiresConsent(false);
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  {requiresBaseUrl
                    ? "A custom AI service needs an OpenAI-compatible address."
                    : "Leave blank to use the AI service's usual address."}{" "}
                  Online services must use https://.
                </p>
                {showLocalConsent && (
                  <div className="flex items-start gap-2 rounded-md border p-2">
                    <input
                      id={`${provider.key}-allow-local`}
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={allowLocalDestination}
                      aria-describedby={`${provider.key}-allow-local-hint`}
                      onChange={(event) =>
                        setAllowLocalDestination(event.target.checked)
                      }
                    />
                    <div className="space-y-1">
                      <Label htmlFor={`${provider.key}-allow-local`}>
                        Allow this local/private endpoint (this computer or
                        network only)
                      </Label>
                      <p
                        id={`${provider.key}-allow-local-hint`}
                        className="text-muted-foreground text-xs"
                      >
                        Your key will be sent to this address. Plain http://
                        only works for addresses on this computer or network.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${provider.key}-label`}>Account label</Label>
                <Input
                  id={`${provider.key}-label`}
                  value={accountLabel}
                  maxLength={120}
                  placeholder="Optional"
                  onChange={(event) => setAccountLabel(event.target.value)}
                />
              </div>
              {confirmReplaceSignIn && (
                <p className="text-sm" role="alert">
                  Saving a key signs you out of your {provider.label} account.
                  Press <strong>Replace sign-in with API key</strong> to
                  continue.
                </p>
              )}
              <Button
                type="button"
                disabled={!canSaveApiKey}
                onClick={() => void handleSaveKey()}
              >
                {confirmReplaceSignIn
                  ? "Replace sign-in with API key"
                  : "Save API key"}
              </Button>
            </div>
          )}

          {supportsOAuth && aiProvider !== null && (
            <AiAccountSignIn
              providerKey={aiProvider}
              providerLabel={provider.label}
              account={account}
              progressEvent={progressEvent}
              busy={busy}
              onStart={onStartOAuth}
              onSubmitCode={onSubmitCode}
              onCancel={onCancelSignIn}
            />
          )}

          {supportsOAuth && aiProvider === null && (
            <div className="space-y-3">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void handleStartOAuth()}
              >
                Connect LinkedIn account
              </Button>
              {oauthStart !== null && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm" role="status">
                      {oauthStart.browserOpened
                        ? "Opened the sign-in page in your browser."
                        : "Couldn't open your browser. Copy the sign-in link instead."}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleCopyAuthUrl()}
                    >
                      <Copy className="size-3" />
                      {copiedAuthUrl ? "Copied" : "Copy sign-in link"}
                    </Button>
                  </div>
                  {copyAuthUrlError !== null && (
                    <p className="text-destructive text-sm" role="alert">
                      {copyAuthUrlError}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.key}-oauth-code`}>
                      Sign-in code
                    </Label>
                    <Textarea
                      id={`${provider.key}-oauth-code`}
                      value={oauthCode}
                      placeholder="Paste the code from LinkedIn"
                      onChange={(event) => setOauthCode(event.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={busy || oauthCode.trim() === ""}
                    onClick={() => void handleSubmitCode()}
                  >
                    Finish connecting
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void onCheck({ providerKey: provider.key })}
          >
            Check connection
          </Button>
          {account !== null && (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              <LogOut className="size-4" />{" "}
              {signedIn ? "Sign out" : "Disconnect"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
