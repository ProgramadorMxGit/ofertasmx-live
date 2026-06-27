import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Anon Supabase client for the browser (Client Components, Realtime hooks).
 *
 * Built with `@supabase/ssr`'s `createBrowserClient` using only the public URL
 * and **anon** key, so it is subject to RLS: the browser receives only rows it
 * is allowed to see (active offers, the category catalog). It must never carry
 * a server secret — there is intentionally no `server-only` import and no
 * reference to `SUPABASE_SERVICE_ROLE_KEY` here (R8.7).
 *
 * `createBrowserClient` is a singleton by default, so repeated calls reuse the
 * same underlying client. Passing `<Database>` types every query and result;
 * the return type is left inferred so it tracks the installed client's generic
 * shape exactly.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Whether the public Supabase env is present and usable in the browser.
 *
 * Realtime and admin auth are **progressive enhancements** (R9.1): without
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
 * `createBrowserClient` throws "Your project's URL and API key are required",
 * which crashes any Client Component that builds a client during render (the
 * live-offers feed, the admin login). Callers use this guard to skip client
 * creation and degrade gracefully instead of throwing.
 *
 * Pure and default-bound to `publicEnv` (the same pattern as `validateEnv` /
 * `loadServerEnv` in `lib/env.ts`), so it is unit-testable with a synthetic
 * source. The values are typed `string`, but the dev/build env loader degrades
 * to the raw `process.env` (possibly `undefined`) when validation fails, so the
 * runtime `typeof` checks are deliberate, not redundant.
 */
export function isSupabaseBrowserConfigured(
  env: {
    NEXT_PUBLIC_SUPABASE_URL?: unknown;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: unknown;
  } = publicEnv,
): boolean {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof url !== "string" || url.length === 0) return false;
  if (typeof key !== "string" || key.length === 0) return false;
  try {
    // A malformed URL would make `createBrowserClient` throw too; only http(s)
    // is a usable Supabase endpoint (hosted https, or http://localhost for the
    // local stack).
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
