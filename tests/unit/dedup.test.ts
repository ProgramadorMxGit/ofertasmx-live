import { describe, expect, it } from "vitest";

import {
  AUTHORIZED_CHAT_ID,
  resolveDuplicate,
  type CandidateIdentity,
  type OfferIdentity,
} from "@/lib/dedup/dedup";

/**
 * Example unit tests for the deduplication engine (R7.1, R7.3, R7.4, R7.5).
 *
 * `resolveDuplicate` is pure (no DB I/O): given an incoming offer identity and a
 * set of existing candidate identities, it resolves a match in priority order
 * (platform+external_product_id, ASIN, MLM, telegram_message_id within the
 * authorized chat, fingerprint) and returns an insert/update decision. The
 * universal guarantees live in `dedup.property.test.ts` (Property 11).
 */

function candidate(overrides: Partial<CandidateIdentity>): CandidateIdentity {
  return {
    id: "cand-1",
    platform: "amazon",
    externalProductId: "B08ABCDEFG",
    telegramChatId: AUTHORIZED_CHAT_ID,
    telegramMessageId: 100,
    fingerprint: "fp-base",
    ...overrides,
  };
}

function incoming(overrides: Partial<OfferIdentity>): OfferIdentity {
  return {
    platform: "amazon",
    externalProductId: "B08ABCDEFG",
    telegramChatId: AUTHORIZED_CHAT_ID,
    telegramMessageId: 100,
    fingerprint: "fp-base",
    ...overrides,
  };
}

describe("resolveDuplicate", () => {
  it("inserts when there are no candidates", () => {
    expect(resolveDuplicate(incoming({}), [])).toEqual({
      action: "insert",
      realtimeEvent: "INSERT",
    });
  });

  it("matches by platform + external id at the highest priority", () => {
    const decision = resolveDuplicate(incoming({}), [candidate({})]);
    expect(decision).toMatchObject({
      action: "update",
      matchedId: "cand-1",
      matchedBy: "platform_external_id",
      realtimeEvent: "UPDATE",
    });
  });

  it("matches by ASIN when the platform field does not line up", () => {
    const decision = resolveDuplicate(incoming({}), [candidate({ id: "c-asin", platform: null })]);
    expect(decision).toMatchObject({ action: "update", matchedId: "c-asin", matchedBy: "asin" });
  });

  it("matches by MLM for Mercado Libre identifiers", () => {
    const inc = incoming({ platform: "mercado_libre", externalProductId: "MLM123", fingerprint: "x" });
    const cand = candidate({
      id: "c-mlm",
      platform: null,
      externalProductId: "MLM123",
      fingerprint: "y",
      telegramMessageId: 999,
    });
    expect(resolveDuplicate(inc, [cand])).toMatchObject({
      action: "update",
      matchedId: "c-mlm",
      matchedBy: "mlm",
    });
  });

  it("matches by telegram_message_id within the authorized chat", () => {
    const inc = incoming({ externalProductId: null, fingerprint: "x", telegramMessageId: 555 });
    const cand = candidate({
      id: "c-msg",
      externalProductId: null,
      fingerprint: "y",
      telegramMessageId: 555,
    });
    expect(resolveDuplicate(inc, [cand])).toMatchObject({
      action: "update",
      matchedId: "c-msg",
      matchedBy: "telegram_message_id",
    });
  });

  it("does not match by message id outside the authorized chat", () => {
    const inc = incoming({
      externalProductId: null,
      fingerprint: "x",
      telegramChatId: 42,
      telegramMessageId: 7,
    });
    const cand = candidate({
      id: "c-msg",
      externalProductId: null,
      fingerprint: "y",
      telegramChatId: 42,
      telegramMessageId: 7,
    });
    expect(resolveDuplicate(inc, [cand])).toEqual({ action: "insert", realtimeEvent: "INSERT" });
  });

  it("matches by fingerprint as the lowest priority", () => {
    const inc = incoming({ externalProductId: null, telegramMessageId: 1, fingerprint: "shared" });
    const cand = candidate({
      id: "c-fp",
      externalProductId: null,
      telegramMessageId: 2,
      fingerprint: "shared",
    });
    expect(resolveDuplicate(inc, [cand])).toMatchObject({
      action: "update",
      matchedId: "c-fp",
      matchedBy: "fingerprint",
    });
  });

  it("inserts when nothing matches across any key", () => {
    const inc = incoming({
      externalProductId: "B08NOMATCH0",
      telegramMessageId: 1,
      fingerprint: "unique-a",
    });
    const cand = candidate({
      id: "c",
      externalProductId: "B08OTHER000",
      telegramMessageId: 2,
      fingerprint: "unique-b",
    });
    expect(resolveDuplicate(inc, [cand])).toEqual({ action: "insert", realtimeEvent: "INSERT" });
  });

  it("prefers the highest-priority key even when a lower one matches another candidate", () => {
    const inc = incoming({
      externalProductId: "B08ABCDEFG",
      telegramMessageId: 100,
      fingerprint: "shared",
    });
    const byFingerprint = candidate({
      id: "low",
      platform: "mercado_libre",
      externalProductId: "MLM999",
      telegramMessageId: 1,
      fingerprint: "shared",
    });
    const byPlatformId = candidate({
      id: "high",
      platform: "amazon",
      externalProductId: "B08ABCDEFG",
      telegramMessageId: 2,
      fingerprint: "other",
    });
    expect(resolveDuplicate(inc, [byFingerprint, byPlatformId])).toMatchObject({
      action: "update",
      matchedId: "high",
      matchedBy: "platform_external_id",
    });
  });

  it("signals UPDATE semantics: patch price/discount/dates and preserve slug+image", () => {
    const decision = resolveDuplicate(incoming({}), [candidate({})]);
    expect(decision.action).toBe("update");
    if (decision.action !== "update") return;
    expect(decision.realtimeEvent).toBe("UPDATE");
    expect(decision.patch).toEqual(
      expect.arrayContaining(["current_price", "discount_percent", "original_price"]),
    );
    expect(decision.preserve).toEqual(expect.arrayContaining(["slug", "image_url"]));
  });
});
