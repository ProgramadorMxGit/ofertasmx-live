/**
 * CLI: register / inspect the Telegram webhook (R2).
 *
 * Thin wrapper over {@link runRegister} in `@/lib/telegram/register` — all logic
 * and secret handling live there (and are unit-tested). This file only reads the
 * validated environment + `argv` and runs.
 *
 * Usage:
 *   tsx scripts/register-telegram-webhook.ts set      # configure the webhook
 *   tsx scripts/register-telegram-webhook.ts status   # show getWebhookInfo
 *
 * Environment: `TELEGRAM_BOT_TOKEN` (R2.1, required — aborts if missing, R2.7),
 * `TELEGRAM_WEBHOOK_SECRET` (sent as `secret_token`, R2.2) and
 * `NEXT_PUBLIC_SITE_URL` (the webhook URL). The token and secret are never
 * printed (R2.4). This is a CLI, not a public endpoint (R2.6).
 *
 * Note: this is a standalone Node CLI, so it reads the environment via
 * `loadServerEnv()` from `@/lib/env` — the *exact same* Zod validation that
 * `serverEnv` (`@/lib/env.server`) is built on — rather than importing
 * `@/lib/env.server` directly, whose `import "server-only"` guard throws when
 * loaded outside a Server Component (i.e. in a plain Node process).
 */

import { loadServerEnv, publicEnv } from "@/lib/env";
import {
  runRegister,
  type RegisterFetchFn,
  type RegisterResponseLike,
} from "@/lib/telegram/register";

/** Wrap the global `fetch` to the minimal shape the registrar expects. */
const fetchImpl: RegisterFetchFn = (url, init) =>
  fetch(url, init) as Promise<RegisterResponseLike>;

async function main(): Promise<void> {
  const serverEnv = loadServerEnv();
  const { exitCode } = await runRegister({
    mode: process.argv[2],
    token: serverEnv.TELEGRAM_BOT_TOKEN,
    webhookSecret: serverEnv.TELEGRAM_WEBHOOK_SECRET,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    fetch: fetchImpl,
    log: (line) => console.log(line),
  });
  process.exitCode = exitCode;
}

void main();
