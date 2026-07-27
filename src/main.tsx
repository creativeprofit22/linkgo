import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import type {
  RecordPublishAttemptInput,
  ScheduleApprovalInput,
} from "@/features/approvals/types";
import type { RecordCommentAttemptInput } from "@/features/comments/types";
import { IS_TAURI } from "@/lib/env";
import type {
  CreateWorkflowArtifactInput,
  CreateWorkflowRunInput,
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

type CommentTestApi = {
  recordCommentAttempt: (input: RecordCommentAttemptInput) => Promise<number>;
};

type WorkflowTestApi = {
  createWorkflowArtifact: (
    input: CreateWorkflowArtifactInput,
  ) => Promise<number>;
  createWorkflowRun: (input: CreateWorkflowRunInput) => Promise<number>;
  resumeWorkflowRun: (input: StartWorkflowRunInput) => Promise<void>;
};

if (import.meta.env.VITE_PLAYWRIGHT) {
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
  void import("@/workflows/data").then(
    ({ createWorkflowArtifact, createWorkflowRun, resumeWorkflowRun }) => {
      (
        window as unknown as { __LINKGO_WORKFLOWS_TEST_API__?: WorkflowTestApi }
      ).__LINKGO_WORKFLOWS_TEST_API__ = {
        createWorkflowArtifact,
        createWorkflowRun,
        resumeWorkflowRun,
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
