import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { ingestUpdate } from "@/lib/telegram/ingest";

import {
  AMAZON_URL_OK,
  AUTHORIZED_CHAT_ID,
  buildUpdate,
  makeIngestDeps,
} from "../fixtures/telegram";

/**
 * Property-based test for idempotency by `update_id` under retries.
 *
 * Feature: ofertas-reales-ia, Property 12: Idempotencia por `update_id` ante reintentos
 * Validates: Requirements 1.12, 1.15
 *
 * Para cualquier actualización procesada una o varias veces (incluyendo
 * reintentos de Telegram tras un 5xx), el efecto es el mismo que procesarla una
 * sola vez: como máximo una oferta creada para ese update_id/message_id y un
 * estado terminal estable en telegram_updates. El primer intento inserta; los
 * reintentos se reconocen como duplicados.
 */

// A valid Amazon offer with arbitrary (but coherent) prices and ids, so the
// property holds across the input space, not just one fixed message.
const replayArb = fc.record({
  replays: fc.integer({ min: 1, max: 6 }),
  updateId: fc.integer({ min: 1, max: 1_000_000 }),
  messageId: fc.integer({ min: 1, max: 1_000_000 }),
  current: fc.integer({ min: 100, max: 5000 }),
  delta: fc.integer({ min: 50, max: 4000 }),
});

describe("Property 12: Idempotencia por `update_id` ante reintentos", () => {
  // Feature: ofertas-reales-ia, Property 12: Idempotencia por `update_id` ante reintentos
  // Validates: Requirements 1.12, 1.15
  it("replaying the same update N times creates at most one offer with a stable terminal status", async () => {
    await fc.assert(
      fc.asyncProperty(replayArb, async ({ replays, updateId, messageId, current, delta }) => {
        const original = current + delta; // guarantees original > current (R4.11)
        const text = [
          "Producto de prueba",
          `Antes $${original}`,
          `Ahora $${current}`,
          AMAZON_URL_OK,
        ].join("\n");
        const update = buildUpdate({
          updateId,
          messageId,
          chatId: AUTHORIZED_CHAT_ID,
          text,
        });

        const { deps, persistence } = makeIngestDeps();

        const outcomes: string[] = [];
        for (let attempt = 0; attempt < replays; attempt += 1) {
          const result = await ingestUpdate(update, deps);
          outcomes.push(result.outcome);
        }

        // Exactly one offer, regardless of how many times it was delivered.
        expect(persistence.offers).toHaveLength(1);
        expect(persistence.calls.insert).toBe(1);

        // First delivery inserts; every retry is recognized as a duplicate.
        expect(outcomes[0]).toBe("inserted");
        for (let attempt = 1; attempt < replays; attempt += 1) {
          expect(outcomes[attempt]).toBe("duplicate");
        }

        // The update reaches a stable terminal state.
        expect(persistence.updates.get(updateId)?.processing_status).toBe("processed");
      }),
      { numRuns: 150 },
    );
  });
});
