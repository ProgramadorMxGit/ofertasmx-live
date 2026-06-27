import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client for trusted server processes (R8.5).
 *
 * Uses the public project URL and `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses
 * RLS by design** — it is the only client allowed to write offers, persist
 * `telegram_updates`, upload images, record clicks and write audit logs.
 *
 * The boundary is enforced two ways so the key never reaches the browser
 * (R8.7):
 *   1. `import "server-only"` here makes any import from a Client Component a
 *      build error.
 *   2. The key is read from {@link serverEnv} (`lib/env.server`, also
 *      `server-only`), never inlined and never a `NEXT_PUBLIC_*` value.
 *
 * Auth persistence is disabled: this is a stateless server client with no user
 * session and no token refresh. Typed with the hand-written {@link Database}.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
