import { describe, expect, it } from "vitest";

import {
  shouldEnablePremiumEffect,
  type PremiumEffectConditions,
} from "@/lib/ui/premium-effects";

/**
 * Example unit tests for the premium-effect gate (Task 22.1 / R14.4, R14.5).
 *
 * The gate is pure boolean logic: effects are enabled IFF the card is featured
 * AND in the first row AND the pointer is fine AND there is no reduced-motion
 * preference AND no Save-Data. Broad coverage (the exhaustive "iff" rule) lives
 * in the companion property test (`premium-effects.property.test.ts`).
 */

/** The single combination where all conditions favor enabling effects. */
const ALL_ENABLED: PremiumEffectConditions = {
  isFeatured: true,
  isFirstRow: true,
  pointerFine: true,
  reducedMotion: false,
  saveData: false,
};

describe("shouldEnablePremiumEffect", () => {
  it("enables effects only when every condition is favorable", () => {
    expect(shouldEnablePremiumEffect(ALL_ENABLED)).toBe(true);
  });

  it("disables effects for a non-featured card", () => {
    expect(shouldEnablePremiumEffect({ ...ALL_ENABLED, isFeatured: false })).toBe(false);
  });

  it("disables effects for a card outside the first row", () => {
    expect(shouldEnablePremiumEffect({ ...ALL_ENABLED, isFirstRow: false })).toBe(false);
  });

  it("disables effects for a coarse pointer (touch)", () => {
    expect(shouldEnablePremiumEffect({ ...ALL_ENABLED, pointerFine: false })).toBe(false);
  });

  it("disables effects when reduced-motion is requested (R14.5)", () => {
    expect(shouldEnablePremiumEffect({ ...ALL_ENABLED, reducedMotion: true })).toBe(false);
  });

  it("disables effects when Save-Data is active (R14.5)", () => {
    expect(shouldEnablePremiumEffect({ ...ALL_ENABLED, saveData: true })).toBe(false);
  });
});
