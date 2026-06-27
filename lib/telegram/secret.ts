/**
 * Webhook secret comparison + secret-safe structured logging (R1.3, R1.4, R1.16,
 * R27.5).
 *
 * Two security primitives for the Telegram webhook, both pure (no I/O) and
 * therefore property-testable:
 *
 *  - {@link safeEqualSecret} — a constant-time string comparison built on
 *    `crypto.timingSafeEqual`. It compares the `X-Telegram-Bot-Api-Secret-Token`
 *    header against `TELEGRAM_WEBHOOK_SECRET` without leaking, through timing,
 *    how many leading characters matched. Different lengths return `false`
 *    safely (never throwing), since `timingSafeEqual` requires equal-length
 *    buffers (R1.3, R1.4).
 *
 *  - the redactor + {@link createSafeLogger} — a structured logger that can
 *    **never** emit the Bot Token, the webhook secret or the service-role key
 *    (R1.16, R27.5). Redaction happens two ways, defence in depth: by **key**
 *    (any field whose name looks secret is replaced) and by **value** (the
 *    known secret values are masked wherever they appear in the final line,
 *    even inside free-text messages). The value pass runs last over the whole
 *    serialized line, so a secret can never survive — not even one that slipped
 *    into a message string or a non-secret-named field.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret comparison (R1.3, R1.4).
 *
 * Returns `true` iff `a` and `b` are byte-for-byte equal. Unequal lengths
 * short-circuit to `false` *before* calling `timingSafeEqual` (which throws on
 * length mismatch), so this never throws. The early length check is not a
 * timing leak of the secret's content: an attacker already controls/knows the
 * length of the value they send, and the secret's own length is not derivable
 * from a single boolean. Equal-length inputs are compared in constant time, so
 * no information about *where* they differ leaks.
 */
export function safeEqualSecret(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

// ---------------------------------------------------------------------------
// Secret-safe structured logging (R1.16, R27.5)
// ---------------------------------------------------------------------------

/** Severity of a structured log record. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** A structured, secret-free log record. `context` carries technical fields only. */
export interface LogRecord {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Field names treated as secret-bearing. Matching is case-insensitive and also
 * matches when the name *contains* one of these tokens (so `botToken`,
 * `Authorization`, `x-telegram-bot-api-secret-token` all redact). Covers the
 * three protected env vars by name plus common credential field names.
 */
export const DEFAULT_SECRET_KEY_NAMES: readonly string[] = [
  "telegram_bot_token",
  "telegram_webhook_secret",
  "supabase_service_role_key",
  "service_role_key",
  "secret_token",
  "x-telegram-bot-api-secret-token",
  "authorization",
  "token",
  "secret",
  "password",
  "api_key",
  "apikey",
];

/** Marker substituted for a redacted field value. */
export const SECRET_MASK = "[REDACTED]";

/** Marker substituted for a masked secret *value* occurrence in free text. */
export const VALUE_MASK = "********";

/** Options shared by the redactor and the logger. */
export interface RedactorOptions {
  /**
   * Exact secret VALUES to mask wherever they occur in the output (e.g. the
   * runtime values of `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   * `SUPABASE_SERVICE_ROLE_KEY`). Empty/blank entries are ignored.
   */
  secretValues?: readonly string[];
  /** Extra field names to treat as secret, merged with {@link DEFAULT_SECRET_KEY_NAMES}. */
  secretKeyNames?: readonly string[];
}

function isSecretKey(key: string, secretKeyNames: readonly string[]): boolean {
  const lowered = key.toLowerCase();
  return secretKeyNames.some((name) => lowered.includes(name));
}

/**
 * Deep-redacts a value by **key name**: any object property whose name looks
 * secret has its value replaced with {@link SECRET_MASK}, recursively. Arrays
 * and nested objects are walked; primitives are returned unchanged. Pure: the
 * input is never mutated.
 */
export function redactByKey(
  value: unknown,
  secretKeyNames: readonly string[] = DEFAULT_SECRET_KEY_NAMES,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactByKey(item, secretKeyNames));
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      out[key] = isSecretKey(key, secretKeyNames)
        ? SECRET_MASK
        : redactByKey(val, secretKeyNames);
    }
    return out;
  }
  return value;
}

/**
 * Masks every occurrence of each known secret VALUE in `text` with
 * {@link VALUE_MASK}. Applied last over the fully serialized line so no secret
 * survives, regardless of where it appeared. Replacement uses a fixed mask that
 * shares no characters with realistic secrets, so masking can never re-introduce
 * a secret.
 */
export function maskSecretValues(text: string, secretValues: readonly string[]): string {
  let out = text;
  for (const secret of secretValues) {
    if (typeof secret !== "string" || secret.length === 0) continue;
    out = out.split(secret).join(VALUE_MASK);
  }
  return out;
}

/** Best-effort, never-throwing JSON serialization for a log line. */
function safeStringify(record: { level: LogLevel; message: string; context?: unknown }): string {
  try {
    return JSON.stringify(record);
  } catch {
    // Circular refs / BigInt / etc. — degrade to a flat, safe representation.
    return JSON.stringify({
      level: record.level,
      message: record.message,
      context: "[unserializable]",
    });
  }
}

/**
 * Produces the final, secret-free log line for a record (R1.16, R27.5).
 *
 * Order matters: redact by key first (structured secret fields → `[REDACTED]`),
 * serialize, then mask the known secret values over the whole line (so a secret
 * embedded in the `message` or under a non-secret-named field is still removed).
 * The returned string is guaranteed to contain none of the configured
 * `secretValues`.
 */
export function formatLogLine(record: LogRecord, options: RedactorOptions = {}): string {
  const secretKeyNames = [
    ...DEFAULT_SECRET_KEY_NAMES,
    ...(options.secretKeyNames ?? []),
  ];
  const secretValues = options.secretValues ?? [];

  const safeContext =
    record.context === undefined
      ? undefined
      : redactByKey(record.context, secretKeyNames);

  const line = safeStringify({
    level: record.level,
    message: record.message,
    context: safeContext,
  });

  return maskSecretValues(line, secretValues);
}

/** Where a {@link SafeLogger} writes formatted lines. Defaults to `console`. */
export type LogSink = (level: LogLevel, line: string) => void;

/** A structured logger that never emits configured secrets. */
export interface SafeLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  /** Exposes the redaction used by the logger (pure), for testing/reuse. */
  format(record: LogRecord): string;
}

const consoleSink: LogSink = (level, line) => {
  // Route to the matching console method; all output is already redacted.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
};

/**
 * Builds a {@link SafeLogger}. The webhook seeds `secretValues` with the three
 * protected env values so they are masked everywhere; the sink defaults to the
 * console but is injectable for tests.
 */
export function createSafeLogger(
  options: RedactorOptions & { sink?: LogSink } = {},
): SafeLogger {
  const { sink = consoleSink, ...redactorOptions } = options;
  const emit = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    sink(level, formatLogLine({ level, message, context }, redactorOptions));
  };
  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context),
    format: (record) => formatLogLine(record, redactorOptions),
  };
}
