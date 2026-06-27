import { describe, expect, it, vi } from "vitest";

import {
  createSafeLogger,
  formatLogLine,
  safeEqualSecret,
  SECRET_MASK,
  VALUE_MASK,
} from "@/lib/telegram/secret";

/**
 * Example unit tests for the webhook secret utilities (Task 14.1), complementing
 * the property tests (Properties 14 and 15). They pin concrete behaviour of the
 * constant-time comparison and the redacting logger.
 */

describe("safeEqualSecret — examples", () => {
  it("is true for identical strings", () => {
    expect(safeEqualSecret("s3cr3t-token", "s3cr3t-token")).toBe(true);
  });

  it("is false for different strings of equal length", () => {
    expect(safeEqualSecret("aaaaaa", "aaaaab")).toBe(false);
  });

  it("is false (never throws) for different lengths", () => {
    expect(safeEqualSecret("short", "a-much-longer-secret")).toBe(false);
    expect(safeEqualSecret("", "x")).toBe(false);
  });

  it("is true for two empty strings", () => {
    expect(safeEqualSecret("", "")).toBe(true);
  });

  it("handles multi-byte unicode without throwing", () => {
    expect(safeEqualSecret("clé-€", "clé-€")).toBe(true);
    expect(safeEqualSecret("clé-€", "cle-€")).toBe(false);
  });
});

describe("formatLogLine — redaction", () => {
  const BOT_TOKEN = "123456:REAL-LOOKING-BOT-TOKEN";

  it("masks a secret value embedded in a free-text message", () => {
    const line = formatLogLine(
      { level: "error", message: `boom with ${BOT_TOKEN} inside` },
      { secretValues: [BOT_TOKEN] },
    );
    expect(line).not.toContain(BOT_TOKEN);
    expect(line).toContain(VALUE_MASK);
  });

  it("redacts values under secret-named keys even without knowing the value", () => {
    const line = formatLogLine({
      level: "info",
      message: "auth attempt",
      context: { authorization: "Bearer xyz", nested: { secret_token: "abc" }, ok: "visible" },
    });
    expect(line).toContain(SECRET_MASK);
    expect(line).not.toContain("Bearer xyz");
    expect(line).not.toContain("abc");
    // Non-secret fields survive.
    expect(line).toContain("visible");
  });

  it("masks a secret value even under a non-secret-named field", () => {
    const line = formatLogLine(
      { level: "warn", message: "leak", context: { harmless_label: BOT_TOKEN } },
      { secretValues: [BOT_TOKEN] },
    );
    expect(line).not.toContain(BOT_TOKEN);
  });
});

describe("createSafeLogger", () => {
  it("writes redacted lines to the injected sink", () => {
    const sink = vi.fn();
    const secret = "WEBHOOK-SECRET-VALUE";
    const logger = createSafeLogger({ secretValues: [secret], sink });

    logger.error("failed", { secret_token: secret, detail: `echo ${secret}` });

    expect(sink).toHaveBeenCalledTimes(1);
    const [level, line] = sink.mock.calls[0];
    expect(level).toBe("error");
    expect(line).not.toContain(secret);
  });
});
