import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { ingestUpdate } from "@/lib/telegram/ingest";

import {
  AUTHORIZED_CHAT_ID,
  buildUpdate,
  makeIngestDeps,
  offerText,
} from "../fixtures/telegram";

/**
 * Property-based test for the Authorized-Chat gate.
 *
 * Feature: ofertas-reales-ia, Property 13: Compuerta de Chat Autorizado
 * Validates: Requirements 1.10, 1.11
 *
 * Para cualquier chat.id, el Sistema procesa la oferta si y solo si
 * chat.id === 5054325626; en cualquier otro caso no crea oferta (no persiste
 * datos) y solo registra un evento técnico (ignored).
 */

// Mostly arbitrary chat ids, but include the authorized one frequently so both
// branches are well covered.
const chatIdArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(AUTHORIZED_CHAT_ID) },
  { weight: 3, arbitrary: fc.integer() },
);

describe("Property 13: Compuerta de Chat Autorizado", () => {
  // Feature: ofertas-reales-ia, Property 13: Compuerta de Chat Autorizado
  // Validates: Requirements 1.10, 1.11
  it("creates an offer iff chat.id === 5054325626, otherwise ignores with no persistence", async () => {
    await fc.assert(
      fc.asyncProperty(chatIdArb, async (chatId) => {
        const { deps, persistence } = makeIngestDeps();
        const update = buildUpdate({ chatId, text: offerText() });

        const result = await ingestUpdate(update, deps);

        if (chatId === AUTHORIZED_CHAT_ID) {
          expect(result.outcome).toBe("inserted");
          expect(persistence.offers).toHaveLength(1);
        } else {
          expect(result.outcome).toBe("ignored");
          expect(result.reason).toBe("unauthorized_chat");
          // Nothing persisted at all for a foreign chat (no payload, no offer).
          expect(persistence.offers).toHaveLength(0);
          expect(persistence.updates.size).toBe(0);
          expect(persistence.calls.insert).toBe(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});
