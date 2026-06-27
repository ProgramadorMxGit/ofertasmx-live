import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { shouldHideAmazonPrice } from "@/lib/offers/price-visibility";
import { OFFER_PLATFORMS } from "@/lib/offers/query";
import {
  offerJsonLd,
  serializeJsonLd,
  type JsonLdNode,
} from "@/lib/seo/jsonld";

/**
 * Property-based test for the honest Product/Offer structured data.
 *
 * Feature: ofertas-reales-ia, Property 20: Datos estructurados honestos
 * Validates: Requirements 20.4, 20.5, 20.6
 *
 * Para cualquier oferta y cualquier valor del conmutador `SHOW_AMAZON_PRICES`,
 * `offerJsonLd` (a) nunca incluye un precio numérico cuando el precio de Amazon
 * está oculto, (b) nunca marca como disponible una oferta no activa/expirada, y
 * (c) omite el precio cuando no puede garantizarse su exactitud.
 */

/** All offer statuses from the `offer_status` enum (only `active` is current). */
const OFFER_STATUSES = [
  "draft",
  "active",
  "expired",
  "hidden",
  "rejected",
  "needs_review",
] as const;

describe("Property 20: Datos estructurados honestos", () => {
  /** Exact 2-decimal (centavos) MXN amount from whole cents. */
  const priceArb = fc.integer({ min: 0, max: 999_999_999 }).map((cents) => cents / 100);
  const textArb = fc.string({ minLength: 0, maxLength: 40 });

  /** An arbitrary offer plus the price toggle. */
  const caseArb = fc.record({
    title: fc.string({ minLength: 1, maxLength: 60 }),
    slug: fc.string({ minLength: 1, maxLength: 24 }),
    platform: fc.constantFrom(...OFFER_PLATFORMS),
    status: fc.constantFrom(...OFFER_STATUSES),
    current_price: priceArb,
    original_price: fc.option(priceArb, { nil: null }),
    currency: fc.constantFrom("MXN", "USD"),
    image_url: fc.option(fc.webUrl(), { nil: null }),
    image_status: fc.constantFrom("ready", "pending", "failed"),
    image_alt: fc.option(textArb, { nil: null }),
    editorial_summary: fc.option(textArb, { nil: null }),
    short_description: fc.option(textArb, { nil: null }),
    showAmazonPrices: fc.boolean(),
  });

  it("emits a Product node iff the offer is active (R20.4, R20.5)", () => {
    // Feature: ofertas-reales-ia, Property 20: Datos estructurados honestos
    fc.assert(
      fc.property(caseArb, ({ showAmazonPrices, ...offer }) => {
        const node = offerJsonLd(offer, { showAmazonPrices });

        if (offer.status !== "active") {
          // Non-active (incl. expired) ⇒ no node at all ⇒ never available.
          expect(node).toBeNull();
        } else {
          expect(node).not.toBeNull();
          expect(node?.["@type"]).toBe("Product");
        }
      }),
      { numRuns: 250 },
    );
  });

  it("never publishes a numeric price when the Amazon price is hidden (R20.6)", () => {
    // Feature: ofertas-reales-ia, Property 20: Datos estructurados honestos
    fc.assert(
      fc.property(caseArb, ({ showAmazonPrices, ...offer }) => {
        const node = offerJsonLd(offer, { showAmazonPrices });
        if (node === null) return; // non-active handled by the prior property

        const hidden = shouldHideAmazonPrice(offer.platform, showAmazonPrices);
        const json = serializeJsonLd(node);

        if (hidden) {
          // The whole Offer node is omitted — no price is ever fabricated.
          expect(node.offers).toBeUndefined();
          expect(json).not.toContain('"price"');
          expect(json).not.toContain("priceCurrency");
        } else {
          // When guaranteed, the price equals the offer's exact current price.
          const offers = node.offers as JsonLdNode | undefined;
          expect(offers).toBeDefined();
          expect(offers?.price).toBe(offer.current_price.toFixed(2));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("never marks any offer as InStock / guaranteed-available (R20.5)", () => {
    // Feature: ofertas-reales-ia, Property 20: Datos estructurados honestos
    fc.assert(
      fc.property(caseArb, ({ showAmazonPrices, ...offer }) => {
        const node = offerJsonLd(offer, { showAmazonPrices });
        if (node === null) return;

        // No node anywhere asserts merchant in-stock availability.
        expect(serializeJsonLd(node)).not.toContain("schema.org/InStock");
        const offers = node.offers as JsonLdNode | undefined;
        if (offers !== undefined) {
          expect(offers.availability).not.toBe("https://schema.org/InStock");
        }
      }),
      { numRuns: 250 },
    );
  });
});
