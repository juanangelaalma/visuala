import { defineConfig, devices } from "@playwright/test";

/**
 * One port for both the server Playwright starts and the base URL it tests, because the backend's
 * `CORS_ORIGIN` is an allowlist: a run on a port the backend does not allow fails at the first fetch.
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    // `pnpm dev -- --port 3100` reaches Next as a positional argument, and Next then reports
    // "Invalid project directory provided" and exits, so the extra separator has to stay out.
    command: `pnpm dev --port ${port}`,
    // Readiness waits on a static file, not a page: every page here reaches `NEXT_PUBLIC_API_URL`
    // during render, so probing one would wait out the API's connect timeout when no API is running.
    url: `http://localhost:${port}/favicon.ico`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
