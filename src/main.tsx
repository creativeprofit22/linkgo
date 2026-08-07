import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import type {
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
  CreateDraftInput,
  EligibleDraftWorkflowOption,
  SaveGeneratedDraftInput,
} from "@/features/drafts/types";
import { IS_TAURI } from "@/lib/env";
import type {
  CreateWorkflowArtifactInput,
  CreateWorkflowRunInput,
  ExecuteWorkflowRunInput,
  SetWorkflowStepStatusInput,
  StartWorkflowRunInput,
} from "@/workflows/types";
import { HomePage } from "@/pages/home";
import { SettingsPage } from "@/pages/settings";
import "./index.css";

const pageMap = {
  "/": HomePage,
  "/settings": SettingsPage,
};

const pathname = window.location.pathname;
const PageComponent = pageMap[pathname as keyof typeof pageMap] ?? HomePage;

type ApprovalTestApi = {
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
  createDraft: (input: CreateDraftInput) => Promise<number>;
  listEligibleDraftWorkflowOptions: (
    campaignId: number,
  ) => Promise<EligibleDraftWorkflowOption[]>;
  saveGeneratedDraft: (input: SaveGeneratedDraftInput) => Promise<number>;
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
    ({ recordPublishAttempt, scheduleApproval }) => {
      (
        window as unknown as { __LINKGO_APPROVAL_TEST_API__?: ApprovalTestApi }
      ).__LINKGO_APPROVAL_TEST_API__ = {
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
    ({ createDraft, listEligibleDraftWorkflowOptions, saveGeneratedDraft }) => {
      (
        window as unknown as { __LINKGO_DRAFTS_TEST_API__?: DraftTestApi }
      ).__LINKGO_DRAFTS_TEST_API__ = {
        createDraft,
        listEligibleDraftWorkflowOptions,
        saveGeneratedDraft,
      };
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
        .catch(() => {});
    });
  }, []);

  return <PageComponent />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootShell />
  </React.StrictMode>,
);
