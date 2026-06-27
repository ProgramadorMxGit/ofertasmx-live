import { describe, expect, it } from "vitest";

import {
  HIDDEN_AMAZON_PRICE_CTA,
  priceDisplay,
  shouldHideAmazonPrice,
  type PriceFields,
} from "@/lib/offers/price-visibility";

/**
 * Example-based tests for the Amazon price-visibility gate (R22.2). The
 * universal behaviour is covered by Property 24; these pin the four concrete
 * platform × toggle combinations and the exact hidden CTA copy.
 */
describe("shouldHideAmazonPrice", () => {
  it("hides only when platform is amazon AND the toggle is off", () => {
    expect(shouldHideAmazonPrice("amazon", false)).toBe(true);
    expect(shouldHideAmazonPrice("amazon", true)).toBe(false);
    expect(shouldHideAmazonPrice("mercado_libre", false)).toBe(false);
    expect(shouldHideAmazonPrice("mercado_libre", true)).toBe(false);
  });
});

describe("priceDisplay", () => {
  const amazon: PriceFields = {
    platform: "amazon",
    current_price: 1299,
    original_price: 1999,
  };
  const ml: PriceFields = {
    platform: "mercado_libre",
    current_price: 899,
    original_price: null,
  };

  it("hides the Amazon price and shows the CTA when the toggle is off", () => {
    const display = priceDisplay(amazon, false);
    expect(display).toEqual({ kind: "hidden", cta: HIDDEN_AMAZON_PRICE_CTA });
  });

  it("shows the Amazon price when the toggle is on", () => {
    const display = priceDisplay(amazon, true);
    expect(display).toEqual({
      kind: "visible",
      currentPrice: 1299,
      originalPrice: 1999,
    });
  });

  it("always shows the Mercado Libre price, regardless of the toggle", () => {
    expect(priceDisplay(ml, false)).toEqual({
      kind: "visible",
      currentPrice: 899,
      originalPrice: null,
    });
    expect(priceDisplay(ml, true)).toEqual({
      kind: "visible",
      currentPrice: 899,
      originalPrice: null,
    });
  });
});
