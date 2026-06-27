import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import fc from "fast-check";

import { absoluteSavings, toMoney } from "@/lib/utils/money";

/**
 * Property-based test for the absolute-savings money math.
 *
 * Feature: ofertas-reales-ia, Property 18: Cálculo de ahorro absoluto
 * Validates: Requirements 14.1
 *
 * Para cualquier oferta con precio original y actual presentes, el ahorro
 * absoluto mostrado es `original − current` calculado con aritmética decimal y
 * es siempre `>= 0`.
 */
describe("Property 18: Cálculo de ahorro absoluto", () => {
  /**
   * Bespoke generator: exact 2-decimal (centavos) MXN prices with
   * `original >= current >= 0`. Whole cents are generated and divided by 100
   * to obtain exact `Decimal` amounts free of floating-point error.
   */
  const priceFromCents = (cents: number): Decimal => new Decimal(cents).dividedBy(100);
  const centsArb = fc.integer({ min: 0, max: 999_999_999 }); // up to 9,999,999.99 MXN

  it("savings = original − current, savings >= 0, and savings + current === original", () => {
    // Feature: ofertas-reales-ia, Property 18: Cálculo de ahorro absoluto
    fc.assert(
      fc.property(centsArb, centsArb, (a, b) => {
        const original = priceFromCents(Math.max(a, b));
        const current = priceFromCents(Math.min(a, b));

        const savings = absoluteSavings(original, current);

        // 1) Exact decimal equality with `original − current`.
        expect(savings.equals(original.minus(current))).toBe(true);
        // 2) Never negative when `original >= current`.
        expect(savings.greaterThanOrEqualTo(0)).toBe(true);
        // 3) Exact reconstruction: `savings + current === original`.
        expect(savings.plus(current).equals(original)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("does not introduce floating-point drift on 0.1 + 0.2 style values", () => {
    // JavaScript floating point drifts: 0.1 + 0.2 === 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);

    // Decimal money math is exact.
    expect(toMoney("0.1").plus(toMoney("0.2")).equals(toMoney("0.3"))).toBe(true);

    const original = toMoney("0.30");
    const current = toMoney("0.10");
    const savings = absoluteSavings(original, current);
    expect(savings.equals(toMoney("0.20"))).toBe(true);
    expect(savings.plus(current).equals(original)).toBe(true);
  });
});
