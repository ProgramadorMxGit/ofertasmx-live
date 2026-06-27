import "server-only";

import { loadServerEnv, type ServerEnv } from "./env";

/**
 * Validated *server* environment (secrets + server-only config).
 *
 * `import "server-only"` makes any accidental import from a Client Component a
 * build error, so `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
 * `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` can never reach the browser
 * bundle (R27.2, R8.7).
 *
 * Validation runs at module load. In production a failure aborts startup with a
 * names-only message; outside production it degrades gracefully (R27.4, R27.5).
 * Import this from server modules only:
 *
 *   import { serverEnv } from "@/lib/env.server";
 */
export const serverEnv: ServerEnv = loadServerEnv();

export type { ServerEnv } from "./env";
