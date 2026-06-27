import { describe, expect, it } from "vitest";

import {
  EnvValidationError,
  publicSchema,
  serverSchema,
  validateEnv,
} from "@/lib/env";

/**
 * Unit tests for environment validation (R27.4, R27.5).
 *
 * These exercise the pure `validateEnv` helper with synthetic records, so the
 * validation logic is tested without importing the real `process.env`.
 */

// Recognizable fake secret values. If any of these ever appears in an error
// message, a secret leaked (R27.5). They are not real credentials.
const FAKE_SERVICE_ROLE_KEY = "fake-service-role-KEY-DO-NOT-LEAK-0123456789";
const FAKE_BOT_TOKEN = "fake-bot-TOKEN-DO-NOT-LEAK-0123456789";
const FAKE_WEBHOOK_SECRET = "fake-webhook-SECRET-DO-NOT-LEAK-0123456789";
const FAKE_CRON_SECRET = "fake-cron-SECRET-DO-NOT-LEAK-0123456789";

function validServerSource(): Record<string, unknown> {
  return {
    SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: FAKE_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    TELEGRAM_ALLOWED_CHAT_ID: "5054325626",
    ADMIN_EMAIL: "admin@example.com",
    AMAZON_TRACKING_ID: "programadormx-20",
    SHOW_AMAZON_PRICES: "true",
    CRON_SECRET: FAKE_CRON_SECRET,
  };
}

function validPublicSource(): Record<string, unknown> {
  return {
    NEXT_PUBLIC_SITE_URL: "https://programadormx.online",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-secret",
    NEXT_PUBLIC_WHATSAPP_INVITE_URL: "https://chat.whatsapp.com/LoPk1kbvquFAA8xG8MXRDS",
  };
}

/** Run `fn`, returning the thrown error or failing if it does not throw. */
function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the function to throw, but it returned normally");
}

describe("validateEnv — valid input", () => {
  it("parses a complete, valid server environment and coerces types", () => {
    const env = validateEnv(serverSchema, validServerSource());

    expect(env.TELEGRAM_ALLOWED_CHAT_ID).toBe(5054325626);
    expect(env.SHOW_AMAZON_PRICES).toBe(true);
    expect(env.AMAZON_TRACKING_ID).toBe("programadormx-20");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(FAKE_SERVICE_ROLE_KEY);
  });

  it("applies defaults for AMAZON_TRACKING_ID and SHOW_AMAZON_PRICES", () => {
    const source = validServerSource();
    delete source.AMAZON_TRACKING_ID;
    delete source.SHOW_AMAZON_PRICES;

    const env = validateEnv(serverSchema, source);

    expect(env.AMAZON_TRACKING_ID).toBe("programadormx-20");
    expect(env.SHOW_AMAZON_PRICES).toBe(true);
  });

  it("coerces SHOW_AMAZON_PRICES='false' to boolean false", () => {
    const source = validServerSource();
    source.SHOW_AMAZON_PRICES = "false";

    const env = validateEnv(serverSchema, source);

    expect(env.SHOW_AMAZON_PRICES).toBe(false);
  });

  it("parses a complete, valid public environment", () => {
    const env = validateEnv(publicSchema, validPublicSource());

    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://programadormx.online");
  });
});

describe("validateEnv — missing required variables (R27.4)", () => {
  it("throws an EnvValidationError naming a single missing variable", () => {
    const source = validServerSource();
    delete source.TELEGRAM_BOT_TOKEN;

    const error = captureError(() => validateEnv(serverSchema, source));

    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).message).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("names every missing required variable", () => {
    const error = captureError(() => validateEnv(serverSchema, {}));

    expect(error).toBeInstanceOf(EnvValidationError);
    const reported = (error as EnvValidationError).variables.join(" ");
    for (const name of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_ALLOWED_CHAT_ID",
      "ADMIN_EMAIL",
      "CRON_SECRET",
    ]) {
      expect(reported).toContain(name);
    }
  });

  it("names an invalid public URL variable", () => {
    const source = validPublicSource();
    source.NEXT_PUBLIC_SITE_URL = "not-a-url";

    const error = captureError(() => validateEnv(publicSchema, source));

    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).message).toContain("NEXT_PUBLIC_SITE_URL");
  });
});

describe("validateEnv — secrets never leak (R27.5)", () => {
  it("excludes secret values from the error message", () => {
    const source = validServerSource();
    // All secrets are present (with fake sentinel values); break a non-secret
    // field so validation fails and the error formatter runs over the source.
    source.TELEGRAM_ALLOWED_CHAT_ID = "not-a-number";

    const error = captureError(() => validateEnv(serverSchema, source));
    const message = (error as EnvValidationError).message;

    // The failing variable is named...
    expect(message).toContain("TELEGRAM_ALLOWED_CHAT_ID");
    // ...but no secret VALUE appears anywhere in the message.
    expect(message).not.toContain(FAKE_SERVICE_ROLE_KEY);
    expect(message).not.toContain(FAKE_BOT_TOKEN);
    expect(message).not.toContain(FAKE_WEBHOOK_SECRET);
    expect(message).not.toContain(FAKE_CRON_SECRET);
  });

  it("excludes a secret's own value when that secret is invalid", () => {
    const source = validServerSource();
    // Make a secret invalid by giving it a present-but-empty value, while a
    // sentinel-bearing secret stays valid; neither value may appear.
    source.SUPABASE_SERVICE_ROLE_KEY = "";

    const error = captureError(() => validateEnv(serverSchema, source));
    const message = (error as EnvValidationError).message;

    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(message).not.toContain(FAKE_BOT_TOKEN);
    expect(message).not.toContain(FAKE_WEBHOOK_SECRET);
    expect(message).not.toContain(FAKE_CRON_SECRET);
  });
});
