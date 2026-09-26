import { useState, type ReactNode } from "react";
import { isBrowserPreview } from "@/lib/env";

/**
 * Identifies the plain-browser build as a nonpersistent preview. Renders
 * nothing in the desktop app or when a Playwright test adapter is injected.
 */
export function BrowserPreviewBanner(): ReactNode {
  const [preview] = useState(isBrowserPreview);
  if (!preview) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-200"
    >
      Browser preview — nothing is saved. Run the Linkgo desktop app to use your
      data.
    </div>
  );
}
