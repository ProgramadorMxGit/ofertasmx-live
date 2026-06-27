import "server-only";

import { isAdminEmail } from "@/lib/admin/allowlist";
import { serverEnv } from "@/lib/env.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server-side admin session guard (R10.4, R10.6, R8.6).
 *
 * `server-only` so it can never reach the browser bundle. It reads the Supabase
 * Auth session from the request cookies (the anon `createServerSupabaseClient`)
 * and checks the user's email against the `ADMIN_EMAIL` allowlist with the pure
 * {@link isAdminEmail}. This is **defense in depth**: `middleware.ts` already
 * gates `/admin` and `/api/admin`, and these helpers re-verify on the server in
 * the admin pages and the `/api/admin/offers` route before any privileged read
 * or service-role write.
 *
 * Two shapes:
 *   - {@link getAdminAccess} distinguishes "no session" (401) from "not
 *     allowlisted" (403) so the API route can return the precise status.
 *   - {@link getAdminUser} collapses both to `null` for the pages, which simply
 *     redirect to the login screen.
 */

/** Authenticated admin identity used as the audit-log actor. */
export interface AdminUser {
  readonly email: string;
}

/** Outcome of the admin check, with a precise denial status for APIs. */
export type AdminAccess =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly status: 401 | 403 };

/**
 * Resolve the admin access decision from the session cookie. Returns
 * `{ ok: true, email }` for an authenticated allowlisted admin, `401` when
 * there is no authenticated user, and `403` when the user is authenticated but
 * their email is not in `ADMIN_EMAIL`. Any unexpected failure (e.g. an
 * unreachable auth endpoint) fails safe to `401`.
 */
export async function getAdminAccess(): Promise<AdminAccess> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email ?? null;
    if (!email) return { ok: false, status: 401 };
    if (!isAdminEmail(email, serverEnv.ADMIN_EMAIL)) {
      return { ok: false, status: 403 };
    }
    return { ok: true, email };
  } catch {
    // Fail safe: if we cannot prove the caller is an admin, deny.
    return { ok: false, status: 401 };
  }
}

/**
 * The authenticated admin, or `null` when the caller is not an allowlisted
 * admin (no session **or** not in `ADMIN_EMAIL`). Used by the admin pages, which
 * redirect to the login screen on `null`.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const access = await getAdminAccess();
  return access.ok ? { email: access.email } : null;
}
