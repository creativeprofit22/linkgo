import { useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  KeyRound,
  LogOut,
  ShieldCheck,
} from "lucide-react";
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
import type {
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
  }) => Promise<OAuthStartResult>;
  onSubmitCode: (input: {
    providerKey: AuthProviderKey;
    code: string;
    state: string;
  }) => Promise<void>;
  onDisconnect: (input: { providerKey: AuthProviderKey }) => Promise<void>;
  onCheck: (input: { providerKey: AuthProviderKey }) => Promise<void>;
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

export function ProviderLoginDialog({
  provider,
  account,
  onSaveKey,
  onStartOAuth,
  onSubmitCode,
  onDisconnect,
  onCheck,
}: ProviderLoginDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [oauthStart, setOauthStart] = useState<OAuthStartResult | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [copiedAuthUrl, setCopiedAuthUrl] = useState(false);
  const [copyAuthUrlError, setCopyAuthUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connected = account?.status === "connected";
  const supportsApiKey = provider.methods.includes("api_key");
  const supportsOAuth = provider.methods.includes("oauth");
  const requiresBaseUrl = provider.key === "custom";
  const canSaveApiKey =
    !busy &&
    apiKey.trim().length >= 8 &&
    (!requiresBaseUrl || baseUrl.trim() !== "");
  const safeAccountLabel = account?.account_label || account?.provider_label;
  const maskedSecret = useMemo(
    () => (connected ? "Connected; secret is stored outside the UI." : ""),
    [connected],
  );

  async function handleSaveKey(): Promise<void> {
    setBusy(true);
    try {
      await onSaveKey({
        providerKey: provider.key,
        apiKey,
        baseUrl: baseUrl.trim() || undefined,
        accountLabel: accountLabel.trim() || undefined,
      });
      setApiKey("");
      setBaseUrl("");
      setAccountLabel("");
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
      "Could not copy automatically. Open the authorization URL and copy it from your browser address bar.",
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
        <Button type="button" variant={connected ? "outline" : "default"}>
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
            Secrets stay in the native Tauri boundary. Linkgo only shows status
            and health.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {connected && (
            <div className="bg-muted/50 rounded-lg border p-3 text-sm">
              <p className="font-medium">{safeAccountLabel}</p>
              <p className="text-muted-foreground mt-1">{maskedSecret}</p>
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
                  placeholder="Paste key once; Linkgo will not render it again"
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${provider.key}-base-url`}>
                  Base URL override{requiresBaseUrl ? " (required)" : ""}
                </Label>
                <Input
                  id={`${provider.key}-base-url`}
                  value={baseUrl}
                  required={requiresBaseUrl}
                  placeholder={
                    requiresBaseUrl
                      ? "Required, e.g. https://api.example.com/v1"
                      : "Optional advanced override"
                  }
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {requiresBaseUrl
                    ? "Custom API providers need an OpenAI-compatible endpoint."
                    : "GG AI uses provider defaults unless you set this."}
                </p>
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
              <Button
                type="button"
                disabled={!canSaveApiKey}
                onClick={() => void handleSaveKey()}
              >
                Save API key
              </Button>
            </div>
          )}

          {supportsOAuth && (
            <div className="space-y-3">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void handleStartOAuth()}
              >
                Continue with OAuth
              </Button>
              {oauthStart !== null && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={oauthStart.authUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-linkgo-blue inline-flex items-center gap-2 text-sm font-medium"
                    >
                      Open authorization URL <ExternalLink className="size-3" />
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleCopyAuthUrl()}
                    >
                      <Copy className="size-3" />
                      {copiedAuthUrl ? "Copied" : "Copy authorization URL"}
                    </Button>
                  </div>
                  {copyAuthUrlError !== null && (
                    <p className="text-destructive text-sm" role="alert">
                      {copyAuthUrlError}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`${provider.key}-oauth-code`}>
                      Authorization code
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
                    Submit code
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
            Check health
          </Button>
          {account !== null && (
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              <LogOut className="size-4" /> Disconnect
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
