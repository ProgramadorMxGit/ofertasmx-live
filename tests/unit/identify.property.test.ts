import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  createLinkPort,
  extractAsin,
  extractMlm,
  verifyAmazonTag,
} from "@/lib/ssrf/identify";

/**
 * Property-based tests for identifier extraction and affiliate-tag handling.
 *
 * Generators build valid ASINs (10 uppercase `[A-Z0-9]`), Mercado Libre `MLM`
 * ids (digits) and URL-safe affiliate tags, embedded into canonical URLs.
 */

const ASIN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const asinArb = fc
  .array(fc.constantFrom(...ASIN_CHARS), { minLength: 10, maxLength: 10 })
  .map((chars) => chars.join(""));

const DIGITS = "0123456789".split("");
const mlmDigitsArb = fc
  .array(fc.constantFrom(...DIGITS), { minLength: 6, maxLength: 12 })
  .map((chars) => chars.join(""));

const TRACKING_ID = "programadormx-20";
const TAG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-".split("");
const tagArb = fc.oneof(
  fc.constant(TRACKING_ID),
  fc.array(fc.constantFrom(...TAG_CHARS), { minLength: 3, maxLength: 18 }).map((c) => c.join("")),
);

describe("Property 7: Extracción round-trip de identificador externo", () => {
  // Feature: ofertas-reales-ia, Property 7: Extracción round-trip de identificador externo
  // Validates: Requirements 5.5, 5.9
  it("an ASIN embedded in any canonical Amazon URL is extracted back identically", () => {
    fc.assert(
      fc.property(asinArb, fc.integer({ min: 0, max: 5 }), (asin, shape) => {
        const urls = [
          `https://www.amazon.com.mx/dp/${asin}`,
          `https://www.amazon.com.mx/dp/${asin}/ref=sr_1_1`,
          `https://www.amazon.com.mx/dp/${asin}?tag=${TRACKING_ID}`,
          `https://www.amazon.com.mx/gp/product/${asin}`,
          `https://www.amazon.com.mx/gp/aw/d/${asin}`,
          `https://www.amazon.com.mx/s/algo?asin=${asin}`,
        ];
        expect(extractAsin(urls[shape])).toBe(asin);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 7: Extracción round-trip de identificador externo
  // Validates: Requirements 5.5, 5.9
  it("an MLM id embedded in a canonical Mercado Libre URL is extracted back identically", () => {
    fc.assert(
      fc.property(mlmDigitsArb, fc.boolean(), (digits, withHyphen) => {
        const id = `MLM${digits}`;
        const url = withHyphen
          ? `https://articulo.mercadolibre.com.mx/MLM-${digits}-oferta`
          : `https://www.mercadolibre.com.mx/p/MLM${digits}`;
        expect(extractMlm(url)).toBe(id);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 7: Extracción round-trip de identificador externo
  // Validates: Requirements 5.5, 5.9
  it("createLinkPort round-trips the MLM id and preserves attribution params verbatim", () => {
    fc.assert(
      fc.property(mlmDigitsArb, (digits) => {
        const id = `MLM${digits}`;
        const url = `https://articulo.mercadolibre.com.mx/MLM-${digits}-oferta?matt_word=src&forceInApp=true`;
        const info = createLinkPort().detect(url);
        expect(info).not.toBeNull();
        if (info === null) return;
        expect(info.platform).toBe("mercado_libre");
        expect(info.externalProductId).toBe(id);
        expect(info.url).toBe(url); // attribution params kept intact (R5.9)
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 9: Preservación y verificación del tag de afiliado", () => {
  // Feature: ofertas-reales-ia, Property 9: Preservación y verificación del tag de afiliado
  // Validates: Requirements 5.6, 5.7, 5.8
  it("preserves the tag verbatim and flags needsReview iff it differs from the tracking id", () => {
    fc.assert(
      fc.property(asinArb, tagArb, (asin, tag) => {
        const url = `https://www.amazon.com.mx/dp/${asin}?tag=${tag}`;
        const info = createLinkPort().detect(url);
        expect(info).not.toBeNull();
        if (info === null) return;

        // The tag is preserved exactly and the link is never mutated (R5.6).
        expect(info.affiliateTag).toBe(tag);
        expect(info.url).toBe(url);
        // needs_review iff the tag differs from AMAZON_TRACKING_ID (R5.7, R5.8).
        expect(info.needsReview).toBe(tag !== TRACKING_ID);
      }),
      { numRuns: 400 },
    );
  });

  // Feature: ofertas-reales-ia, Property 9: Preservación y verificación del tag de afiliado
  // Validates: Requirements 5.6, 5.7, 5.8
  it("verifyAmazonTag returns the input tag unchanged and the correct review flag", () => {
    fc.assert(
      fc.property(asinArb, tagArb, (asin, tag) => {
        const url = `https://www.amazon.com.mx/dp/${asin}?tag=${tag}`;
        const verification = verifyAmazonTag(url);
        expect(verification.tag).toBe(tag);
        expect(verification.needsReview).toBe(tag !== TRACKING_ID);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 9: Preservación y verificación del tag de afiliado
  // Validates: Requirements 5.6, 5.7, 5.8
  it("compares against a configured tracking id without altering the link", () => {
    const customTracking = "mitag-21";
    const port = createLinkPort({ trackingId: customTracking });
    fc.assert(
      fc.property(asinArb, tagArb, (asin, tag) => {
        const url = `https://www.amazon.com.mx/dp/${asin}?tag=${tag}`;
        const info = port.detect(url);
        expect(info).not.toBeNull();
        if (info === null) return;
        expect(info.url).toBe(url);
        expect(info.affiliateTag).toBe(tag);
        expect(info.needsReview).toBe(tag !== customTracking);
      }),
      { numRuns: 300 },
    );
  });
});
