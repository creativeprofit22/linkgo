import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  KeyRound,
  ListChecks,
  MessageCircle,
  NotebookTabs,
  Route,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Target,
  Workflow,
} from "lucide-react";
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
import { settingsRoute } from "@/features/settings/schemas";
import { setupRoute } from "@/features/setup/schemas";
import { todayRoute } from "@/features/today/schemas";
import { workflowsRoute } from "@/features/workflows/schemas";
import type { RouteDefinition } from "@/lib/navigation/route-contract";

/**
 * Every main-window screen. Each feature owns its route; the area map below
 * decides where each one sits in the menu. See docs/features/navigation-areas.md.
 */
export const homeRoutes = [
  todayRoute,
  campaignsRoute,
  candidateQueueRoute,
  draftsRoute,
  approvalsRoute,
  commentsRoute,
  contentCalendarRoute,
  metricsRoute,
  settingsRoute,
  integrationsRoute,
  playbooksRoute,
  safetyRoute,
  autopilotPlannerRoute,
  workflowsRoute,
  agentRuntimeRoute,
  campaignBacklogRoute,
  setupRoute,
] as const;

export type HomeTab = (typeof homeRoutes)[number]["id"];
/** Any main-window screen, with its params widened for list handling. */
export type HomeRoute = RouteDefinition<HomeTab>;

export type AreaId = "today" | "create" | "calendar" | "results" | "settings";

type Icon = React.ComponentType<{ className?: string }>;

export type AreaSection = {
  route: HomeRoute;
  label: string;
  description: string;
  icon: Icon;
  group?: "advanced";
};

export type HomeArea = {
  id: AreaId;
  label: string;
  icon: Icon;
  sections: readonly [AreaSection, ...AreaSection[]];
};

export const homeAreas: readonly HomeArea[] = [
  {
    id: "today",
    label: "Today",
    icon: Sun,
    sections: [
      {
        route: todayRoute,
        label: "Today",
        description: "What needs you now.",
        icon: Sun,
      },
    ],
  },
  {
    id: "create",
    label: "Create",
    icon: FileText,
    sections: [
      {
        route: campaignsRoute,
        label: "Campaigns",
        description: "Group your posts by goal and audience.",
        icon: Target,
      },
      {
        route: candidateQueueRoute,
        label: "Ideas",
        description: "Posts and topics worth writing about or replying to.",
        icon: ListChecks,
      },
      {
        route: draftsRoute,
        label: "Drafts",
        description: "Write and compare post versions, with quality checks.",
        icon: FileText,
      },
      {
        route: approvalsRoute,
        label: "Approvals",
        description: "Review posts before anything goes live.",
        icon: CheckCircle2,
      },
      {
        route: commentsRoute,
        label: "Replies",
        description: "Draft replies and approve them before they post.",
        icon: MessageCircle,
      },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    sections: [
      {
        route: contentCalendarRoute,
        label: "Calendar",
        description: "Plan when each post goes out.",
        icon: CalendarDays,
      },
    ],
  },
  {
    id: "results",
    label: "Results",
    icon: BarChart3,
    sections: [
      {
        route: metricsRoute,
        label: "Analytics",
        description: "See how posts perform and what you’ve learned.",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    sections: [
      {
        route: settingsRoute,
        label: "General",
        description: "Startup and how Linkgo behaves on this computer.",
        icon: SlidersHorizontal,
      },
      {
        route: integrationsRoute,
        label: "Connected accounts",
        description: "Connect LinkedIn and your AI account.",
        icon: KeyRound,
      },
      {
        route: playbooksRoute,
        label: "Brand voice",
        description: "Writing guides that shape how the AI writes for you.",
        icon: NotebookTabs,
      },
      {
        route: safetyRoute,
        label: "Safety",
        description:
          "Emergency stop, daily limits, and anything that needs fixing.",
        icon: ShieldAlert,
      },
      {
        route: autopilotPlannerRoute,
        label: "Autopilot",
        description: "Let Linkgo suggest what to work on next.",
        icon: Route,
      },
      {
        route: workflowsRoute,
        label: "Automations",
        description: "Follow the steps of automated tasks.",
        icon: Workflow,
        group: "advanced",
      },
      {
        route: agentRuntimeRoute,
        label: "AI assistant",
        description: "See what the AI assistant did, and try it safely.",
        icon: Bot,
        group: "advanced",
      },
      {
        route: campaignBacklogRoute,
        label: "Tasks",
        description: "What’s due, who owns it, and repeating tasks.",
        icon: ClipboardList,
        group: "advanced",
      },
    ],
  },
];

/** Area for each screen. Exhaustive: a new screen without an area fails type-check. */
const areaByScreen = {
  today: "today",
  campaigns: "create",
  queue: "create",
  drafts: "create",
  approvals: "create",
  comments: "create",
  calendar: "calendar",
  metrics: "results",
  settings: "settings",
  integrations: "settings",
  playbooks: "settings",
  safety: "settings",
  autopilot: "settings",
  workflows: "settings",
  agents: "settings",
  backlog: "settings",
  setup: null,
} as const satisfies Record<HomeTab, AreaId | null>;

/** The area a screen belongs to; `null` for Get started (outside the areas). */
export function areaForScreen(id: HomeTab): AreaId | null {
  return areaByScreen[id];
}

export function getArea(id: AreaId): HomeArea {
  const area = homeAreas.find((candidate) => candidate.id === id);
  if (area) return area;
  throw new Error(`Unknown Linkgo area: ${id}`);
}

/** The menu section for a screen; `null` for Get started. */
export function sectionForScreen(id: HomeTab): AreaSection | null {
  const areaId = areaForScreen(id);
  if (areaId === null) return null;
  return (
    getArea(areaId).sections.find((section) => section.route.id === id) ?? null
  );
}

/**
 * Links that don't name a screen but still open one, replacing the history
 * entry so Back skips them: short area links and retired screen ids.
 */
export const homeRouteAliases: ReadonlyMap<string, HomeTab> = new Map([
  ["create", campaignsRoute.id],
  ["results", metricsRoute.id],
  // Auto-posting moved into the Calendar side panel.
  ["scheduler", contentCalendarRoute.id],
]);
