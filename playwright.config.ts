import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";
const apiPort = process.env.NOVEL_API_PORT || (reuseExistingServer ? "8787" : "18787");
const uiPort = process.env.NOVEL_UI_PORT || (reuseExistingServer ? "5173" : "15173");
const mockAgentCommand = process.env.CODEX_COMMAND || `node "${path.resolve("scripts/mock-codex-agent.cjs")}"`;

process.env.NOVEL_API_PORT = apiPort;
process.env.NOVEL_UI_PORT = uiPort;
process.env.API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${apiPort}`;

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
      command: "npm --prefix api run serve:ts",
      url: `http://127.0.0.1:${apiPort}/health`,
      env: {
        ...process.env,
        CODEX_COMMAND: mockAgentCommand,
        AI_TASK_TIMEOUT_MS: process.env.AI_TASK_TIMEOUT_MS || "60000",
        NOVEL_API_ORIGINS: process.env.NOVEL_API_ORIGINS || `http://127.0.0.1:${uiPort},http://localhost:${uiPort}`
      },
      reuseExistingServer,
      timeout: 60_000
    },
    {
      command: `npm --prefix ui run dev -- --host 127.0.0.1 --port ${uiPort}`,
      url: `http://127.0.0.1:${uiPort}`,
      reuseExistingServer,
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
