import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://127.0.0.1:8080";
const useExternal = Boolean(process.env["PLAYWRIGHT_BASE_URL"]);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  ...(useExternal
    ? {}
    : {
        webServer: {
          command: "npm run dev -- --host 127.0.0.1 --port 8080",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
