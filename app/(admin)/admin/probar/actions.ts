"use server";

import { getAdminUser } from "@/lib/admin/session";
import { serverEnv } from "@/lib/env.server";
import {
  analyzeTestMessage,
  type TestMessageAnalysis,
  type TestMessageInput,
} from "@/lib/telegram/test-message";

/**
 * Server Action behind the admin "Probar mensaje" panel (Task 35 / R23.6).
 *
 * A deliberately thin wrapper around the pure {@link analyzeTestMessage}:
 *  1. **Re-verify the admin session** (defense in depth beyond `middleware.ts`,
 *     R10.4) via {@link getAdminUser}; a lost/invalid session returns
 *     `unauthorized` so the client can prompt a re-login.
 *  2. Read the expected `AMAZON_TRACKING_ID` from the server env (never exposed
 *     to the client) and run the **same** parser/validator the webhook uses.
 *
 * It performs **no database writes** — there is no Supabase import in this path
 * at all — so the analysis is a pure preview. Nothing is published or stored
 * until an admin takes an explicit action elsewhere (R23.6).
 */

/** Result returned to the client: the analysis, or an auth failure. */
export type AnalyzeMessageResult = TestMessageAnalysis | { status: "unauthorized" };

export async function analyzeMessageAction(
  input: TestMessageInput,
): Promise<AnalyzeMessageResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return { status: "unauthorized" };
  }

  return analyzeTestMessage(
    { text: input.text ?? "", caption: input.caption ?? "" },
    { trackingId: serverEnv.AMAZON_TRACKING_ID },
  );
}
