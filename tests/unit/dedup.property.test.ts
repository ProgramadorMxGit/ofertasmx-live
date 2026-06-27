import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  AUTHORIZED_CHAT_ID,
  resolveDuplicate,
  type CandidateIdentity,
  type MatchKey,
  type OfferIdentity,
} from "@/lib/dedup/dedup";

/**
 * Property-based test for the deduplication engine.
 *
 * Feature: ofertas-reales-ia, Property 11: Deduplicación actualiza sin duplicar y emite UPDATE
 * Validates: Requirements 7.1, 7.3, 7.5
 *
 * Para cualquier oferta que corresponda a un producto ya existente (según el
 * orden de prioridad de criterios), el Motor de Deduplicación no inserta un
 * nuevo registro: se actualiza el registro existente y el cambio se propaga como
 * evento UPDATE (no INSERT). Cuando la oferta entrante comparte alguna clave de
 * identidad con un candidato, la decisión es `update` referenciando ese
 * candidato por la clave de mayor prioridad coincidente; en otro caso, `insert`.
 */

// Small domains so candidates and the incoming offer overlap frequently,
// exercising every priority key and the insert path.
const platformArb = fc.constantFrom("amazon" as const, "mercado_libre" as const, null);
const externalIdArb = fc.constantFrom(
  "B08ABCDEFG", // ASIN-shaped
  "B08ZZZZZZZ", // ASIN-shaped
  "MLM123", // MLM-shaped
  "MLM999", // MLM-shaped
  "weird-id", // neither shape
  null,
);
const messageIdArb = fc.constantFrom(100, 200, 300, null);
const chatIdArb = fc.constantFrom(AUTHORIZED_CHAT_ID, 42);
const fingerprintArb = fc.constantFrom("fp-a", "fp-b", "fp-c", "fp-d");

const identityArb: fc.Arbitrary<OfferIdentity> = fc.record({
  platform: platformArb,
  externalProductId: externalIdArb,
  telegramChatId: chatIdArb,
  telegramMessageId: messageIdArb,
  fingerprint: fingerprintArb,
});

const candidatesArb: fc.Arbitrary<CandidateIdentity[]> = fc
  .array(identityArb, { maxLength: 6 })
  .map((arr) => arr.map((id, index) => ({ ...id, id: `c${index}` })));

// --- Independent oracle: the priority order, re-derived from R7.1 ----------

const PRIORITY: readonly MatchKey[] = [
  "platform_external_id",
  "asin",
  "mlm",
  "telegram_message_id",
  "fingerprint",
];

function keyValue(id: OfferIdentity, key: MatchKey, chat: number): string | null {
  switch (key) {
    case "platform_external_id":
      return id.platform !== null && id.externalProductId !== null
        ? `${id.platform}\u0000${id.externalProductId}`
        : null;
    case "asin":
      return id.externalProductId !== null && /^[A-Z0-9]{10}$/.test(id.externalProductId)
        ? id.externalProductId
        : null;
    case "mlm":
      return id.externalProductId !== null && /^MLM\d+$/.test(id.externalProductId)
        ? id.externalProductId
        : null;
    case "telegram_message_id":
      return id.telegramChatId === chat && id.telegramMessageId !== null
        ? String(id.telegramMessageId)
        : null;
    case "fingerprint":
      return id.fingerprint !== "" ? id.fingerprint : null;
  }
}

type Expected =
  | { action: "insert" }
  | { action: "update"; matchedId: string; matchedBy: MatchKey };

function expectedDecision(
  incoming: OfferIdentity,
  candidates: readonly CandidateIdentity[],
  chat: number,
): Expected {
  for (const key of PRIORITY) {
    const value = keyValue(incoming, key, chat);
    if (value === null) continue;
    const match = candidates.find((candidate) => keyValue(candidate, key, chat) === value);
    if (match !== undefined) {
      return { action: "update", matchedId: match.id, matchedBy: key };
    }
  }
  return { action: "insert" };
}

describe("Property 11: Deduplicación actualiza sin duplicar y emite UPDATE", () => {
  // Feature: ofertas-reales-ia, Property 11: Deduplicación actualiza sin duplicar y emite UPDATE
  // Validates: Requirements 7.1, 7.3, 7.5
  it("matches the highest-priority shared key, or inserts when none is shared", () => {
    fc.assert(
      fc.property(identityArb, candidatesArb, (incoming, candidates) => {
        const decision = resolveDuplicate(incoming, candidates);
        const expected = expectedDecision(incoming, candidates, AUTHORIZED_CHAT_ID);

        expect(decision.action).toBe(expected.action);
        if (expected.action === "update" && decision.action === "update") {
          expect(decision.matchedBy).toBe(expected.matchedBy);
          expect(decision.matchedId).toBe(expected.matchedId);
        }
      }),
      { numRuns: 400 },
    );
  });

  // Feature: ofertas-reales-ia, Property 11: Deduplicación actualiza sin duplicar y emite UPDATE
  // Validates: Requirements 7.5
  it("emits UPDATE on a match and INSERT otherwise (never a new product on a duplicate)", () => {
    fc.assert(
      fc.property(identityArb, candidatesArb, (incoming, candidates) => {
        const decision = resolveDuplicate(incoming, candidates);
        if (decision.action === "update") {
          expect(decision.realtimeEvent).toBe("UPDATE");
        } else {
          expect(decision.realtimeEvent).toBe("INSERT");
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 11: Deduplicación actualiza sin duplicar y emite UPDATE
  // Validates: Requirements 7.3
  it("an update patches price/discount/dates while preserving slug and image", () => {
    fc.assert(
      fc.property(identityArb, candidatesArb, (incoming, candidates) => {
        const decision = resolveDuplicate(incoming, candidates);
        fc.pre(decision.action === "update");
        if (decision.action !== "update") return;
        expect(decision.patch).toContain("current_price");
        expect(decision.patch).toContain("discount_percent");
        expect(decision.preserve).toContain("slug");
        expect(decision.preserve).toContain("image_url");
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 11: Deduplicación actualiza sin duplicar y emite UPDATE
  // Validates: Requirements 7.1
  it("a candidate sharing the top-priority key is matched by platform_external_id", () => {
    const withExternal = fc.record({
      platform: fc.constantFrom("amazon" as const, "mercado_libre" as const),
      externalProductId: fc.constantFrom("B08ABCDEFG", "MLM123", "weird-id"),
      telegramChatId: chatIdArb,
      telegramMessageId: messageIdArb,
      fingerprint: fingerprintArb,
    });
    fc.assert(
      fc.property(withExternal, fc.array(identityArb, { maxLength: 3 }), (incoming, noise) => {
        const twin: CandidateIdentity = { ...incoming, id: "twin", fingerprint: "fp-other" };
        const candidates = [
          ...noise.map((id, index) => ({ ...id, id: `n${index}` })),
          twin,
        ];
        const decision = resolveDuplicate(incoming, candidates);
        expect(decision.action).toBe("update");
        if (decision.action === "update") {
          expect(decision.matchedBy).toBe("platform_external_id");
        }
      }),
      { numRuns: 200 },
    );
  });
});
