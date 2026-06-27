import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { safeEqualSecret } from "@/lib/telegram/secret";

/**
 * Property-based test for the constant-time secret comparison.
 *
 * Feature: ofertas-reales-ia, Property 14: Comparación de secreto en tiempo constante equivale a igualdad
 * Validates: Requirements 1.3, 1.4
 *
 * Para cualquier par de cadenas (a, b), la comparación de tiempo constante
 * devuelve verdadero si y solo si a y b son iguales, manejando con seguridad
 * longitudes distintas (sin lanzar excepción).
 */

// Generates pairs that are sometimes equal and sometimes arbitrary (so both the
// equal and the unequal/different-length branches are exercised).
const pairArb: fc.Arbitrary<{ a: string; b: string }> = fc.string().chain((a) =>
  fc.oneof(
    fc.constant({ a, b: a }), // equal
    fc.string().map((b) => ({ a, b })), // arbitrary (usually unequal; varied lengths)
    fc.string({ minLength: 1, maxLength: 4 }).map((suffix) => ({ a, b: a + suffix })), // prefix match, longer
  ),
);

describe("Property 14: Comparación de secreto en tiempo constante equivale a igualdad", () => {
  // Feature: ofertas-reales-ia, Property 14: Comparación de secreto en tiempo constante equivale a igualdad
  // Validates: Requirements 1.3, 1.4
  it("returns true iff the strings are equal, never throwing on length mismatch", () => {
    fc.assert(
      fc.property(pairArb, ({ a, b }) => {
        expect(safeEqualSecret(a, b)).toBe(a === b);
      }),
      { numRuns: 500 },
    );
  });
});
