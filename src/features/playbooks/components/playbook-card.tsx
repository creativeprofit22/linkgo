import { useEffect, useState } from "react";
import { BookOpen, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AgentRole } from "@/agent";
import type {
  AgentPlaybookView,
  UpdatePlaybookOverrideInput,
} from "@/features/playbooks/types";

const roleLabels: Record<AgentRole, string> = {
  researcher: "Researcher",
  scorer: "Scorer",
  drafter: "Drafter",
  auditor: "Auditor",
  scheduler: "Scheduler",
  analyst: "Analyst",
};

interface PlaybookCardProps {
  playbook: AgentPlaybookView;
  saving: boolean;
  onUpdate: (input: UpdatePlaybookOverrideInput) => Promise<void>;
}

export function PlaybookCard({
  playbook,
  saving,
  onUpdate,
}: PlaybookCardProps): React.ReactNode {
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
    <Card className="bg-card/70">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4" /> {playbook.label}
            </CardTitle>
            <p className="text-muted-foreground text-sm">{playbook.summary}</p>
          </div>
          <Badge variant={playbook.enabled ? "secondary" : "outline"}>
            {playbook.operatorGuidanceOnly
              ? "Guidance only"
              : playbook.enabled
                ? "Enabled"
                : "Disabled"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {playbook.compatibleRoles.length === 0 ? (
            <Badge variant="outline">No runtime role</Badge>
          ) : (
            playbook.compatibleRoles.map((role) => (
              <Badge key={role} variant="outline">
                {roleLabels[role]}
              </Badge>
            ))
          )}
          {playbook.toolNames.length === 0 ? (
            <Badge variant="outline">No tool contract</Badge>
          ) : (
            playbook.toolNames.map((toolName) => (
              <Badge key={toolName} variant="outline">
                {toolName}
              </Badge>
            ))
          )}
          <Badge variant="outline">
            Roadmap {playbook.roadmapSections.join(", ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-background/50 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Built-in instructions
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
                  Runtime enabled
                </Label>
                <p className="text-muted-foreground text-xs">
                  Disabled playbooks stay visible but are hidden from new agent
                  runs.
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
                Custom runtime instructions
              </Label>
              <Textarea
                id={`${playbook.key}-custom`}
                value={customInstructions}
                maxLength={2000}
                placeholder="Add operator-specific constraints for this playbook."
                onChange={(event) => setCustomInstructions(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {customInstructions.length}/2000 characters. Locked safety lines
                stay after custom text.
              </p>
            </div>
            <Button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save playbook"}
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-sm">
            <LockKeyhole className="mt-0.5 size-4" />
            <div>
              <p className="font-medium">Operator guidance only</p>
              <p className="text-muted-foreground mt-1">
                This commenter playbook is visible for human workflow guidance
                and is not connected to autonomous commenting or posting
                actions.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
