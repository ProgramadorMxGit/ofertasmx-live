import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Anon Supabase client for Server Components and Route Handlers (R8.5).
 *
 * Built with `@supabase/ssr`'s `createServerClient` using the cookie store, the
 * public project URL and the **anon** key — so it is fully subject to RLS (the
 * public read policy on `offers` etc., 0004_rls.sql). It never touches
 * `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * `import "server-only"` plus `next/headers` keep this module out of the browser
 * bundle: importing it from a Client Component is a build error. Passing
 * `<Database>` types every query/result; the return type is left inferred so it
 * matches the installed client's generic shape exactly.
 *
 * `cookies()` is async in Next.js 15, so this factory is async too.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` was called from a Server Component, where the cookie
            // store is read-only. Session refresh is handled by middleware, so
            // this is safe to ignore.
          }
        },
      },
    },
  );
}
