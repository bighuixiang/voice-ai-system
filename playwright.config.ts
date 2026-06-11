import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.NOVEL_API_PORT || "8787";
const uiPort = process.env.NOVEL_UI_PORT || "5173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.UI_BASE_URL || `http://127.0.0.1:${uiPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "npm --prefix api run dev",
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: true,
      timeout: 60_000
    },
    {
      command: `npm --prefix ui run dev -- --host 127.0.0.1 --port ${uiPort}`,
      url: `http://127.0.0.1:${uiPort}`,
      reuseExistingServer: true,
      timeout: 60_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
