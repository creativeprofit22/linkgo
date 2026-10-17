import { defineConfig, devices } from "@playwright/test";

const previewPort = process.env.PLAYWRIGHT_PORT ?? "17422";
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90000,
  use: {
    baseURL: previewUrl,
    trace: "on-first-retry",
    launchOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `bun run build && bun run preview -- --host 127.0.0.1 --port ${previewPort}`,
    url: previewUrl,
    reuseExistingServer: false,
    // Covers a full production build before the preview starts; 120 s was
    // not enough on a loaded machine (e.g. while cargo builds alongside).
    timeout: 300000,
    env: {
      VITE_PLAYWRIGHT: "true",
    },
  },
});
