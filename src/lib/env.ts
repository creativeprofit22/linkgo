/** True when running inside Playwright tests, outside the Tauri runtime. */
export const IS_TEST = import.meta.env.VITE_PLAYWRIGHT === "true";

/** True when running inside the Tauri desktop app. */
export const IS_TAURI =
  !IS_TEST && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Where the renderer is running:
 * - `desktop`: the Tauri app; native commands and persistence are available.
 * - `test-adapter`: a Playwright build with an injected Tauri mock.
 * - `browser-preview`: a plain browser with no Tauri runtime; nothing persists.
 */
export type AppRuntime = "desktop" | "test-adapter" | "browser-preview";

/**
 * Detects the runtime at call time (not build time) so a Playwright page
 * without an injected adapter behaves exactly like a real browser preview.
 * Tauri injects `__TAURI_INTERNALS__` before any app script runs.
 */
export function getAppRuntime(): AppRuntime {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return "browser-preview";
  }
  return IS_TEST ? "test-adapter" : "desktop";
}

/** True when native commands are unavailable and nothing can be saved. */
export function isBrowserPreview(): boolean {
  return getAppRuntime() === "browser-preview";
}
