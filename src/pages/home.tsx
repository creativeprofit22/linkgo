import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  KeyRound,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  MessageCircle,
  NotebookTabs,
  ShieldAlert,
  Target,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { useAppShortcuts } from "@/hooks/use-app-shortcuts";
import { cn } from "@/lib/utils";

const AgentRuntimeView = lazy(() =>
  import("@/features/agent-runtime").then(({ AgentRuntimeView }) => ({
    default: AgentRuntimeView,
  })),
);
const ApprovalsView = lazy(() =>
  import("@/features/approvals").then(({ ApprovalsView }) => ({
    default: ApprovalsView,
  })),
);
const CampaignsView = lazy(() =>
  import("@/features/campaigns/components/campaigns-view").then(
    ({ CampaignsView }) => ({ default: CampaignsView }),
  ),
);
const CandidateQueueView = lazy(() =>
  import("@/features/candidate-queue").then(({ CandidateQueueView }) => ({
    default: CandidateQueueView,
  })),
);
const CommentsView = lazy(() =>
  import("@/features/comments").then(({ CommentsView }) => ({
    default: CommentsView,
  })),
);
const ContentCalendarView = lazy(() =>
  import("@/features/content-calendar").then(({ ContentCalendarView }) => ({
    default: ContentCalendarView,
  })),
);
const DraftsView = lazy(() =>
  import("@/features/drafts").then(({ DraftsView }) => ({
    default: DraftsView,
  })),
);
const IntegrationsView = lazy(() =>
  import("@/features/integrations").then(({ IntegrationsView }) => ({
    default: IntegrationsView,
  })),
);
const MetricsView = lazy(() =>
  import("@/features/metrics").then(({ MetricsView }) => ({
    default: MetricsView,
  })),
);
const PlaybooksView = lazy(() =>
  import("@/features/playbooks").then(({ PlaybooksView }) => ({
    default: PlaybooksView,
  })),
);
const SafetyView = lazy(() =>
  import("@/features/safety").then(({ SafetyView }) => ({
    default: SafetyView,
  })),
);
const SchedulerView = lazy(() =>
  import("@/features/scheduler").then(({ SchedulerView }) => ({
    default: SchedulerView,
  })),
);
const WorkflowsView = lazy(() =>
  import("@/features/workflows").then(({ WorkflowsView }) => ({
    default: WorkflowsView,
  })),
);

const featureViewFallback = (
  <div className="text-muted-foreground py-8 text-sm" role="status">
    Loading section...
  </div>
);

if (import.meta.env.VITE_PLAYWRIGHT) {
  void import("@/features/integrations/data");
}

type HomeTab =
  | "campaigns"
  | "queue"
  | "drafts"
  | "approvals"
  | "calendar"
  | "scheduler"
  | "comments"
  | "metrics"
  | "workflows"
  | "agents"
  | "playbooks"
  | "integrations"
  | "safety";

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
    id: "calendar",
    label: "Calendar",
    description: "Post planning before scheduler execution.",
    icon: CalendarDays,
    enabled: true,
    docHref: "docs/features/content-calendar.md",
  },
  {
    id: "scheduler",
    label: "Scheduler",
    description: "Opt-in due post publishing while Linkgo is running.",
    icon: Clock3,
    enabled: true,
    docHref: "docs/features/scheduler.md",
  },
  {
    id: "comments",
    label: "Comments",
    description: "Approval-gated local reply drafting and history.",
    icon: MessageCircle,
    enabled: true,
    docHref: "docs/features/comments.md",
  },
  {
    id: "metrics",
    label: "Metrics",
    description: "Manual post metrics, campaign memory, and learning events.",
    icon: BarChart3,
    enabled: true,
    docHref: "docs/features/metrics.md",
  },
  {
    id: "workflows",
    label: "Workflows",
    description: "Resumable pipeline runs and progress events.",
    icon: Workflow,
    enabled: true,
    docHref: "docs/features/workflows.md",
  },
  {
    id: "agents",
    label: "Agent Runtime",
    description: "Typed local tool loop and dry-run provider.",
    icon: Bot,
    enabled: true,
    docHref: "docs/features/agent-runtime.md",
  },
  {
    id: "playbooks",
    label: "Playbooks",
    description: "Reusable LinkedIn prompt modules and operator guidance.",
    icon: NotebookTabs,
    enabled: true,
    docHref: "docs/features/playbooks.md",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "AI credentials and LinkedIn OAuth foundation.",
    icon: KeyRound,
    enabled: true,
    docHref: "docs/features/integrations.md",
  },
  {
    id: "safety",
    label: "Safety",
    description: "Kill switch, rate limits, and error queue.",
    icon: ShieldAlert,
    enabled: true,
    docHref: "docs/features/safety-observability.md",
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
          <Suspense fallback={featureViewFallback}>
            {activeRoadmapTab.id === "campaigns" ? (
              <CampaignsView />
            ) : activeRoadmapTab.id === "queue" ? (
              <CandidateQueueView />
            ) : activeRoadmapTab.id === "drafts" ? (
              <DraftsView />
            ) : activeRoadmapTab.id === "approvals" ? (
              <ApprovalsView />
            ) : activeRoadmapTab.id === "calendar" ? (
              <ContentCalendarView />
            ) : activeRoadmapTab.id === "scheduler" ? (
              <SchedulerView />
            ) : activeRoadmapTab.id === "comments" ? (
              <CommentsView />
            ) : activeRoadmapTab.id === "metrics" ? (
              <MetricsView />
            ) : activeRoadmapTab.id === "workflows" ? (
              <WorkflowsView />
            ) : activeRoadmapTab.id === "agents" ? (
              <AgentRuntimeView />
            ) : activeRoadmapTab.id === "playbooks" ? (
              <PlaybooksView />
            ) : activeRoadmapTab.id === "integrations" ? (
              <IntegrationsView />
            ) : (
              <SafetyView />
            )}
          </Suspense>
        </section>
      </div>
      <Toaster />
    </WindowFrame>
  );
}
