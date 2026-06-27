import { defineConfig, devices } from "@playwright/test";

import {
  APP_ENV,
  APP_PORT,
  APP_URL,
  E2E_ADMIN_EMAIL,
  MOCK_SUPABASE_PORT,
  MOCK_SUPABASE_URL,
} from "./tests/e2e/support/config";

/**
 * Playwright config — end-to-end suite (`tests/e2e/`) (Task 38 / R29.3, R29.4).
 *
 * Two managed servers boot before the tests:
 *   1. A dependency-free **mock Supabase** server (deterministic seeded data +
 *      stub auth). `NEXT_PUBLIC_SUPABASE_URL` points the app at it, so BOTH the
 *      SSR fetches and the browser anon client share one dataset — no real bot,
 *      database or credentials are ever used (R29.4).
 *   2. The **app under test**, built and started with `SKIP_ENV_VALIDATION=1`,
 *      `NEXT_PUBLIC_E2E=1` (deterministic realtime seam) and safe placeholder
 *      envs (see `tests/e2e/support/config.ts`).
 *
 * Realtime is simulated deterministically via an injected window event (see the
 * test fixtures), and accessibility is checked in-page with `@axe-core/playwright`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Deterministic mock Supabase (REST + stub auth). No extra dependencies.
      command: "node tests/e2e/support/mock-supabase.mjs",
      url: `${MOCK_SUPABASE_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        MOCK_SUPABASE_PORT: String(MOCK_SUPABASE_PORT),
        E2E_ADMIN_EMAIL,
      },
    },
    {
      // Build + start the app with e2e env. NEXT_PUBLIC_* must be present at
      // BUILD time (they are inlined), so the env is applied to the whole command.
      command: `npm run build && npm run start -- -p ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: APP_ENV,
    },
  ],
});
