import { useEffect, useRef, useState } from "react";
import { BookOpen, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AgentRole } from "@/agent";
import { getAssistantActionLabel } from "@/lib/assistant-action-labels";
import type {
  AgentPlaybookView,
  UpdatePlaybookOverrideInput,
} from "@/features/playbooks/types";

const roleLabels: Record<AgentRole, string> = {
  researcher: "Find ideas",
  scorer: "Score ideas",
  drafter: "Write drafts",
  auditor: "Check drafts",
  scheduler: "Plan schedule",
  analyst: "Review results",
};

interface PlaybookCardProps {
  playbook: AgentPlaybookView;
  saving: boolean;
  onUpdate: (input: UpdatePlaybookOverrideInput) => Promise<void>;
  /**
   * Scrolls to this guide once, then focuses "Your own instructions" when the
   * guide has that field, otherwise the guide's heading.
   */
  focusInstructions?: boolean;
}

export function PlaybookCard({
  playbook,
  saving,
  onUpdate,
  focusInstructions = false,
}: PlaybookCardProps): React.ReactNode {
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusInstructions) return;
    cardRef.current?.scrollIntoView({ block: "center" });
    const target = instructionsRef.current ?? headingRef.current;
    target?.focus({ preventScroll: true });
  }, [focusInstructions]);
  const [enabled, setEnabled] = useState(playbook.enabled);
  const [customInstructions, setCustomInstructions] = useState(
    playbook.customInstructions,
  );

  useEffect(() => {
    setEnabled(playbook.enabled);
    setCustomInstructions(playbook.customInstructions);
  }, [playbook.customInstructions, playbook.enabled]);

  const runtimeEditable =
    playbook.runtimeEnabled && !playbook.operatorGuidanceOnly;
  const dirty =
    enabled !== playbook.enabled ||
    customInstructions.trim() !== playbook.customInstructions;

  async function handleSave(): Promise<void> {
    if (!runtimeEditable) return;
    await onUpdate({
      playbookKey: playbook.key,
      enabled,
      customInstructions: customInstructions.trim(),
    });
  }

  return (
    <Card ref={cardRef} className="bg-card/70">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle
              ref={headingRef}
              tabIndex={-1}
              className="flex items-center gap-2 text-base"
            >
              <BookOpen className="size-4" /> {playbook.label}
            </CardTitle>
            <p className="text-muted-foreground text-sm">{playbook.summary}</p>
          </div>
          <Badge variant={playbook.enabled ? "secondary" : "outline"}>
            {playbook.operatorGuidanceOnly
              ? "Tips only"
              : playbook.enabled
                ? "On"
                : "Off"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {playbook.compatibleRoles.length === 0 ? (
            <Badge variant="outline">Not used by the AI assistant</Badge>
          ) : (
            playbook.compatibleRoles.map((role) => (
              <Badge key={role} variant="outline">
                {roleLabels[role]}
              </Badge>
            ))
          )}
          {playbook.toolNames.length === 0 ? (
            <Badge variant="outline">No assistant actions</Badge>
          ) : (
            playbook.toolNames.map((toolName) => (
              <Badge key={toolName} variant="outline">
                {getAssistantActionLabel(toolName)}
              </Badge>
            ))
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-background/50 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Built-in writing tips
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
            {playbook.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ul>
        </div>

        {runtimeEditable ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor={`${playbook.key}-enabled`}>
                  Use with the AI assistant
                </Label>
                <p className="text-muted-foreground text-xs">
                  When this is off, the guide stays here but isn't used for new
                  assistant tasks.
                </p>
              </div>
              <Switch
                id={`${playbook.key}-enabled`}
                checked={enabled}
                disabled={saving}
                onCheckedChange={setEnabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${playbook.key}-custom`}>
                Your own instructions
              </Label>
              <Textarea
                ref={instructionsRef}
                id={`${playbook.key}-custom`}
                value={customInstructions}
                maxLength={2000}
                placeholder="Add your own rules for this guide."
                onChange={(event) => setCustomInstructions(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {customInstructions.length} of 2000 characters. Our built-in
                safety rules always stay in place after your text.
              </p>
            </div>
            <Button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save guide"}
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-sm">
            <LockKeyhole className="mt-0.5 size-4" />
            <div>
              <p className="font-medium">Tips for you only</p>
              <p className="text-muted-foreground mt-1">
                These commenting tips are here to guide you. The AI assistant
                can't use them to comment or post on its own.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
