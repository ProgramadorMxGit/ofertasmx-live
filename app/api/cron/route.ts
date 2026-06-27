import { serverEnv } from "@/lib/env.server";
import { runCronMaintenance } from "@/lib/telegram/cron";
import { createProductionCronDeps } from "@/lib/telegram/cron-deps";
import { createSafeLogger, safeEqualSecret } from "@/lib/telegram/secret";

/**
 * Vercel Cron maintenance route (R3.8, R9.9, R9.10).
 *
 * Runs on the **Node.js** runtime (the production deps pull in the service-role
 * client + `sharp`). It performs two jobs on each tick (see
 * `lib/telegram/cron.ts`): retry `pending`/`failed` images with a backoff, and
 * expire `active` offers whose `expires_at` has passed (null `expires_at` is
 * never expired). The resulting offer UPDATEs propagate to clients via Supabase
 * Realtime automatically.
 *
 * AUTH: the route is protected by `CRON_SECRET` (R-security). Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>` automatically when the `CRON_SECRET` env
 * var is set (configured in `vercel.json`), so the header is compared against
 * `Bearer <CRON_SECRET>` in constant time; any mismatch (or a manual,
 * unauthenticated call) gets 401. The secret is never logged.
 */
export const runtime = "nodejs";

const BEARER_PREFIX = "Bearer ";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Constant-time check of the `Authorization: Bearer <CRON_SECRET>` header. */
function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("authorization") ?? "";
  return safeEqualSecret(provided, `${BEARER_PREFIX}${serverEnv.CRON_SECRET}`);
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return jsonResponse({ ok: false }, 401);
  }

  const logger = createSafeLogger({
    secretValues: [serverEnv.CRON_SECRET, serverEnv.SUPABASE_SERVICE_ROLE_KEY],
  });

  try {
    const result = await runCronMaintenance(createProductionCronDeps());
    logger.info("cron.maintenance.done", {
      images_attempted: result.imagesAttempted,
      images_recovered: result.imagesRecovered,
      images_failed: result.imagesFailed,
      images_skipped: result.imagesSkipped,
      offers_expired: result.offersExpired,
    });
    return jsonResponse(
      {
        ok: true,
        imagesAttempted: result.imagesAttempted,
        imagesRecovered: result.imagesRecovered,
        imagesFailed: result.imagesFailed,
        imagesSkipped: result.imagesSkipped,
        offersExpired: result.offersExpired,
      },
      200,
    );
  } catch (error) {
    // The message is masked of any secret value before it is written (R1.16).
    logger.error("cron.maintenance.error", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ ok: false }, 500);
  }
}

/** Vercel Cron triggers GET; manual invocation may use POST. Both share `handle`. */
export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
