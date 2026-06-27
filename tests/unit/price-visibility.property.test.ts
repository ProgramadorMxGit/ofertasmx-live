import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  HIDDEN_AMAZON_PRICE_CTA,
  priceDisplay,
  shouldHideAmazonPrice,
  type PriceFields,
} from "@/lib/offers/price-visibility";
import { OFFER_PLATFORMS } from "@/lib/offers/query";

/**
 * Property-based test for the Amazon price-visibility gate.
 *
 * Feature: ofertas-reales-ia, Property 24: Ocultación de precios de Amazon según conmutador
 * Validates: Requirements 22.2
 *
 * Para cualquier plataforma y cualquier valor del conmutador
 * `SHOW_AMAZON_PRICES`, el valor numérico del precio se muestra si y solo si
 * NO (plataforma === "amazon" Y conmutador desactivado). Cuando se oculta, la
 * presentación no contiene ningún precio numérico y expone el texto
 * "Consulta el precio actual en Amazon".
 */
describe("Property 24: Ocultación de precios de Amazon según conmutador", () => {
  /** Exact 2-decimal (centavos) MXN amount from whole cents. */
  const priceArb = fc
    .integer({ min: 0, max: 999_999_999 })
    .map((cents) => cents / 100);

  /** Arbitrary offer price fields + the toggle. */
  const caseArb = fc.record({
    platform: fc.constantFrom(...OFFER_PLATFORMS),
    current_price: priceArb,
    original_price: fc.option(priceArb, { nil: null }),
    showAmazonPrices: fc.boolean(),
  });

  it("shows the numeric price iff NOT (amazon AND toggle off)", () => {
    // Feature: ofertas-reales-ia, Property 24: Ocultación de precios de Amazon según conmutador
    fc.assert(
      fc.property(caseArb, ({ platform, current_price, original_price, showAmazonPrices }) => {
        const offer: PriceFields = { platform, current_price, original_price };
        const expectedHidden = platform === "amazon" && showAmazonPrices === false;

        // The pure gate agrees with the definition.
        expect(shouldHideAmazonPrice(platform, showAmazonPrices)).toBe(expectedHidden);

        const display = priceDisplay(offer, showAmazonPrices);
        expect(display.kind === "hidden").toBe(expectedHidden);

        if (display.kind === "visible") {
          // Visible: the numeric price is present and unchanged.
          expect(display.currentPrice).toBe(current_price);
          expect(display.originalPrice).toBe(original_price);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("when hidden, the display carries NO numeric price, only the Amazon CTA", () => {
    // Feature: ofertas-reales-ia, Property 24: Ocultación de precios de Amazon según conmutador
    fc.assert(
      fc.property(caseArb, ({ platform, current_price, original_price, showAmazonPrices }) => {
        const offer: PriceFields = { platform, current_price, original_price };
        const display = priceDisplay(offer, showAmazonPrices);

        if (display.kind === "hidden") {
          // Structurally impossible to render a numeric price from this variant.
          expect(display).toEqual({ kind: "hidden", cta: HIDDEN_AMAZON_PRICE_CTA });
          expect("currentPrice" in display).toBe(false);
          expect("originalPrice" in display).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("Mercado Libre is never affected by the toggle", () => {
    // Feature: ofertas-reales-ia, Property 24: Ocultación de precios de Amazon según conmutador
    fc.assert(
      fc.property(priceArb, fc.option(priceArb, { nil: null }), fc.boolean(), (current, original, toggle) => {
        const offer: PriceFields = {
          platform: "mercado_libre",
          current_price: current,
          original_price: original,
        };
        expect(shouldHideAmazonPrice("mercado_libre", toggle)).toBe(false);
        expect(priceDisplay(offer, toggle).kind).toBe("visible");
      }),
      { numRuns: 200 },
    );
  });
});
