import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import type {
  ApprovalEligibleDraft,
  CreateApprovalInput,
  RecordPublishAttemptInput,
  ScheduleApprovalInput,
} from "@/features/approvals/types";
import type {
  CreateCampaignBacklogItemInput,
  SetCampaignBacklogItemStatusInput,
  UpdateCampaignBacklogItemInput,
} from "@/features/campaign-backlog/types";
import type { RecordCommentAttemptInput } from "@/features/comments/types";
import type {
  CompleteDraftAiAuditRunInput,
  CreateDraftInput,
  EligibleDraftWorkflowOption,
  FailDraftAiAuditRunInput,
  ReconcileDraftAiAuditLifecycleInput,
  ReconcileDraftAiAuditLifecycleResult,
  RunDraftAiAuditInput,
  SaveGeneratedDraftInput,
  StartDraftAiAuditRunInput,
  UpdateDraftVariantInput,
  ClaimDraftQualityInput,
} from "@/features/drafts/types";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { IS_TAURI, IS_TEST } from "@/lib/env";
import type {
  CreateWorkflowArtifactInput,
  CreateWorkflowRunInput,
  ExecuteWorkflowRunInput,
  SetWorkflowStepStatusInput,
  StartWorkflowRunInput,
} from "@/workflows/types";
import { HomePage } from "@/pages/home";
import "./index.css";

// Settings used to be its own window at `/settings`; it now lives inside the
// app, so an old `/settings` address opens the in-app Settings screen.
if (window.location.pathname === "/settings") {
  window.history.replaceState(null, "", "/#/settings");
}

type ApprovalTestApi = {
  createApproval: (input: CreateApprovalInput) => Promise<number>;
  listApprovalEligibleDrafts: (
    campaignId?: number,
  ) => Promise<ApprovalEligibleDraft[]>;
  recordPublishAttempt: (input: RecordPublishAttemptInput) => Promise<number>;
  scheduleApproval: (input: ScheduleApprovalInput) => Promise<number>;
};

type CampaignBacklogTestApi = {
  getNextCampaignBacklogDueAt: (
    dueAt: string,
    recurrence: "daily" | "weekly",
    recurrenceTimeZone: string,
    now?: Date,
  ) => string;
  createCampaignBacklogItem: (
    input: CreateCampaignBacklogItemInput,
  ) => Promise<unknown>;
  updateCampaignBacklogItem: (
    input: UpdateCampaignBacklogItemInput,
  ) => Promise<unknown>;
  setCampaignBacklogItemStatus: (
    input: SetCampaignBacklogItemStatusInput,
  ) => Promise<unknown>;
};

type CommentTestApi = {
  recordCommentAttempt: (input: RecordCommentAttemptInput) => Promise<number>;
};

type DraftTestApi = {
  completeDraftAiAuditRun: (
    input: CompleteDraftAiAuditRunInput,
  ) => Promise<void>;
  createDraft: (input: CreateDraftInput) => Promise<number>;
  listDrafts: typeof import("@/features/drafts/data").listDrafts;
  listEligibleDraftWorkflowOptions: (
    campaignId: number,
  ) => Promise<EligibleDraftWorkflowOption[]>;
  failDraftAiAuditRun: (input: FailDraftAiAuditRunInput) => Promise<void>;
  reconcileDraftAiAuditLifecycle: (
    input?: ReconcileDraftAiAuditLifecycleInput,
  ) => Promise<ReconcileDraftAiAuditLifecycleResult>;
  runDraftAiAudit: (input: RunDraftAiAuditInput) => Promise<number>;
  saveGeneratedDraft: (input: SaveGeneratedDraftInput) => Promise<number>;
  startDraftAiAuditRun: (input: StartDraftAiAuditRunInput) => Promise<unknown>;
  updateDraftVariant: (input: UpdateDraftVariantInput) => Promise<void>;
  runDraftQualityLoop: (input: ClaimDraftQualityInput) => Promise<unknown>;
};

type WorkflowTestApi = {
  createWorkflowArtifact: (
    input: CreateWorkflowArtifactInput,
  ) => Promise<number>;
  createWorkflowRun: (input: CreateWorkflowRunInput) => Promise<number>;
  executeWorkflowRun: (input: ExecuteWorkflowRunInput) => Promise<void>;
  resumeWorkflowRun: (input: StartWorkflowRunInput) => Promise<void>;
  setWorkflowStepStatus: (input: SetWorkflowStepStatusInput) => Promise<void>;
};

if (import.meta.env.VITE_PLAYWRIGHT) {
  void import("@/features/campaign-backlog/data").then(
    ({
      createCampaignBacklogItem,
      getNextCampaignBacklogDueAt,
      setCampaignBacklogItemStatus,
      updateCampaignBacklogItem,
    }) => {
      (
        window as unknown as {
          __LINKGO_CAMPAIGN_BACKLOG_TEST_API__?: CampaignBacklogTestApi;
        }
      ).__LINKGO_CAMPAIGN_BACKLOG_TEST_API__ = {
        getNextCampaignBacklogDueAt,
        createCampaignBacklogItem,
        updateCampaignBacklogItem,
        setCampaignBacklogItemStatus,
      };
    },
  );
  void import("@/features/approvals/data").then(
    ({
      createApproval,
      listApprovalEligibleDrafts,
      recordPublishAttempt,
      scheduleApproval,
    }) => {
      (
        window as unknown as { __LINKGO_APPROVAL_TEST_API__?: ApprovalTestApi }
      ).__LINKGO_APPROVAL_TEST_API__ = {
        createApproval,
        listApprovalEligibleDrafts,
        recordPublishAttempt,
        scheduleApproval,
      };
    },
  );
  void import("@/features/comments/data").then(({ recordCommentAttempt }) => {
    (
      window as unknown as { __LINKGO_COMMENT_TEST_API__?: CommentTestApi }
    ).__LINKGO_COMMENT_TEST_API__ = {
      recordCommentAttempt,
    };
  });
  void import("@/features/drafts/data").then(
    ({
      completeDraftAiAuditRun,
      createDraft,
      failDraftAiAuditRun,
      listDrafts,
      listEligibleDraftWorkflowOptions,
      reconcileDraftAiAuditLifecycle,
      runDraftAiAudit,
      saveGeneratedDraft,
      startDraftAiAuditRun,
      updateDraftVariant,
    }) => {
      void import("@/features/drafts/quality-loop").then(
        ({ runDraftQualityLoop }) => {
          (
            window as unknown as { __LINKGO_DRAFTS_TEST_API__?: DraftTestApi }
          ).__LINKGO_DRAFTS_TEST_API__ = {
            completeDraftAiAuditRun,
            createDraft,
            listDrafts,
            listEligibleDraftWorkflowOptions,
            failDraftAiAuditRun,
            reconcileDraftAiAuditLifecycle,
            runDraftAiAudit,
            saveGeneratedDraft,
            startDraftAiAuditRun,
            updateDraftVariant,
            runDraftQualityLoop,
          };
        },
      );
    },
  );
  void import("@/workflows/data").then(
    ({
      createWorkflowArtifact,
      createWorkflowRun,
      executeWorkflowRun,
      resumeWorkflowRun,
      setWorkflowStepStatus,
    }) => {
      (
        window as unknown as { __LINKGO_WORKFLOWS_TEST_API__?: WorkflowTestApi }
      ).__LINKGO_WORKFLOWS_TEST_API__ = {
        createWorkflowArtifact,
        createWorkflowRun,
        executeWorkflowRun,
        resumeWorkflowRun,
        setWorkflowStepStatus,
      };
    },
  );
}

function RootShell(): React.ReactNode {
  useEffect(() => {
    if (!IS_TAURI) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      void getCurrentWindow()
        .show()
        .catch((error: unknown) => {
          // The window starts hidden; leave a trace if it can't be shown.
          console.error("Showing the main window failed", error);
        });
    });
    void import("@/features/drafts/data")
      .then(({ reconcileStaleDraftQuality }) => reconcileStaleDraftQuality())
      .catch((error: unknown) => {
        console.error("Draft quality startup reconciliation failed", error);
      });
    void import("@/features/drafts/data")
      .then(({ reconcileDraftAiAuditLifecycle }) =>
        reconcileDraftAiAuditLifecycle(),
      )
      .catch((error: unknown) => {
        console.error("Draft AI audit startup reconciliation failed", error);
      });
  }, []);

  return <HomePage />;
}

/** Test-only: throws during render so tests can reach the crash screen. */
function TestRenderCrash(): React.ReactNode {
  throw new Error("Forced render crash for tests");
}

const forceRenderCrash =
  IS_TEST &&
  (window as { __LINKGO_FORCE_RENDER_CRASH__?: boolean })
    .__LINKGO_FORCE_RENDER_CRASH__ === true;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {forceRenderCrash ? <TestRenderCrash /> : <RootShell />}
    </AppErrorBoundary>
  </React.StrictMode>,
);
