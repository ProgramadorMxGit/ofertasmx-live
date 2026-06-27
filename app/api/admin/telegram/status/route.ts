import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin/session";
import { getTelegramWebhookStatus } from "@/lib/telegram/status";

/**
 * `GET /api/admin/telegram/status` — webhook status for the admin (Task 36 /
 * R23.5, R10.2, R10.3).
 *
 * Re-verifies the admin session (defense in depth beyond `middleware.ts`): no
 * session → 401, not allowlisted → 403. Then returns the {@link TelegramStatus}
 * snapshot: the live webhook configuration (URL, pending count, last error), the
 * last received update and the recent error count. The Bot Token is used only
 * server-side to query Telegram and is **never** included in the response, which
 * is also why this runs on the Node.js runtime. A missing token or an
 * unreachable Telegram degrades to a status object (never a 500).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(): Promise<Response> {
  const access = await getAdminAccess();
  if (!access.ok) {
    return access.status === 401
      ? errorResponse(401, "unauthorized", "Inicia sesión para continuar.")
      : errorResponse(403, "forbidden", "Tu cuenta no tiene acceso de administrador.");
  }

  const status = await getTelegramWebhookStatus();
  return NextResponse.json(status);
}
