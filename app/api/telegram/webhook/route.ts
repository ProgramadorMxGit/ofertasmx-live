import { serverEnv } from "@/lib/env.server";
import { ingestUpdate } from "@/lib/telegram/ingest";
import { parseUpdate } from "@/lib/telegram/schema";
import { safeEqualSecret } from "@/lib/telegram/secret";
import {
  createProductionIngestDeps,
  createWebhookLogger,
} from "@/lib/telegram/webhook-deps";

/**
 * Telegram webhook route handler (R1).
 *
 * Runs on the **Node.js** runtime (not Edge): it needs `crypto.timingSafeEqual`
 * for the constant-time secret check and the service-role/`sharp` stack behind
 * the production deps. Only `POST` is exported, so Next.js answers any other
 * method with 405 without running this handler or reading the body (R1.1, R1.2).
 *
 * Guards run in strict order, each short-circuiting before the next:
 *   1. (method) non-POST → 405, handled by the framework.
 *   2. constant-time secret compare of `X-Telegram-Bot-Api-Secret-Token` vs
 *      `TELEGRAM_WEBHOOK_SECRET`; mismatch → 401, body never read (R1.3, R1.4).
 *   3. body-size limit → 413 before parsing (R1.5).
 *   4. Zod validation of the update shape → 400 + a technical log on failure
 *      (R1.6, R1.7).
 *   5. authorized-chat gate + idempotent processing inside {@link ingestUpdate}
 *      (R1.10–R1.14): every handled outcome (inserted/updated/duplicate/
 *      ignored/rejected) answers a fast 200.
 *   6. only a genuine internal failure (a port throws) → 5xx, so Telegram
 *      retries safely on top of `update_id` idempotency (R1.15).
 *
 * No secret is ever logged: the logger is seeded with the protected values and
 * masks them everywhere (R1.16).
 */
export const runtime = "nodejs";

/** Maximum accepted request body, rejected with 413 before parsing (R1.5). */
const MAX_BODY_BYTES = 1_000_000;

/** Telegram's secret header name (lowercased; header lookups are case-insensitive). */
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const logger = createWebhookLogger();

  // 2. Constant-time secret comparison (R1.3, R1.4) — before reading the body.
  const providedSecret = request.headers.get(SECRET_HEADER) ?? "";
  if (!safeEqualSecret(providedSecret, serverEnv.TELEGRAM_WEBHOOK_SECRET)) {
    logger.warn("telegram.webhook.unauthorized", { reason: "secret_mismatch" });
    return jsonResponse({ ok: false }, 401);
  }

  // 3. Body-size limit (R1.5). Check the advertised length first, then the real
  // byte length once read (a lying/absent header must not bypass the limit).
  const advertised = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(advertised) && advertised > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false }, 413);
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    logger.info("telegram.webhook.bad_request", { reason: "unreadable_body" });
    return jsonResponse({ ok: false }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false }, 413);
  }

  // 4. Zod validation before accessing any field (R1.6, R1.7).
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    logger.info("telegram.webhook.bad_request", { reason: "invalid_json" });
    return jsonResponse({ ok: false }, 400);
  }
  const parsed = parseUpdate(body);
  if (!parsed.ok) {
    // Technical event only: issue paths/codes, no personal data, no secrets (R1.7).
    logger.info("telegram.webhook.bad_request", {
      reason: "schema_validation_failed",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    });
    return jsonResponse({ ok: false }, 400);
  }

  // 5. + 6. Chat gate + idempotent processing (R1.10–R1.15).
  try {
    const result = await ingestUpdate(parsed.update, createProductionIngestDeps());
    return jsonResponse({ ok: true, outcome: result.outcome }, 200);
  } catch (error) {
    // A real internal failure → 5xx so Telegram retries; idempotency by
    // `update_id` guarantees the retry produces no duplicate (R1.15). The
    // message is masked of any secret value before it is written (R1.16).
    logger.error("telegram.webhook.internal_error", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonResponse({ ok: false }, 500);
  }
}
