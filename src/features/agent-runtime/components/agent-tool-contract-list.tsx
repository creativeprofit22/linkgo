import { ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentToolMetadata } from "@/agent";

const stepLabels: Record<string, string> = {
  research: "Find ideas",
  score: "Score ideas",
  draft: "Write drafts",
  audit: "Check drafts",
  approve: "Approve",
  schedule: "Schedule",
  measure: "Check results",
};

export function AgentToolContractList({
  toolContracts,
}: {
  toolContracts: AgentToolMetadata[];
}): React.ReactNode {
  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wrench className="text-linkgo-blue size-5" /> What the AI assistant
          can do
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          These are the actions the AI assistant can take. Your brand voice
          guides shape how it writes, but they can never let it post or comment
          on its own.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {toolContracts.map((tool) => (
            <div key={tool.name} className="bg-muted/20 rounded-xl border p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{tool.label}</h3>
                <Badge variant="outline">{tool.name}</Badge>
                {tool.requiresApproval && (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="size-3" /> Approval required
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                {tool.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tool.stepKeys.map((stepKey) => (
                  <Badge key={stepKey} variant="outline">
                    {stepLabels[stepKey] ?? stepKey}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
