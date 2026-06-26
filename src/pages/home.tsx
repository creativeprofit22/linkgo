import {
  Activity,
  BarChart3,
  CheckCircle2,
  FileText,
  ListChecks,
  Target,
} from "lucide-react";
import { useState } from "react";
import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { useAppShortcuts } from "@/hooks/use-app-shortcuts";
import { cn } from "@/lib/utils";
import { ApprovalsView } from "@/features/approvals";
import { CampaignsView } from "@/features/campaigns/components/campaigns-view";
import { CandidateQueueView } from "@/features/candidate-queue";
import { DraftsView } from "@/features/drafts";

type HomeTab = "campaigns" | "queue" | "drafts" | "approvals" | "metrics";

type RoadmapTab = {
  id: HomeTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  docHref: string;
};

const tabs: RoadmapTab[] = [
  {
    id: "campaigns",
    label: "Campaigns",
    description: "Local campaign setup and autopilot intent.",
    icon: Target,
    enabled: true,
    docHref: "docs/features/campaigns.md",
  },
  {
    id: "queue",
    label: "Queue",
    description: "Candidate posts, dedupe, and relevance triage.",
    icon: ListChecks,
    enabled: true,
    docHref: "docs/features/candidate-queue.md",
  },
  {
    id: "drafts",
    label: "Drafts",
    description: "Manual draft variants and deterministic audit checks.",
    icon: FileText,
    enabled: true,
    docHref: "docs/features/drafts.md",
  },
  {
    id: "approvals",
    label: "Approvals",
    description: "Human review, scheduling, and publish attempt tracking.",
    icon: CheckCircle2,
    enabled: true,
    docHref: "docs/features/approvals.md",
  },
  {
    id: "metrics",
    label: "Metrics",
    description: "Learning loops wait for published-post data.",
    icon: BarChart3,
    enabled: false,
    docHref: "docs/ROADMAP_MAPPING.md#metrics--learning-slice",
  },
];

function getActiveRoadmapTab(activeTab: HomeTab): RoadmapTab {
  const tab = tabs.find((candidate) => candidate.id === activeTab);
  if (tab) return tab;
  throw new Error(`Unknown Linkgo tab: ${activeTab}`);
}

export function HomePage(): React.ReactNode {
  const [activeTab, setActiveTab] = useState<HomeTab>("campaigns");
  useAppShortcuts();

  const activeRoadmapTab = getActiveRoadmapTab(activeTab);

  return (
    <WindowFrame
      titleBar={<MainTitleBar />}
      contentClassName="flex overflow-hidden"
    >
      <div className="flex h-full w-full overflow-hidden">
        <aside className="border-border/70 bg-background/55 flex w-72 shrink-0 flex-col border-r p-4 backdrop-blur">
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="text-linkgo-blue size-5" />
              <h1 className="text-lg font-semibold">Linkgo</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              LinkedIn growth operations, built local-first and approval-gated.
            </p>
          </div>

          <nav className="space-y-2" aria-label="Linkgo sections">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-linkgo-blue/50 bg-linkgo-blue/10 text-foreground"
                      : "hover:bg-accent/60 border-transparent",
                    !tab.enabled && "opacity-70",
                  )}
                >
                  <Icon className="mt-0.5 size-4" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {tab.label}
                      {!tab.enabled && <Badge variant="outline">Roadmap</Badge>}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                      {tab.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 overflow-auto p-6">
          {activeRoadmapTab.id === "campaigns" ? (
            <CampaignsView />
          ) : activeRoadmapTab.id === "queue" ? (
            <CandidateQueueView />
          ) : activeRoadmapTab.id === "drafts" ? (
            <DraftsView />
          ) : activeRoadmapTab.id === "approvals" ? (
            <ApprovalsView />
          ) : (
            <RoadmapPlaceholder tab={activeRoadmapTab} />
          )}
        </section>
      </div>
      <Toaster />
    </WindowFrame>
  );
}

function RoadmapPlaceholder({ tab }: { tab: RoadmapTab }): React.ReactNode {
  const Icon = tab.icon;

  return (
    <Card className="linkgo-card bg-card/75 mx-auto mt-10 max-w-2xl border-dashed">
      <CardHeader>
        <div className="bg-linkgo-blue/10 text-linkgo-blue mb-3 flex size-12 items-center justify-center rounded-xl">
          <Icon className="size-6" />
        </div>
        <CardTitle>{tab.label} is queued on the roadmap</CardTitle>
        <CardDescription>{tab.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          This section renders intentionally as a disabled placeholder so Linkgo
          stays runnable after each feature slice.
        </p>
        <Button asChild variant="outline">
          <a href={tab.docHref}>Read roadmap mapping</a>
        </Button>
      </CardContent>
    </Card>
  );
}
