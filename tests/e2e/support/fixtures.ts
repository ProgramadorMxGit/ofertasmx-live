import type { BrowserContext, Page } from "@playwright/test";

import type { PublicOffer } from "@/lib/offers/query";

import {
  APP_URL,
  E2E_ADMIN_EMAIL,
  REALTIME_TEST_EVENT,
  SUPABASE_AUTH_COOKIE,
} from "./config";

/**
 * E2E helpers (Task 38.1 / R29.4): a fake admin session and a deterministic
 * realtime injector. Neither touches real auth, the real bot or the database.
 */

/**
 * Encode a value the way `@supabase/ssr` stores its auth cookie: a `base64-`
 * prefix followed by the base64url-encoded JSON session. This is the single most
 * version-sensitive piece of the harness; if a future `@supabase/ssr` changes
 * its cookie codec, only this function needs updating.
 */
function encodeSupabaseCookie(session: unknown): string {
  const json = JSON.stringify(session);
  const b64url = Buffer.from(json, "utf8").toString("base64url");
  return `base64-${b64url}`;
}

/**
 * Seed the browser context with a session cookie for the allowlisted test admin
 * so `middleware.ts` and the server guard admit it (R10.4, R10.6). The mock
 * Supabase server validates any presented session as this admin, so the exact
 * token value is irrelevant — only that a parseable session cookie is present.
 */
export async function setAdminSession(context: BrowserContext): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "e2e-access-token",
    token_type: "bearer",
    expires_in: 31_536_000,
    expires_at: nowSeconds + 31_536_000, // far future → no refresh attempt
    refresh_token: "e2e-refresh-token",
    user: {
      id: "e2e-admin-id-0000-0000-000000000000",
      aud: "authenticated",
      role: "authenticated",
      email: E2E_ADMIN_EMAIL,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2024-01-01T00:00:00.000Z",
    },
  };

  await context.addCookies([
    {
      name: SUPABASE_AUTH_COOKIE,
      value: encodeSupabaseCookie(session),
      url: APP_URL,
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}

/** Dispatch a deterministic realtime INSERT into the live feed (R9.2). */
export async function injectRealtimeInsert(page: Page, offer: PublicOffer): Promise<void> {
  await page.evaluate(
    ({ eventName, detail }) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    },
    { eventName: REALTIME_TEST_EVENT, detail: { kind: "insert", offer } },
  );
}

/** Dispatch a deterministic realtime UPDATE (e.g. price change) (R9.4). */
export async function injectRealtimeUpdate(page: Page, offer: PublicOffer): Promise<void> {
  await page.evaluate(
    ({ eventName, detail }) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    },
    { eventName: REALTIME_TEST_EVENT, detail: { kind: "update", offer } },
  );
}

/** Dispatch a deterministic realtime expiry/removal (R9.5). */
export async function injectRealtimeExpire(page: Page, offer: PublicOffer): Promise<void> {
  // Model expiry as the offer leaving the feed (the DELETE path / R9.5): the
  // reducer removes it by id. This is the unambiguous "offer disappears" signal.
  await page.evaluate(
    ({ eventName, detail }) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    },
    { eventName: REALTIME_TEST_EVENT, detail: { kind: "remove", id: offer.id } },
  );
}
