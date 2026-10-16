import { Activity, Info } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useState } from "react";
import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import { Toaster } from "@/components/ui/sonner";
import {
  SetupEmptyCampaigns,
  SetupLauncher,
  SetupView,
} from "@/features/setup";
import { setupRoute } from "@/features/setup/schemas";
import { todayRoute } from "@/features/today/schemas";
import { useAppShortcuts } from "@/hooks/use-app-shortcuts";
import {
  parseRouteHash,
  splitRouteHash,
} from "@/lib/navigation/route-contract";
import {
  navigateTo,
  readLastScreen,
  useHashLocation,
  writeLastScreen,
} from "@/lib/navigation/use-hash-navigation";
import { cn } from "@/lib/utils";
import {
  areaForScreen,
  getArea,
  homeAreas,
  homeRouteAliases,
  homeRoutes,
  sectionForScreen,
  type AreaId,
  type AreaSection,
  type HomeArea,
  type HomeRoute,
  type HomeTab,
} from "@/pages/home-areas";

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
const SettingsView = lazy(() =>
  import("@/features/settings").then(({ SettingsView }) => ({
    default: SettingsView,
  })),
);
const TodayView = lazy(() =>
  import("@/features/today").then(({ TodayView }) => ({
    default: TodayView,
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

const homeRouteIds: readonly HomeTab[] = homeRoutes.map((route) => route.id);
const defaultHomeRoute = todayRoute;

type HomeLocation =
  | { kind: "empty" | "alias"; routeId: HomeTab }
  | { kind: "ok" | "invalid-params" | "unknown-screen"; routeId: HomeTab };

/** Which screen the current link shows; an empty link restores the last one. */
function resolveHomeLocation(hash: string): HomeLocation {
  const requestedId = splitRouteHash(hash).id;
  if (requestedId === "") {
    return {
      kind: "empty",
      routeId: readLastScreen(homeRouteIds) ?? defaultHomeRoute.id,
    };
  }
  const aliasRouteId = homeRouteAliases.get(requestedId);
  if (aliasRouteId) return { kind: "alias", routeId: aliasRouteId };
  const parsed = parseRouteHash(hash, homeRoutes, defaultHomeRoute.id);
  return { kind: parsed.kind, routeId: parsed.routeId };
}

function getHomeRoute(id: HomeTab): HomeRoute {
  return homeRoutes.find((route) => route.id === id) ?? defaultHomeRoute;
}

/** Classes shared by every menu button: focus ring, hover, press and touch. */
const menuButtonBase =
  "flex min-h-11 touch-manipulation rounded-xl border text-left outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring/50 forced-colors:border";
const menuButtonIdle = "border-transparent hover:bg-accent/60 active:bg-accent";
const menuButtonCurrent =
  "border-linkgo-blue/50 bg-linkgo-blue/10 text-foreground";

function SectionButton({
  section,
  current,
}: {
  section: AreaSection;
  current: boolean;
}): React.ReactNode {
  const Icon = section.icon;
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      onClick={() => navigateTo(section.route)}
      className={cn(
        menuButtonBase,
        "items-center gap-2 px-3 py-2 text-sm font-medium sm:w-full sm:items-start sm:gap-3",
        current ? menuButtonCurrent : menuButtonIdle,
      )}
    >
      <Icon className="size-4 shrink-0 sm:mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block">{section.label}</span>
        <span className="text-muted-foreground mt-0.5 hidden text-xs leading-relaxed font-normal sm:block">
          {section.description}
        </span>
      </span>
    </button>
  );
}

/** Sub-view menu for one area; rendered only when it has several sub-views. */
function SectionNav({
  area,
  activeTab,
  className,
}: {
  area: HomeArea;
  activeTab: HomeTab;
  className?: string;
}): React.ReactNode {
  const advancedLabelId = useId();
  const basic = area.sections.filter((section) => section.group === undefined);
  const advanced = area.sections.filter(
    (section) => section.group === "advanced",
  );
  const renderButton = (section: AreaSection): React.ReactNode => (
    <SectionButton
      key={section.route.id}
      section={section}
      current={section.route.id === activeTab}
    />
  );
  return (
    <nav
      aria-label={`${area.label} sections`}
      className={cn(
        "flex-wrap gap-1 sm:flex-col sm:flex-nowrap sm:border-l sm:pl-2",
        className,
      )}
    >
      {basic.map(renderButton)}
      {advanced.length > 0 && (
        <div
          role="group"
          aria-labelledby={advancedLabelId}
          className="flex basis-full flex-wrap items-center gap-1 sm:mt-2 sm:flex-col sm:flex-nowrap sm:items-stretch"
        >
          <p
            id={advancedLabelId}
            className="text-muted-foreground basis-full px-1 pt-1 text-xs font-medium tracking-wide uppercase sm:px-3"
          >
            Advanced
          </p>
          {advanced.map(renderButton)}
        </div>
      )}
    </nav>
  );
}

export function HomePage(): React.ReactNode {
  const hash = useHashLocation();
  const homeLocation = resolveHomeLocation(hash);
  const activeTab = homeLocation.routeId;
  const activeAreaId = areaForScreen(activeTab);
  const activeArea = activeAreaId === null ? null : getArea(activeAreaId);
  // Sub-view last opened in each area, this session only (nothing stored).
  const [lastScreenByArea, setLastScreenByArea] = useState<
    Partial<Record<AreaId, HomeTab>>
  >({});
  useAppShortcuts();

  useEffect(() => {
    if (homeLocation.kind === "empty" || homeLocation.kind === "alias") {
      // Give the restored screen, area link or retired link its screen's
      // address without adding a history entry, so Back skips the alias.
      navigateTo(getHomeRoute(homeLocation.routeId), undefined, {
        replace: true,
      });
    } else if (homeLocation.kind !== "unknown-screen") {
      writeLastScreen(homeLocation.routeId);
      const areaId = areaForScreen(homeLocation.routeId);
      if (areaId !== null) {
        setLastScreenByArea((previous) =>
          previous[areaId] === homeLocation.routeId
            ? previous
            : { ...previous, [areaId]: homeLocation.routeId },
        );
      }
    }
  }, [homeLocation.kind, homeLocation.routeId]);

  const openArea = (area: HomeArea): void => {
    const remembered = lastScreenByArea[area.id];
    navigateTo(
      remembered === undefined
        ? area.sections[0].route
        : getHomeRoute(remembered),
    );
  };

  const activeLabel = sectionForScreen(activeTab)?.label ?? "Get started";
  const showSections = activeArea !== null && activeArea.sections.length > 1;

  return (
    <WindowFrame
      titleBar={<MainTitleBar />}
      contentClassName="flex overflow-hidden"
    >
      <div className="flex h-full w-full flex-col overflow-hidden sm:flex-row">
        <aside className="border-border/70 bg-background/55 flex w-full shrink-0 flex-col gap-2 border-b p-2 backdrop-blur sm:min-h-0 sm:w-72 sm:gap-0 sm:border-r sm:border-b-0 sm:p-4">
          <div className="shrink-0 space-y-2 sm:mb-6">
            <div className="flex items-center gap-2">
              <Activity className="text-linkgo-blue size-5" />
              <h1 className="text-lg font-semibold">Linkgo</h1>
            </div>
            <p className="text-muted-foreground hidden text-sm sm:block">
              Plan, write and share LinkedIn posts. Nothing goes live without
              your OK.
            </p>
          </div>

          <div className="shrink-0 sm:mb-3 [&:empty]:hidden">
            <SetupLauncher active={activeTab === setupRoute.id} />
          </div>

          <nav
            className="grid shrink-0 grid-cols-5 gap-1 sm:-mr-2 sm:flex sm:min-h-0 sm:flex-1 sm:flex-col sm:overflow-y-auto sm:pr-2"
            aria-label="Main menu"
          >
            {homeAreas.map((area) => {
              const Icon = area.icon;
              const current = area.id === activeAreaId;
              return (
                <div key={area.id} className="contents sm:block sm:space-y-1">
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    onClick={() => openArea(area)}
                    className={cn(
                      menuButtonBase,
                      "min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-xs leading-tight font-medium [overflow-wrap:anywhere] sm:w-full sm:flex-row sm:justify-start sm:gap-3 sm:px-3 sm:py-2 sm:text-left sm:text-sm",
                      current ? menuButtonCurrent : menuButtonIdle,
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{area.label}</span>
                  </button>
                  {current && showSections && (
                    <SectionNav
                      area={area}
                      activeTab={activeTab}
                      className="ml-4 hidden sm:flex"
                    />
                  )}
                </div>
              );
            })}
          </nav>

          {activeArea !== null && showSections && (
            <SectionNav
              area={activeArea}
              activeTab={activeTab}
              className="flex shrink-0 sm:hidden"
            />
          )}
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
                {activeLabel}.
              </span>
            </p>
          )}
          <Suspense fallback={featureViewFallback}>
            {activeTab === "campaigns" ? (
              <CampaignsView
                renderEmpty={(defaultEmpty) => (
                  <SetupEmptyCampaigns fallback={defaultEmpty} />
                )}
              />
            ) : activeTab === "today" ? (
              <TodayView />
            ) : activeTab === "setup" ? (
              <SetupView />
            ) : activeTab === "settings" ? (
              <SettingsView />
            ) : activeTab === "autopilot" ? (
              <AutopilotPlannerView />
            ) : activeTab === "backlog" ? (
              <CampaignBacklogView />
            ) : activeTab === "queue" ? (
              <CandidateQueueView />
            ) : activeTab === "drafts" ? (
              <DraftsView />
            ) : activeTab === "approvals" ? (
              <ApprovalsView />
            ) : activeTab === "calendar" ? (
              <ContentCalendarView />
            ) : activeTab === "comments" ? (
              <CommentsView />
            ) : activeTab === "metrics" ? (
              <MetricsView />
            ) : activeTab === "workflows" ? (
              <WorkflowsView />
            ) : activeTab === "agents" ? (
              <AgentRuntimeView />
            ) : activeTab === "playbooks" ? (
              <PlaybooksView />
            ) : activeTab === "integrations" ? (
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
