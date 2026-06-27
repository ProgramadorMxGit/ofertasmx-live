import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmail } from "@/lib/admin/allowlist";

/**
 * Admin access-control middleware (R10.2, R10.4, R10.5, R10.6).
 *
 * Runs on every `/admin/**` and `/api/admin/**` request (see {@link config}).
 * It uses `@supabase/ssr`'s `createServerClient` wired to the request/response
 * cookies to **refresh the Supabase Auth session**, then enforces the gate:
 *
 *   1. Read the user from the (refreshed) session.
 *   2. If there is no session, or the user's email is **not** in `ADMIN_EMAIL`
 *      (the comma-separated allowlist, R10.6), deny:
 *        - pages           → 302 redirect to `/admin/login?redirect=<original>`
 *        - `/api/admin/**` → `401` (no session) / `403` (not allowlisted) JSON.
 *   3. Otherwise forward the request, carrying the refreshed cookies.
 *
 * The login page (`/admin/login`) is intentionally **ungated** so it stays
 * reachable without a session (R10.5 keeps admin routes out of the public nav,
 * but login must be reachable). Its session is still refreshed so a user who
 * just authenticated is recognized on return. Static assets are never matched
 * because the matcher only targets `/admin` and `/api/admin`.
 *
 * Env: the public Supabase URL/anon key and the server-only `ADMIN_EMAIL` are
 * read from `process.env` (available to middleware at runtime). Membership is
 * decided by the pure {@link isAdminEmail}. If the public Supabase env is
 * missing (e.g. a credential-free build), the middleware fails safe and denies
 * access to protected surfaces.
 */

const LOGIN_PATH = "/admin/login";

/** Whether the path is under the admin API surface (`/api/admin/**`). */
function isAdminApiPath(pathname: string): boolean {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

/** Build the denial response: JSON 401/403 for APIs, login redirect for pages. */
function denyAccess(request: NextRequest, reason: "no_session" | "forbidden"): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (isAdminApiPath(pathname)) {
    const status = reason === "no_session" ? 401 : 403;
    const code = reason === "no_session" ? "unauthorized" : "forbidden";
    const message =
      reason === "no_session"
        ? "Inicia sesión para continuar."
        : "Tu cuenta no tiene acceso de administrador.";
    return NextResponse.json({ error: { code, message } }, { status });
  }

  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = "";
  url.searchParams.set("redirect", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === LOGIN_PATH;

  // Forward the request and let cookie refresh mutate this response.
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without the public Supabase env we cannot verify a session. The login page
  // stays reachable; every other admin surface fails safe (denied).
  if (!supabaseUrl || !supabaseAnonKey) {
    return isLogin ? response : denyAccess(request, "no_session");
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh + read the session (R10.4). Never throws into the request path.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The login page is ungated — but its session was refreshed above so a
  // freshly-authenticated visitor is recognized when they return here.
  if (isLogin) return response;

  const email = user?.email ?? null;
  if (!email) return denyAccess(request, "no_session");
  if (!isAdminEmail(email, process.env.ADMIN_EMAIL)) {
    return denyAccess(request, "forbidden");
  }

  // Authenticated, allowlisted admin → allow, carrying the refreshed cookies.
  return response;
}

/**
 * Match only the protected surfaces. `/admin/:path*` covers the dashboard
 * (`/admin`) and every nested admin page; `/api/admin/:path*` covers the admin
 * APIs. The login page is matched too but handled as an ungated special case in
 * {@link middleware}; static assets fall outside these prefixes entirely.
 */
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
