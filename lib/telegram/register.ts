/**
 * Webhook registration core (R2).
 *
 * Pure-by-injection logic behind `scripts/register-telegram-webhook.ts`. The
 * script itself is a thin CLI wrapper that reads the environment + `argv` and
 * hands them to {@link runRegister}; all the testable behaviour lives here so
 * 15.2 can drive it with a mock `fetch` and a mock log sink — no real bot, no
 * network, no secrets.
 *
 * SECURITY (R2.4): the Bot Token and the `secret_token` are used **only** to
 * build the Telegram API URL / request body in memory. They are *never* printed.
 * Two layers guarantee this:
 *   1. the formatters ({@link formatSetWebhookLines}, {@link formatWebhookInfoLines})
 *      never include either value — the secret token is shown as
 *      "(configured, hidden)";
 *   2. {@link runRegister} additionally runs {@link maskSecretValues} over every
 *      emitted line, so even a value that somehow reached a message is masked
 *      (defence in depth).
 *
 * The token is read **only** from `TELEGRAM_BOT_TOKEN` (R2.1); a missing token
 * aborts before any request is made (R2.7). This is a CLI script, not a public
 * endpoint, so there is no unprotected way to register/delete the webhook (R2.6).
 */

import { maskSecretValues } from "@/lib/telegram/secret";

/**
 * The minimal set of update types the bot subscribes to (R2.3). Mirrors the
 * `allowed_updates` the webhook handler understands (`message`,
 * `edited_message`, `channel_post`, `edited_channel_post`).
 */
export const WEBHOOK_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
] as const;

/** Path the webhook is registered at, appended to the public site URL. */
export const WEBHOOK_PATH = "/api/telegram/webhook";

const DEFAULT_API_BASE_URL = "https://api.telegram.org";

/** Minimal subset of `Response` the registrar depends on. */
export interface RegisterResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Injected fetch. The CLI wraps the global `fetch`; tests pass a fake. */
export type RegisterFetchFn = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<RegisterResponseLike>;

/** Telegram API access bound to the Bot Token. */
export interface RegisterDeps {
  /** Bot Token — used ONLY to build the API URL in memory; never logged/returned. */
  token: string;
  /** Injected fetch (real `fetch` in the CLI, a fixture in tests). */
  fetch: RegisterFetchFn;
  /** Telegram API base. Defaults to `https://api.telegram.org`. */
  apiBaseUrl?: string;
}

/** Parameters for {@link setWebhook}. */
export interface SetWebhookParams {
  /** Full public webhook URL (`${siteUrl}/api/telegram/webhook`). */
  webhookUrl: string;
  /** The `secret_token` Telegram echoes back in the secret header (R2.2). */
  secretToken: string;
  /** Update types to enable. Defaults to {@link WEBHOOK_ALLOWED_UPDATES} (R2.3). */
  allowedUpdates?: readonly string[];
}

/** Discriminated result of {@link setWebhook}. Carries no secret. */
export type SetWebhookOutcome =
  | { ok: true; description: string | null }
  | { ok: false; reason: string };

/** A subset of Telegram's webhook info (R2.5). Carries no secret. */
export interface WebhookInfo {
  url: string | null;
  pendingUpdateCount: number | null;
  lastErrorMessage: string | null;
  lastErrorDate: number | null;
}

/** Discriminated result of {@link getWebhookInfo}. */
export type WebhookInfoOutcome =
  | { ok: true; info: WebhookInfo }
  | { ok: false; reason: string };

/** Shape of a Telegram API envelope `{ ok, result?, description? }`. */
interface TelegramEnvelope {
  ok: boolean;
  result: unknown;
  description: string | null;
}

function readEnvelope(payload: unknown): TelegramEnvelope {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, result: undefined, description: null };
  }
  const root = payload as Record<string, unknown>;
  return {
    ok: root.ok === true,
    result: root.result,
    description: typeof root.description === "string" ? root.description : null,
  };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Builds the public webhook URL from the site URL (R2.2). */
export function buildWebhookUrl(siteUrl: string): string {
  return `${trimTrailingSlashes(siteUrl)}${WEBHOOK_PATH}`;
}

/**
 * Registers the webhook via `setWebhook` with the URL, `secret_token` and the
 * minimal `allowed_updates` (R2.2, R2.3). The token is embedded in the request
 * URL (in memory) and the `secret_token` in the body; neither is ever returned.
 */
export async function setWebhook(
  params: SetWebhookParams,
  deps: RegisterDeps,
): Promise<SetWebhookOutcome> {
  const base = trimTrailingSlashes(deps.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const url = `${base}/bot${deps.token}/setWebhook`;
  const body = JSON.stringify({
    url: params.webhookUrl,
    secret_token: params.secretToken,
    allowed_updates: params.allowedUpdates ?? WEBHOOK_ALLOWED_UPDATES,
  });

  let response: RegisterResponseLike;
  try {
    response = await deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      reason: response.ok ? "invalid_response" : `http_${response.status}`,
    };
  }

  const envelope = readEnvelope(payload);
  if (!response.ok || !envelope.ok) {
    return { ok: false, reason: envelope.description ?? `http_${response.status}` };
  }
  return { ok: true, description: envelope.description };
}

/** Reads {@link WebhookInfo} from a `getWebhookInfo` result object. */
function readWebhookInfo(result: unknown): WebhookInfo | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  return {
    url: typeof r.url === "string" ? r.url : null,
    pendingUpdateCount:
      typeof r.pending_update_count === "number" ? r.pending_update_count : null,
    lastErrorMessage:
      typeof r.last_error_message === "string" ? r.last_error_message : null,
    lastErrorDate: typeof r.last_error_date === "number" ? r.last_error_date : null,
  };
}

/**
 * Reads the current webhook configuration via `getWebhookInfo` (R2.5): URL,
 * pending update count and last error. Returns no secret.
 */
export async function getWebhookInfo(deps: RegisterDeps): Promise<WebhookInfoOutcome> {
  const base = trimTrailingSlashes(deps.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const url = `${base}/bot${deps.token}/getWebhookInfo`;

  let response: RegisterResponseLike;
  try {
    response = await deps.fetch(url, { method: "GET" });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      reason: response.ok ? "invalid_response" : `http_${response.status}`,
    };
  }

  const envelope = readEnvelope(payload);
  if (!response.ok || !envelope.ok) {
    return { ok: false, reason: envelope.description ?? `http_${response.status}` };
  }
  const info = readWebhookInfo(envelope.result);
  if (info === null) {
    return { ok: false, reason: "invalid_response" };
  }
  return { ok: true, info };
}

/** Renders the `set` result as human-readable lines that never reveal secrets. */
export function formatSetWebhookLines(
  outcome: SetWebhookOutcome,
  webhookUrl: string,
): string[] {
  if (!outcome.ok) {
    return [`Failed to set webhook: ${outcome.reason}`];
  }
  const lines = [
    "Webhook registered successfully.",
    `  URL: ${webhookUrl}`,
    `  Allowed updates: ${WEBHOOK_ALLOWED_UPDATES.join(", ")}`,
    "  Secret token: (configured, hidden)",
  ];
  if (outcome.description !== null) {
    lines.push(`  Telegram: ${outcome.description}`);
  }
  return lines;
}

/** Renders the `status` result as human-readable lines (R2.5); no secrets. */
export function formatWebhookInfoLines(outcome: WebhookInfoOutcome): string[] {
  if (!outcome.ok) {
    return [`Failed to read webhook info: ${outcome.reason}`];
  }
  const { info } = outcome;
  return [
    "Webhook status:",
    `  URL: ${info.url !== null && info.url !== "" ? info.url : "(not set)"}`,
    `  Pending updates: ${info.pendingUpdateCount ?? 0}`,
    `  Last error: ${info.lastErrorMessage ?? "(none)"}`,
  ];
}

/** The supported CLI modes. */
export type RegisterMode = "set" | "status";

/** Options for {@link runRegister}. Everything effectful is injected. */
export interface RunRegisterOptions {
  /** `process.argv[2]` — `"set"` or `"status"`. */
  mode: string | undefined;
  /** Bot Token from `TELEGRAM_BOT_TOKEN` (may be `undefined`/empty at runtime). */
  token: string | undefined;
  /** `TELEGRAM_WEBHOOK_SECRET` — sent to Telegram, never printed. */
  webhookSecret: string;
  /** `NEXT_PUBLIC_SITE_URL` — used to build the webhook URL. */
  siteUrl: string;
  /** Injected fetch. */
  fetch: RegisterFetchFn;
  /** Output sink (the CLI passes `console.log`; tests pass a spy). */
  log: (line: string) => void;
  /** Telegram API base override (tests). */
  apiBaseUrl?: string;
}

/** Result of {@link runRegister}: the process exit code (0 ok, 1 failure). */
export interface RunRegisterResult {
  exitCode: number;
}

/**
 * Orchestrates the CLI (R2.1–R2.7). Reads the mode, requires the token, and runs
 * `set` or `status`. Every emitted line is passed through
 * {@link maskSecretValues} with the token + webhook secret, so neither can ever
 * appear in the output regardless of where it originated (R2.4).
 */
export async function runRegister(options: RunRegisterOptions): Promise<RunRegisterResult> {
  const { mode, token, webhookSecret, siteUrl, fetch, log, apiBaseUrl } = options;

  // Mask the bot token AND the webhook secret in every emitted line (R2.4),
  // belt-and-braces on top of formatters that already omit them.
  const secretValues = [token ?? "", webhookSecret].filter((value) => value.length > 0);
  const safeLog = (line: string): void => log(maskSecretValues(line, secretValues));

  // R2.1 / R2.7: the token comes only from TELEGRAM_BOT_TOKEN; abort clearly
  // (and before any network call) if it is missing.
  if (token === undefined || token.trim() === "") {
    safeLog(
      "Error: TELEGRAM_BOT_TOKEN is not set. Aborting without contacting Telegram.",
    );
    return { exitCode: 1 };
  }

  const deps: RegisterDeps = { token, fetch, apiBaseUrl };

  if (mode === "set") {
    const webhookUrl = buildWebhookUrl(siteUrl);
    const outcome = await setWebhook(
      {
        webhookUrl,
        secretToken: webhookSecret,
        allowedUpdates: WEBHOOK_ALLOWED_UPDATES,
      },
      deps,
    );
    for (const line of formatSetWebhookLines(outcome, webhookUrl)) safeLog(line);
    return { exitCode: outcome.ok ? 0 : 1 };
  }

  if (mode === "status") {
    const outcome = await getWebhookInfo(deps);
    for (const line of formatWebhookInfoLines(outcome)) safeLog(line);
    return { exitCode: outcome.ok ? 0 : 1 };
  }

  safeLog("Usage: register-telegram-webhook <set|status>");
  return { exitCode: 1 };
}
