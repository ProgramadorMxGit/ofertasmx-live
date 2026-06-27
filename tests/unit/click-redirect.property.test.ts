import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { resolveClickRedirect, type ClickParams } from "@/lib/offers/click";

/**
 * Property-based test for the click redirector.
 *
 * Feature: ofertas-reales-ia, Property 17: Redirección cerrada del Servicio de Clics
 * Validates: Requirements 11.4, 11.5, 11.6
 *
 * Para cualquier oferta existente y para cualquier parámetro o destino
 * proporcionado por el cliente, el Servicio de Clics redirige únicamente a
 * `offer.affiliate_url` almacenado (ignorando todo destino del cliente) y, si el
 * `offerId` no corresponde a una oferta válida, no realiza ninguna redirección.
 */

/** Realistic stored affiliate URLs (always a usable, non-blank value). */
const storedUrlArb = fc.webUrl();
/** Arbitrary client-supplied destinations: urls, junk, empty. */
const clientStringArb = fc.oneof(fc.webUrl(), fc.string(), fc.constant(""));
const clientParamsArb: fc.Arbitrary<ClickParams> = fc.record({
  url: fc.option(clientStringArb, { nil: null }),
  dest: fc.option(clientStringArb, { nil: null }),
});

describe("Property 17: Redirección cerrada del Servicio de Clics", () => {
  // Feature: ofertas-reales-ia, Property 17: Redirección cerrada del Servicio de Clics
  // Validates: Requirements 11.4, 11.5
  it("always redirects to the STORED affiliate_url, ignoring any client params", () => {
    fc.assert(
      fc.property(storedUrlArb, clientParamsArb, (stored, clientParams) => {
        const decision = resolveClickRedirect({ affiliate_url: stored }, clientParams);
        expect(decision.redirect).toBe(true);
        if (decision.redirect) {
          // The target is exactly the stored URL, never a client value.
          expect(decision.target).toBe(stored);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 17: Redirección cerrada del Servicio de Clics
  // Validates: Requirements 11.5
  it("never adopts a client destination, even one that differs from the stored URL", () => {
    fc.assert(
      fc.property(storedUrlArb, clientStringArb, clientStringArb, (stored, url, dest) => {
        const decision = resolveClickRedirect({ affiliate_url: stored }, { url, dest });
        expect(decision.redirect).toBe(true);
        if (decision.redirect) {
          expect(decision.target).toBe(stored);
          if (url !== stored) expect(decision.target).not.toBe(url);
          if (dest !== stored) expect(decision.target).not.toBe(dest);
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 17: Redirección cerrada del Servicio de Clics
  // Validates: Requirements 11.6
  it("does not redirect when the offer is missing", () => {
    fc.assert(
      fc.property(clientParamsArb, (clientParams) => {
        expect(resolveClickRedirect(null, clientParams).redirect).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ofertas-reales-ia, Property 17: Redirección cerrada del Servicio de Clics
  // Validates: Requirements 11.6
  it("does not redirect when the offer has no usable stored URL", () => {
    const blankArb = fc.constantFrom<string | null>(null, "", "   ");
    fc.assert(
      fc.property(blankArb, clientParamsArb, (blank, clientParams) => {
        expect(resolveClickRedirect({ affiliate_url: blank }, clientParams).redirect).toBe(
          false,
        );
      }),
      { numRuns: 100 },
    );
  });
});
