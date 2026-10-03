import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  KeyRound,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Info,
  ListChecks,
  MessageCircle,
  NotebookTabs,
  Route,
  ShieldAlert,
  Target,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { agentRuntimeRoute } from "@/features/agent-runtime/schemas";
import { approvalsRoute } from "@/features/approvals/schemas";
import { autopilotPlannerRoute } from "@/features/autopilot-planner/schemas";
import { campaignBacklogRoute } from "@/features/campaign-backlog/schemas";
import { campaignsRoute } from "@/features/campaigns/schemas";
import { candidateQueueRoute } from "@/features/candidate-queue/schemas";
import { commentsRoute } from "@/features/comments/schemas";
import { contentCalendarRoute } from "@/features/content-calendar/schemas";
import { draftsRoute } from "@/features/drafts/schemas";
import { integrationsRoute } from "@/features/integrations/schemas";
import { metricsRoute } from "@/features/metrics/schemas";
import { playbooksRoute } from "@/features/playbooks/schemas";
import { safetyRoute } from "@/features/safety/schemas";
import { schedulerRoute } from "@/features/scheduler/schemas";
import {
  SetupEmptyCampaigns,
  SetupLauncher,
  SetupView,
} from "@/features/setup";
import { setupRoute } from "@/features/setup/schemas";
import { workflowsRoute } from "@/features/workflows/schemas";
import { useAppShortcuts } from "@/hooks/use-app-shortcuts";
import {
  parseRouteHash,
  splitRouteHash,
  type RouteDefinition,
} from "@/lib/navigation/route-contract";
import {
  navigateTo,
  readLastScreen,
  useHashLocation,
  writeLastScreen,
} from "@/lib/navigation/use-hash-navigation";
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
const AutopilotPlannerView = lazy(() =>
  import("@/features/autopilot-planner").then(({ AutopilotPlannerView }) => ({
    default: AutopilotPlannerView,
  })),
);
const CampaignBacklogView = lazy(() =>
  import("@/features/campaign-backlog").then(({ CampaignBacklogView }) => ({
    default: CampaignBacklogView,
  })),
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
    Loading…
  </div>
);

if (import.meta.env.VITE_PLAYWRIGHT) {
  void import("@/features/integrations/data");
}

/** Every main-window screen, in menu order. Each feature owns its route. */
const homeRoutes = [
  campaignsRoute,
  autopilotPlannerRoute,
  campaignBacklogRoute,
  candidateQueueRoute,
  draftsRoute,
  approvalsRoute,
  contentCalendarRoute,
  schedulerRoute,
  commentsRoute,
  metricsRoute,
  workflowsRoute,
  agentRuntimeRoute,
  playbooksRoute,
  integrationsRoute,
  safetyRoute,
  setupRoute,
] as const;

type HomeTab = (typeof homeRoutes)[number]["id"];
/** Any main-window screen, with its params widened for list handling. */
type HomeRoute = RouteDefinition<HomeTab>;

const homeRouteIds: readonly HomeTab[] = homeRoutes.map((route) => route.id);
const defaultHomeRoute = campaignsRoute;

type RoadmapTab = {
  route: HomeRoute;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  docHref: string;
};

const tabs: RoadmapTab[] = [
  {
    route: campaignsRoute,
    label: "Campaigns",
    description: "Group your posts by goal and audience.",
    icon: Target,
    enabled: true,
    docHref: "docs/features/campaigns.md",
  },
  {
    route: autopilotPlannerRoute,
    label: "Autopilot",
    description: "Let Linkgo suggest what to work on next.",
    icon: Route,
    enabled: true,
    docHref: "docs/features/autopilot-planner.md",
  },
  {
    route: campaignBacklogRoute,
    label: "Tasks",
    description: "What’s due, who owns it, and repeating tasks.",
    icon: ClipboardList,
    enabled: true,
    docHref: "docs/features/campaign-backlog.md",
  },
  {
    route: candidateQueueRoute,
    label: "Ideas",
    description: "Posts and topics worth writing about or replying to.",
    icon: ListChecks,
    enabled: true,
    docHref: "docs/features/candidate-queue.md",
  },
  {
    route: draftsRoute,
    label: "Drafts",
    description: "Write and compare post versions, with quality checks.",
    icon: FileText,
    enabled: true,
    docHref: "docs/features/drafts.md",
  },
  {
    route: approvalsRoute,
    label: "Approvals",
    description: "Review posts before anything goes live.",
    icon: CheckCircle2,
    enabled: true,
    docHref: "docs/features/approvals.md",
  },
  {
    route: contentCalendarRoute,
    label: "Calendar",
    description: "Plan when each post goes out.",
    icon: CalendarDays,
    enabled: true,
    docHref: "docs/features/content-calendar.md",
  },
  {
    route: schedulerRoute,
    label: "Auto-posting",
    description: "Approved posts go out on time while Linkgo is open.",
    icon: Clock3,
    enabled: true,
    docHref: "docs/features/scheduler.md",
  },
  {
    route: commentsRoute,
    label: "Comments",
    description: "Draft replies and approve them before they post.",
    icon: MessageCircle,
    enabled: true,
    docHref: "docs/features/comments.md",
  },
  {
    route: metricsRoute,
    label: "Analytics",
    description: "See how posts perform and what you’ve learned.",
    icon: BarChart3,
    enabled: true,
    docHref: "docs/features/metrics.md",
  },
  {
    route: workflowsRoute,
    label: "Automations",
    description: "Follow the steps of automated tasks.",
    icon: Workflow,
    enabled: true,
    docHref: "docs/features/workflows.md",
  },
  {
    route: agentRuntimeRoute,
    label: "AI assistant",
    description: "See what the AI assistant did, and try it safely.",
    icon: Bot,
    enabled: true,
    docHref: "docs/features/agent-runtime.md",
  },
  {
    route: playbooksRoute,
    label: "Brand voice",
    description: "Writing guides that shape how the AI writes for you.",
    icon: NotebookTabs,
    enabled: true,
    docHref: "docs/features/playbooks.md",
  },
  {
    route: integrationsRoute,
    label: "Connected accounts",
    description: "Connect LinkedIn and your AI account.",
    icon: KeyRound,
    enabled: true,
    docHref: "docs/features/integrations.md",
  },
  {
    route: safetyRoute,
    label: "Safety",
    description:
      "Emergency stop, daily limits, and anything that needs fixing.",
    icon: ShieldAlert,
    enabled: true,
    docHref: "docs/features/safety-observability.md",
  },
];

/** Get started screen: reachable from the setup launcher, not the Main menu. */
const setupTab: RoadmapTab = {
  route: setupRoute,
  label: "Get started",
  description: "Set up Linkgo in four short steps.",
  icon: Activity,
  enabled: true,
  docHref: "docs/features/setup.md",
};

function getActiveRoadmapTab(activeTab: HomeTab): RoadmapTab {
  const tab = [...tabs, setupTab].find(
    (candidate) => candidate.route.id === activeTab,
  );
  if (tab) return tab;
  throw new Error(`Unknown Linkgo tab: ${activeTab}`);
}

type HomeLocation =
  | { kind: "empty"; routeId: HomeTab }
  | { kind: "ok" | "invalid-params" | "unknown-screen"; routeId: HomeTab };

/** Which screen the current link shows; an empty link restores the last one. */
function resolveHomeLocation(hash: string): HomeLocation {
  if (splitRouteHash(hash).id === "") {
    return {
      kind: "empty",
      routeId: readLastScreen(homeRouteIds) ?? defaultHomeRoute.id,
    };
  }
  const parsed = parseRouteHash(hash, homeRoutes, defaultHomeRoute.id);
  return { kind: parsed.kind, routeId: parsed.routeId };
}

function getHomeRoute(id: HomeTab): HomeRoute {
  return homeRoutes.find((route) => route.id === id) ?? defaultHomeRoute;
}

export function HomePage(): React.ReactNode {
  const hash = useHashLocation();
  const homeLocation = resolveHomeLocation(hash);
  const activeTab = homeLocation.routeId;
  useAppShortcuts();

  useEffect(() => {
    if (homeLocation.kind === "empty") {
      // Give the restored screen an address without adding a history entry.
      navigateTo(getHomeRoute(homeLocation.routeId), undefined, {
        replace: true,
      });
    } else if (homeLocation.kind !== "unknown-screen") {
      writeLastScreen(homeLocation.routeId);
    }
  }, [homeLocation.kind, homeLocation.routeId]);

  const activeRoadmapTab = getActiveRoadmapTab(activeTab);

  return (
    <WindowFrame
      titleBar={<MainTitleBar />}
      contentClassName="flex overflow-hidden"
    >
      <div className="flex h-full w-full flex-col overflow-hidden sm:flex-row">
        <aside className="border-border/70 bg-background/55 flex w-full shrink-0 flex-col border-b p-2 backdrop-blur sm:min-h-0 sm:w-72 sm:border-r sm:border-b-0 sm:p-4">
          <div className="mb-2 shrink-0 space-y-2 sm:mb-6">
            <div className="flex items-center gap-2">
              <Activity className="text-linkgo-blue size-5" />
              <h1 className="text-lg font-semibold">Linkgo</h1>
            </div>
            <p className="text-muted-foreground hidden text-sm sm:block">
              Plan, write and share LinkedIn posts. Nothing goes live without
              your OK.
            </p>
          </div>

          <div className="mb-2 shrink-0 sm:mb-3 [&:empty]:hidden">
            <SetupLauncher active={activeTab === setupRoute.id} />
          </div>

          <nav
            className="flex gap-2 overflow-x-auto pb-1 sm:-mr-2 sm:block sm:min-h-0 sm:flex-1 sm:space-y-2 sm:overflow-x-hidden sm:overflow-y-auto sm:pr-2 sm:pb-0"
            aria-label="Main menu"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.route.id;
              return (
                <button
                  key={tab.route.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => navigateTo(tab.route)}
                  className={cn(
                    "flex w-auto shrink-0 items-center gap-2 rounded-xl border p-2 text-left transition-colors sm:w-full sm:items-start sm:gap-3 sm:p-3",
                    selected
                      ? "border-linkgo-blue/50 bg-linkgo-blue/10 text-foreground"
                      : "hover:bg-accent/60 border-transparent",
                    !tab.enabled && "opacity-70",
                  )}
                >
                  <Icon className="size-4 sm:mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {tab.label}
                      {!tab.enabled && <Badge variant="outline">Roadmap</Badge>}
                    </span>
                    <span className="text-muted-foreground mt-1 hidden text-xs leading-relaxed sm:block">
                      {tab.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 overflow-auto p-3 sm:p-6">
          {homeLocation.kind === "unknown-screen" && (
            <p
              role="status"
              data-testid="navigation-unknown-screen"
              className="bg-muted/50 text-muted-foreground mx-auto mb-4 flex max-w-6xl items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <Info aria-hidden="true" className="size-4 shrink-0" />
              <span>
                That link didn&rsquo;t match a screen, so we opened{" "}
                {activeRoadmapTab.label}.
              </span>
            </p>
          )}
          <Suspense fallback={featureViewFallback}>
            {activeRoadmapTab.route.id === "campaigns" ? (
              <CampaignsView
                renderEmpty={(defaultEmpty) => (
                  <SetupEmptyCampaigns fallback={defaultEmpty} />
                )}
              />
            ) : activeRoadmapTab.route.id === "setup" ? (
              <SetupView />
            ) : activeRoadmapTab.route.id === "autopilot" ? (
              <AutopilotPlannerView />
            ) : activeRoadmapTab.route.id === "backlog" ? (
              <CampaignBacklogView />
            ) : activeRoadmapTab.route.id === "queue" ? (
              <CandidateQueueView />
            ) : activeRoadmapTab.route.id === "drafts" ? (
              <DraftsView />
            ) : activeRoadmapTab.route.id === "approvals" ? (
              <ApprovalsView />
            ) : activeRoadmapTab.route.id === "calendar" ? (
              <ContentCalendarView />
            ) : activeRoadmapTab.route.id === "scheduler" ? (
              <SchedulerView />
            ) : activeRoadmapTab.route.id === "comments" ? (
              <CommentsView />
            ) : activeRoadmapTab.route.id === "metrics" ? (
              <MetricsView />
            ) : activeRoadmapTab.route.id === "workflows" ? (
              <WorkflowsView />
            ) : activeRoadmapTab.route.id === "agents" ? (
              <AgentRuntimeView />
            ) : activeRoadmapTab.route.id === "playbooks" ? (
              <PlaybooksView />
            ) : activeRoadmapTab.route.id === "integrations" ? (
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
