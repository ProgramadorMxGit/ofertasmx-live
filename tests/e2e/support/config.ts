/**
 * Shared constants for the e2e harness (Task 38.1). Imported by both
 * `playwright.config.ts` (to wire the servers + env) and the test fixtures (to
 * build the admin session + mock URLs), so there is a single source of truth.
 *
 * Every value here is a deterministic, non-secret placeholder — the suite never
 * uses real credentials, the real bot or the real database (R29.4).
 */

/** Port the app under test is served on (`next start -p`). */
export const APP_PORT = 3100;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

/** Port the deterministic mock Supabase server listens on. */
export const MOCK_SUPABASE_PORT = 54330;
export const MOCK_SUPABASE_URL = `http://127.0.0.1:${MOCK_SUPABASE_PORT}`;

/** Allowlisted test admin — must match the app's `ADMIN_EMAIL` env below. */
export const E2E_ADMIN_EMAIL = "e2e-admin@example.test";

/**
 * Environment passed to the app's `next build` + `next start`. `SKIP_ENV_VALIDATION`
 * lets it boot without real secrets; `NEXT_PUBLIC_E2E` enables the deterministic
 * realtime seam; the `NEXT_PUBLIC_*` values are safe placeholders; Supabase points
 * at the mock so SSR + the browser client share one deterministic dataset.
 */
export const APP_ENV: Record<string, string> = {
  SKIP_ENV_VALIDATION: "1",
  NEXT_PUBLIC_E2E: "1",
  NEXT_PUBLIC_SITE_URL: APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: MOCK_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key-not-a-secret",
  NEXT_PUBLIC_WHATSAPP_INVITE_URL: "https://wa.me/520000000000",
  ADMIN_EMAIL: E2E_ADMIN_EMAIL,
  // Server-only placeholders (never real). Validation is skipped at boot.
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-not-a-secret",
  TELEGRAM_BOT_TOKEN: "e2e:telegram-bot-token-not-a-secret",
  TELEGRAM_WEBHOOK_SECRET: "e2e-webhook-secret-not-a-secret",
  TELEGRAM_ALLOWED_CHAT_ID: "5054325626",
  AMAZON_TRACKING_ID: "programadormx-20",
  CRON_SECRET: "e2e-cron-secret-not-a-secret",
  SHOW_AMAZON_PRICES: "true",
};

/**
 * Custom window event the app's realtime hook listens for under `NEXT_PUBLIC_E2E`
 * (mirrors `REALTIME_TEST_EVENT` in `components/offers/use-offers-realtime.ts`).
 */
export const REALTIME_TEST_EVENT = "ofertas:e2e-realtime";

/**
 * The Supabase auth-cookie name supabase-js derives from the project URL host
 * (`sb-<first-label>-auth-token`). For `http://127.0.0.1:<port>` that is
 * `sb-127-auth-token`.
 */
export const SUPABASE_AUTH_COOKIE = `sb-${new URL(MOCK_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
