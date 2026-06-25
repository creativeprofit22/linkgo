/** True when running inside Playwright tests, outside the Tauri runtime. */
export const IS_TEST = import.meta.env.VITE_PLAYWRIGHT === "true";

/** True when running inside the Tauri desktop app. */
export const IS_TAURI =
  !IS_TEST && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
