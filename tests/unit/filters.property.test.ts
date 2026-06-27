import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  normalizeFilterState,
  parseFilters,
  serializeFilters,
  serializeFiltersToString,
  type FilterState,
} from "@/lib/offers/filters";
import { OFFER_PLATFORMS, OFFER_SORTS, MAX_PRICE } from "@/lib/offers/query";

/**
 * Property-based test for filter-state <-> URL synchronization.
 *
 * Feature: ofertas-reales-ia, Property 23: Estado de filtros sincronizado con la URL (round-trip)
 * Validates: Requirements 16.3, 16.4
 *
 * Para cualquier estado de filtros válido (plataforma, categoría, descuento
 * mínimo, rango de precio, orden), serializarlo a `searchParams` y volver a
 * parsearlo reconstruye el mismo estado; e inversamente, para cualquier URL
 * válida, el estado derivado es estable.
 */
describe("Property 23: Estado de filtros sincronizado con la URL (round-trip)", () => {
  /** Search text drawn from a URL-safe, encode-safe alphabet (incl. spaces/accents). */
  const queryArb = fc
    .array(fc.constantFrom("a", "b", "c", "z", "0", "9", " ", "á", "ñ", "-"), {
      maxLength: 24,
    })
    .map((chars) => chars.join("").trim());

  /** A canonical, valid filter state (already normalized by construction). */
  const filterStateArb: fc.Arbitrary<FilterState> = fc
    .record({
      platform: fc.option(fc.constantFrom(...OFFER_PLATFORMS), { nil: null }),
      category: fc.option(
        fc.constantFrom(
          "electronica",
          "hogar",
          "moda",
          "herramientas",
          "oficina",
          "belleza",
          "deportes",
          "otros",
        ),
        { nil: null },
      ),
      minDiscount: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
      // Two ordered price bounds in range, each independently optional.
      prices: fc
        .tuple(
          fc.integer({ min: 0, max: MAX_PRICE }),
          fc.integer({ min: 0, max: MAX_PRICE }),
        )
        .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const),
      hasMin: fc.boolean(),
      hasMax: fc.boolean(),
      sort: fc.constantFrom(...OFFER_SORTS),
      query: queryArb,
    })
    .map((raw): FilterState => {
      const [lo, hi] = raw.prices;
      return {
        platform: raw.platform,
        category: raw.category,
        minDiscount: raw.minDiscount,
        minPrice: raw.hasMin ? lo : null,
        maxPrice: raw.hasMax ? hi : null,
        sort: raw.sort,
        query: raw.query,
      };
    });

  it("parse(serialize(state)) reconstructs the normalized state", () => {
    // Feature: ofertas-reales-ia, Property 23: Estado de filtros sincronizado con la URL (round-trip)
    fc.assert(
      fc.property(filterStateArb, (state) => {
        const roundTripped = parseFilters(serializeFilters(state));
        expect(roundTripped).toEqual(normalizeFilterState(state));
      }),
      { numRuns: 300 },
    );
  });

  it("the canonical states generated are already normalized (no hidden coercion)", () => {
    // Feature: ofertas-reales-ia, Property 23: Estado de filtros sincronizado con la URL (round-trip)
    fc.assert(
      fc.property(filterStateArb, (state) => {
        expect(normalizeFilterState(state)).toEqual(state);
      }),
      { numRuns: 300 },
    );
  });

  it("for any URL the derived state is stable (parse is idempotent through a re-serialize)", () => {
    // Feature: ofertas-reales-ia, Property 23: Estado de filtros sincronizado con la URL (round-trip)
    fc.assert(
      fc.property(filterStateArb, (state) => {
        const url = serializeFiltersToString(state);
        const first = parseFilters(new URLSearchParams(url));
        const second = parseFilters(new URLSearchParams(serializeFiltersToString(first)));
        expect(second).toEqual(first);
      }),
      { numRuns: 300 },
    );
  });
});
