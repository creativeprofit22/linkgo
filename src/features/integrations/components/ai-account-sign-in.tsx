import { useEffect, useId, useRef, useState } from "react";
import { Copy, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  AiAccountSignInProvider,
  AuthProgressEvent,
  ConnectedAccount,
  OAuthStartResult,
} from "@/features/integrations/types";

const TERMS_WARNING: Record<AiAccountSignInProvider, string> = {
  openai:
    "OpenAI has no approved sign-in for third-party apps. Linkgo reuses the Codex CLI sign-in, uses your ChatGPT plan's limits, and OpenAI may restrict it or your account at any time.",
  anthropic:
    "Anthropic's terms say Claude plan sign-in is only for Claude Code and Claude.ai. Using it here breaks those terms, may be refused, and can put your Claude account at risk. Personal use only.",
};

const PASTE_HINT: Record<AiAccountSignInProvider, string> = {
  openai:
    "If the browser cannot reach Linkgo, paste the full address of the page it lands on.",
  anthropic:
    "Paste the code shown by Anthropic after you approve (code#state).",
};

interface AiAccountSignInProps {
  providerKey: AiAccountSignInProvider;
  providerLabel: string;
  account: ConnectedAccount | null;
  /** Latest native progress event for this provider, if any. */
  progressEvent: AuthProgressEvent | null;
  busy: boolean;
  onStart: (input: {
    providerKey: AiAccountSignInProvider;
    acknowledgeTermsRisk: boolean;
  }) => Promise<OAuthStartResult>;
  onSubmitCode: (input: {
    providerKey: AiAccountSignInProvider;
    code: string;
    state: string;
  }) => Promise<void>;
  onCancel: (input: { providerKey: AiAccountSignInProvider }) => Promise<void>;
}

export function AiAccountSignIn({
  providerKey,
  providerLabel,
  account,
  progressEvent,
  busy,
  onStart,
  onSubmitCode,
  onCancel,
}: AiAccountSignInProps): React.ReactNode {
  const ids = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [start, setStart] = useState<OAuthStartResult | null>(null);
  const [pasted, setPasted] = useState("");
  const [working, setWorking] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const replacesApiKey = account !== null && account.auth_method === "api_key";
  const waitingForBrowser = start !== null && !start.needsCode;
  const disabled = busy || working;

  // Closing the dialog unmounts this component; a pending flow must still be
  // cancelled natively so the loopback listener releases its port.
  const pendingRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    pendingRef.current = start !== null;
    onCancelRef.current = onCancel;
  }, [start, onCancel]);
  useEffect(
    () => () => {
      if (!pendingRef.current) return;
      onCancelRef.current({ providerKey }).catch(() => {
        // Best effort on unmount; the hook already reports the error.
      });
    },
    [providerKey],
  );

  // Loopback completion or failure arrives as a native progress event.
  useEffect(() => {
    if (progressEvent === null || start === null) return;
    if (progressEvent.status === "auth_done") {
      setStart(null);
      setPasted("");
      setAcknowledged(false);
      setFlowError(null);
    } else if (progressEvent.status === "auth_error") {
      setFlowError(progressEvent.summary);
    }
  }, [progressEvent, start]);

  async function handleStart(): Promise<void> {
    if (replacesApiKey && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setWorking(true);
    setFlowError(null);
    try {
      setCopyState("idle");
      setStart(
        await onStart({ providerKey, acknowledgeTermsRisk: acknowledged }),
      );
      setConfirmReplace(false);
    } catch {
      // The hook already reports the error.
    } finally {
      setWorking(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    if (start === null) return;
    setWorking(true);
    try {
      await onSubmitCode({ providerKey, code: pasted, state: start.state });
      setStart(null);
      setPasted("");
      setAcknowledged(false);
      setFlowError(null);
    } catch {
      // The hook already reports the error; keep the field for a retry.
    } finally {
      setWorking(false);
    }
  }

  // The embedded WebView cannot open external links itself; native code opens
  // the browser on Start, and this copy is the fallback.
  async function handleCopyLink(): Promise<void> {
    if (start === null) return;
    try {
      await navigator.clipboard.writeText(start.authUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function handleCancel(): Promise<void> {
    setWorking(true);
    try {
      await onCancel({ providerKey });
    } catch {
      // Reported by the hook.
    } finally {
      setStart(null);
      setPasted("");
      setFlowError(null);
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div
        className="border-destructive/40 bg-destructive/5 flex gap-2 rounded-md border p-2 text-sm"
        id={`${ids}-warning`}
      >
        <TriangleAlert
          className="text-destructive mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <p>{TERMS_WARNING[providerKey]}</p>
      </div>

      {start === null && (
        <>
          <div className="flex items-start gap-2">
            <input
              id={`${ids}-ack`}
              type="checkbox"
              className="mt-0.5 size-4"
              checked={acknowledged}
              aria-describedby={`${ids}-warning`}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <Label htmlFor={`${ids}-ack`} className="leading-snug">
              I understand the risk to my {providerLabel} account and will use
              this for personal use only
            </Label>
          </div>
          {confirmReplace && (
            <p className="text-sm" role="alert">
              Signing in replaces the saved {providerLabel} API key. Press{" "}
              <strong>Replace API key and sign in</strong> to continue.
            </p>
          )}
          <Button
            type="button"
            disabled={disabled || !acknowledged}
            onClick={() => void handleStart()}
          >
            {confirmReplace
              ? "Replace API key and sign in"
              : `Sign in with ${providerLabel} account`}
          </Button>
        </>
      )}

      {start !== null && (
        <div className="space-y-3">
          <p className="text-sm" role="status">
            {start.browserOpened
              ? `Opened the ${providerLabel} sign-in page in your browser. If you don't see it, copy the link and paste it into your browser.`
              : `Couldn't open your browser. Copy the link and paste it into your browser to sign in.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleCopyLink()}
            >
              <Copy className="size-3" aria-hidden="true" />
              {copyState === "copied" ? "Copied" : "Copy sign-in link"}
            </Button>
            {copyState === "failed" && (
              <p className="text-destructive text-sm" role="alert">
                Could not copy automatically.
              </p>
            )}
          </div>
          {waitingForBrowser && (
            <p
              className="text-muted-foreground flex items-center gap-2 text-sm"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Waiting for the browser to finish sign-in…
            </p>
          )}
          {flowError !== null && (
            <p className="text-destructive text-sm" role="alert">
              {flowError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${ids}-code`}>
              {waitingForBrowser
                ? "Or paste the callback address"
                : "Sign-in code"}
            </Label>
            <Textarea
              id={`${ids}-code`}
              value={pasted}
              autoComplete="off"
              aria-describedby={`${ids}-code-hint`}
              onChange={(event) => setPasted(event.target.value)}
            />
            <p
              id={`${ids}-code-hint`}
              className="text-muted-foreground text-xs"
            >
              {PASTE_HINT[providerKey]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={disabled || pasted.trim() === ""}
              onClick={() => void handleSubmit()}
            >
              Finish sign-in
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => void handleCancel()}
            >
              Cancel sign-in
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
