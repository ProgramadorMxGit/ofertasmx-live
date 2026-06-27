import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { CATEGORIES, CATEGORY_KEYWORDS, classifyCategory } from "@/lib/parser/category";
import { normalizeTitle } from "@/lib/parser/normalize";

/**
 * Property-based test for keyword-based category classification.
 *
 * Feature: ofertas-reales-ia, Property 6: Clasificación total de categoría con respaldo 'Otros'
 * Validates: Requirements 4.14
 *
 * Para cualquier título, la categoría asignada pertenece al conjunto permitido
 * y, cuando ninguna palabra clave coincide, la categoría es exactamente `Otros`.
 */

const ALL_KEYWORDS = Object.values(CATEGORY_KEYWORDS).flat();

/** Mirrors the classifier's internal folding (lowercase, collapse, strip accents). */
function fold(value: string): string {
  return normalizeTitle(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function anyKeywordMatches(title: string): boolean {
  const folded = fold(title);
  return ALL_KEYWORDS.some((kw) => folded.includes(fold(kw)));
}

describe("Property 6: Clasificación total de categoría con respaldo 'Otros'", () => {
  // Feature: ofertas-reales-ia, Property 6: Clasificación total de categoría con respaldo 'Otros'
  // Validates: Requirements 4.14
  it("is total: the result always belongs to the allowed set", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (title) => {
        expect(CATEGORIES).toContain(classifyCategory(title));
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 6: Clasificación total de categoría con respaldo 'Otros'
  // Validates: Requirements 4.14
  it("returns 'Otros' if and only if no keyword matches", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (title) => {
        const isOtros = classifyCategory(title) === "Otros";
        expect(isOtros).toBe(!anyKeywordMatches(title));
      }),
      { numRuns: 500 },
    );
  });

  // Feature: ofertas-reales-ia, Property 6: Clasificación total de categoría con respaldo 'Otros'
  // Validates: Requirements 4.14
  it("a title made only of non-keyword tokens is classified 'Otros'", () => {
    // Nonsense tokens chosen to be disjoint from every keyword substring.
    const nonsense = fc.constantFrom("xyzzy", "qwop", "zzqf", "blorp", "vremp", "kxju");
    const title = fc
      .array(nonsense, { minLength: 1, maxLength: 6 })
      .map((parts) => parts.join(" "));
    fc.assert(
      fc.property(title, (t) => {
        fc.pre(!anyKeywordMatches(t));
        expect(classifyCategory(t)).toBe("Otros");
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 6: Clasificación total de categoría con respaldo 'Otros'
  // Validates: Requirements 4.14
  it("a title containing any single keyword is classified into a non-'Otros' category", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_KEYWORDS), (keyword) => {
        const result = classifyCategory(`Producto ${keyword} en oferta`);
        expect(result).not.toBe("Otros");
        expect(CATEGORIES).toContain(result);
      }),
      { numRuns: Math.max(100, ALL_KEYWORDS.length) },
    );
  });
});
