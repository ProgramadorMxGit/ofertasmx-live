import "server-only";

import { serverEnv } from "@/lib/env.server";
import { getWebhookInfo, type RegisterFetchFn } from "@/lib/telegram/register";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Telegram webhook status snapshot for the admin view (Task 36 / R23.5, R10.3).
 *
 * `server-only` so the Bot Token never reaches the browser. It assembles three
 * things, **none of which ever include a secret**:
 *  1. the live webhook configuration via `getWebhookInfo` (URL, pending count,
 *     last error) — the register lib already strips the token from its outputs;
 *  2. the last received update from `telegram_updates` (received_at,
 *     update_type, processing_status);
 *  3. the count of recent errors (`processing_status = 'error'`) in the last 24h.
 *
 * Reads use the **service-role** client (after the caller has verified the admin
 * session) so the privileged `telegram_updates` table is readable regardless of
 * the exact RLS policy — the same pattern as `/api/admin/offers`.
 *
 * Degrades gracefully (R10.3): when no Bot Token is configured (e.g. local dev)
 * the webhook section reports `available: false` instead of throwing; when
 * Telegram is unreachable it reports `reachable: false` with a non-secret
 * reason; and if the database is unreachable the update stats fall back to
 * empty rather than erroring the whole view.
 */

/** The last update seen, projected to non-sensitive fields. */
export interface LastTelegramUpdate {
  receivedAt: string;
  updateType: string | null;
  processingStatus: string;
}

/** Live webhook configuration, or why it is unavailable. Never carries a token. */
export type WebhookConnection =
  | { available: false }
  | {
      available: true;
      reachable: true;
      url: string | null;
      pendingUpdateCount: number | null;
      lastErrorMessage: string | null;
      lastErrorDate: number | null;
    }
  | { available: true; reachable: false; error: string };

/** The full status snapshot rendered by the page and returned by the API. */
export interface TelegramStatus {
  webhook: WebhookConnection;
  lastUpdate: LastTelegramUpdate | null;
  recentErrorCount: number;
  recentWindowHours: number;
}

/** Rolling window (hours) used for the "recent errors" count (R23.5). */
const RECENT_WINDOW_HOURS = 24;

/** Minimal row shape read from `telegram_updates`. */
interface LastUpdateRow {
  received_at: string;
  update_type: string | null;
  processing_status: string;
}

/** Read the live webhook configuration, degrading without a token or network. */
async function readWebhookConnection(): Promise<WebhookConnection> {
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  // The env type says `string`, but a credential-free local/build env degrades
  // to the raw `process.env`, where the token may be absent — guard at runtime.
  if (typeof token !== "string" || token.trim() === "") {
    return { available: false };
  }

  const fetchFn: RegisterFetchFn = (url, init) => fetch(url, init);
  const outcome = await getWebhookInfo({ token, fetch: fetchFn });
  if (!outcome.ok) {
    return { available: true, reachable: false, error: outcome.reason };
  }
  const { info } = outcome;
  return {
    available: true,
    reachable: true,
    url: info.url,
    pendingUpdateCount: info.pendingUpdateCount,
    lastErrorMessage: info.lastErrorMessage,
    lastErrorDate: info.lastErrorDate,
  };
}

/** Read the last update + recent error count, degrading to empty on failure. */
async function readUpdateStats(): Promise<{
  lastUpdate: LastTelegramUpdate | null;
  recentErrorCount: number;
}> {
  try {
    const supabase = createServiceRoleClient();
    const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const [lastResult, errorResult] = await Promise.all([
      supabase
        .from("telegram_updates")
        .select("received_at, update_type, processing_status")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle<LastUpdateRow>(),
      supabase
        .from("telegram_updates")
        .select("update_id", { count: "exact", head: true })
        .eq("processing_status", "error")
        .gte("received_at", since),
    ]);

    const row = lastResult.data;
    return {
      lastUpdate: row
        ? {
            receivedAt: row.received_at,
            updateType: row.update_type,
            processingStatus: row.processing_status,
          }
        : null,
      recentErrorCount: errorResult.count ?? 0,
    };
  } catch {
    return { lastUpdate: null, recentErrorCount: 0 };
  }
}

/**
 * Assemble the {@link TelegramStatus} snapshot. Callers MUST verify the admin
 * session before invoking this (the page via `getAdminUser`, the API route via
 * `getAdminAccess`).
 */
export async function getTelegramWebhookStatus(): Promise<TelegramStatus> {
  const [webhook, stats] = await Promise.all([readWebhookConnection(), readUpdateStats()]);
  return {
    webhook,
    lastUpdate: stats.lastUpdate,
    recentErrorCount: stats.recentErrorCount,
    recentWindowHours: RECENT_WINDOW_HOURS,
  };
}
