import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  shouldEnablePremiumEffect,
  type PremiumEffectConditions,
} from "@/lib/ui/premium-effects";

/**
 * Property-based test for the premium-effect gate.
 *
 * Feature: ofertas-reales-ia, Property 19: Compuerta de efectos premium
 * Validates: Requirements 14.4, 14.5
 *
 * Para cualquier combinación de condiciones, los efectos premium se habilitan
 * si y solo si la tarjeta es destacada Y está en la primera fila Y el puntero
 * es preciso (`pointer: fine`) Y no hay `prefers-reduced-motion: reduce` Y no
 * hay `Save-Data`; basta una condición adversa para desactivarlos.
 */
describe("Property 19: Compuerta de efectos premium", () => {
  const boolArb = fc.boolean();

  it("is enabled iff featured AND first-row AND pointer-fine AND NOT reduced-motion AND NOT save-data", () => {
    // Feature: ofertas-reales-ia, Property 19: Compuerta de efectos premium
    fc.assert(
      fc.property(
        boolArb,
        boolArb,
        boolArb,
        boolArb,
        boolArb,
        (isFeatured, isFirstRow, pointerFine, reducedMotion, saveData) => {
          const conditions: PremiumEffectConditions = {
            isFeatured,
            isFirstRow,
            pointerFine,
            reducedMotion,
            saveData,
          };

          // Independent reference computed from the requirement text itself.
          const expected =
            isFeatured &&
            isFirstRow &&
            pointerFine &&
            !reducedMotion &&
            !saveData;

          expect(shouldEnablePremiumEffect(conditions)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("any single adverse condition disables the effect (exhaustive over the favorable base)", () => {
    // Feature: ofertas-reales-ia, Property 19: Compuerta de efectos premium
    const favorable: PremiumEffectConditions = {
      isFeatured: true,
      isFirstRow: true,
      pointerFine: true,
      reducedMotion: false,
      saveData: false,
    };
    // Flipping exactly one signal away from the favorable base must disable it.
    expect(shouldEnablePremiumEffect(favorable)).toBe(true);
    expect(shouldEnablePremiumEffect({ ...favorable, isFeatured: false })).toBe(false);
    expect(shouldEnablePremiumEffect({ ...favorable, isFirstRow: false })).toBe(false);
    expect(shouldEnablePremiumEffect({ ...favorable, pointerFine: false })).toBe(false);
    expect(shouldEnablePremiumEffect({ ...favorable, reducedMotion: true })).toBe(false);
    expect(shouldEnablePremiumEffect({ ...favorable, saveData: true })).toBe(false);
  });
});
