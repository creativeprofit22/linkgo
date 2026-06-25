import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
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
