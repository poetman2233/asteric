import { defineConfig } from "@playwright/test";

/**
 * Smoke tests against a running app (npm run dev, or E2E_BASE_URL for a deployed preview).
 * The database must be migrated and seeded with `npm run seed:demo`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  reporter: "list",
});
