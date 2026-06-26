import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90000,
  use: {
    baseURL: "http://localhost:1422",
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
    command:
      "VITE_PLAYWRIGHT=true bun run build && bun run preview -- --host 127.0.0.1 --port 1422",
    url: "http://localhost:1422",
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      VITE_PLAYWRIGHT: "true",
    },
  },
});
