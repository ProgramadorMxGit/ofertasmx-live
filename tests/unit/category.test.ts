import { describe, expect, it } from "vitest";

import { CATEGORIES, classifyCategory, DEFAULT_CATEGORY } from "@/lib/parser/category";

/**
 * Example unit tests for keyword-based category classification (R4.14).
 *
 * Covers a representative title for each category and the total `Otros`
 * fallback. Broad coverage (totality and the "Otros iff no keyword" rule) lives
 * in the companion property test (`category.property.test.ts`).
 */

describe("classifyCategory — one example per category", () => {
  const cases: Array<[string, (typeof CATEGORIES)[number]]> = [
    ["Audífonos Bluetooth inalámbricos", "Electrónica"],
    ["Licuadora Oster para cocina", "Hogar"],
    ["Tenis Lugz para Hombre", "Moda"],
    ["Taladro inalámbrico 20V", "Herramientas"],
    ["Impresora multifuncional para oficina", "Oficina"],
    ["Perfume para dama 100ml", "Belleza"],
    ["Bicicleta de montaña rodada 29", "Deportes"],
  ];

  for (const [title, expected] of cases) {
    it(`classifies "${title}" as ${expected}`, () => {
      expect(classifyCategory(title)).toBe(expected);
    });
  }
});

describe("classifyCategory — Otros fallback (R4.14)", () => {
  it("returns Otros when no keyword matches", () => {
    expect(classifyCategory("Producto misterioso xyzzy")).toBe("Otros");
    expect(classifyCategory("")).toBe(DEFAULT_CATEGORY);
  });

  it("is tolerant of accents and case (audifonos -> Electrónica)", () => {
    expect(classifyCategory("AUDIFONOS deportivos")).toBe("Electrónica");
  });

  it("always returns a value from the allowed set", () => {
    expect(CATEGORIES).toContain(classifyCategory("cualquier cosa rara"));
  });
});
