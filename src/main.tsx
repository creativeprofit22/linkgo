import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import type { RecordPublishAttemptInput } from "@/features/approvals/types";
import { IS_TAURI } from "@/lib/env";
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
};

if (import.meta.env.VITE_PLAYWRIGHT) {
  void import("@/features/approvals/data").then(({ recordPublishAttempt }) => {
    (
      window as unknown as { __LINKGO_APPROVAL_TEST_API__?: ApprovalTestApi }
    ).__LINKGO_APPROVAL_TEST_API__ = { recordPublishAttempt };
  });
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
