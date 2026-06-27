import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  normalizeDestination,
  normalizeText,
  normalizeTitle,
} from "@/lib/parser/normalize";

/**
 * Property-based test for message normalization.
 *
 * Feature: ofertas-reales-ia, Property 1: Normalización idempotente
 * Validates: Requirements 4.1, 4.2
 *
 * Para cualquier cadena de entrada (con espacios unicode, caracteres
 * invisibles, saltos de línea y formatos de moneda variados), aplicar la
 * normalización una vez produce el mismo resultado que aplicarla dos veces:
 * `normalize(normalize(x)) === normalize(x)`.
 */
describe("Property 1: Normalización idempotente", () => {
  /**
   * Bespoke generator: builds messy strings out of "interesting" fragments —
   * the exact characters the normalizer is meant to fold — interleaved with
   * ordinary words, digits, currency and percent tokens. This stresses the
   * idempotence contract far more than plain random text would.
   */
  const fragment = fc.constantFrom(
    "Lugz",
    "Tenis",
    "oferta",
    "Antes:",
    "AHORA:",
    "60",
    "%",
    " %",
    "$",
    "\uff04", // fullwidth $
    "\uff05", // fullwidth %
    "1,220.27",
    "1.299,00",
    "MXN",
    " ", // regular space
    "   ", // run of spaces
    "\t", // tab
    "\u00a0", // NBSP
    "\u2009", // thin space
    "\u202f", // narrow no-break space
    "\u3000", // ideographic space
    "\u200b", // zero-width space
    "\u200d", // zero-width joiner
    "\u200e", // LRM
    "\u202b", // RLE
    "\ufeff", // BOM
    "\u00ad", // soft hyphen
    "\n",
    "\r\n",
    "\r",
    "\u2028",
    "\u2029",
    "\n\n\n",
    "https://www.amazon.com.mx/dp/B08Z6Z4P7C?tag=programadormx-20",
  );

  const messyString = fc
    .array(fragment, { minLength: 0, maxLength: 40 })
    .map((parts) => parts.join(""));

  it("normalizeText(normalizeText(x)) === normalizeText(x)", () => {
    // Feature: ofertas-reales-ia, Property 1: Normalización idempotente
    fc.assert(
      fc.property(messyString, (x) => {
        const once = normalizeText(x);
        expect(normalizeText(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("is idempotent on fully-arbitrary unicode strings too", () => {
    // Feature: ofertas-reales-ia, Property 1: Normalización idempotente
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (x) => {
        const once = normalizeText(x);
        expect(normalizeText(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("normalizeTitle is idempotent", () => {
    // Feature: ofertas-reales-ia, Property 1: Normalización idempotente
    fc.assert(
      fc.property(messyString, (x) => {
        const once = normalizeTitle(x);
        expect(normalizeTitle(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("normalizeDestination is idempotent", () => {
    // Feature: ofertas-reales-ia, Property 1: Normalización idempotente
    const urlish = fc.oneof(
      messyString,
      fc
        .record({
          scheme: fc.constantFrom("https://", "http://", ""),
          host: fc.constantFrom(
            "www.amazon.com.mx",
            "amazon.com.mx",
            "articulo.mercadolibre.com.mx",
            "example.com",
          ),
          path: fc.constantFrom("/dp/B08Z6Z4P7C", "/MLM-123", "/", "", "/x/y/"),
          query: fc.constantFrom(
            "",
            "?tag=abc",
            "?utm_source=tg&tag=zzz",
            "?x=1",
            "?b=2&a=1",
          ),
        })
        .map((r) => `${r.scheme}${r.host}${r.path}${r.query}`),
    );

    fc.assert(
      fc.property(urlish, (x) => {
        const once = normalizeDestination(x);
        expect(normalizeDestination(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });
});
