import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import fc from "fast-check";

import {
  MAX_REASONABLE_PRICE,
  evaluatePrices,
  parseOffer,
  reconcileDiscount,
} from "@/lib/parser/parse";

/**
 * Property-based tests for the Message Parser (the correctness heart).
 *
 * Each block tags its property and the requirements it validates. Generators
 * build exact 2-decimal (centavos) MXN amounts from whole cents to stay free of
 * floating-point error, plus realistic and adversarial message shapes.
 */

const priceFromCents = (cents: number): Decimal => new Decimal(cents).dividedBy(100);
const ASIN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const asinArb = fc
  .array(fc.constantFrom(...ASIN_CHARS), { minLength: 10, maxLength: 10 })
  .map((chars) => chars.join(""));

/** Exact, decimal way to reproduce the spec discount formula for assertions. */
function expectedDiscount(original: Decimal, current: Decimal): number {
  const raw = original
    .minus(current)
    .dividedBy(original)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return Decimal.min(100, Decimal.max(0, raw)).toNumber();
}

describe("Property 2: Cálculo de descuento decimal y ofertas sin precio original", () => {
  // Feature: ofertas-reales-ia, Property 2: Cálculo de descuento decimal y ofertas sin precio original
  // Validates: Requirements 4.7, 4.12
  it("discount = round(((original - current) / original) * 100), clamped to [0,100]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100_000_000 }),
        (currentCents, deltaCents) => {
          const current = priceFromCents(currentCents);
          const original = priceFromCents(currentCents + deltaCents); // original > current
          const result = reconcileDiscount(original, current, null);

          expect(result.discountPercent).toBe(expectedDiscount(original, current));
          expect(result.needsReview).toBe(false);
          expect(Number.isInteger(result.discountPercent as number)).toBe(true);
          expect(result.discountPercent as number).toBeGreaterThanOrEqual(0);
          expect(result.discountPercent as number).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 2: Cálculo de descuento decimal y ofertas sin precio original
  // Validates: Requirements 4.7, 4.12
  it("an offer without an original price is accepted with discount_percent = null", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 999_999_900 }),
        fc.option(fc.integer({ min: 0, max: 95 }), { nil: undefined }),
        asinArb,
        (currentCents, maybePct, asin) => {
          // reconcileDiscount ignores the written percent when there is no original.
          const reconciled = reconcileDiscount(null, priceFromCents(currentCents), maybePct ?? null);
          expect(reconciled.discountPercent).toBeNull();
          expect(reconciled.needsReview).toBe(false);

          // End to end: a single-price message yields a null discount_percent.
          const price = priceFromCents(currentCents).toFixed(2);
          const pctLine = maybePct === undefined ? "" : `\n${maybePct}% de descuento`;
          const msg = `Producto Genérico${pctLine}\nPrecio: $${price}\nhttps://www.amazon.com.mx/dp/${asin}?tag=programadormx-20`;
          const r = parseOffer({ text: msg });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.offer.original_price).toBeNull();
          expect(r.offer.discount_percent).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Property 3: Tolerancia de descuento de ±1 punto y marca de revisión", () => {
  // Feature: ofertas-reales-ia, Property 3: Tolerancia de descuento de ±1 punto y marca de revisión
  // Validates: Requirements 4.8, 4.9
  it("needs_review iff |written − computed| > 1, and the stored value is always the computed one", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: -1000, max: 1000 }), // drift in tenths of a point
        (currentCents, deltaCents, driftTenths) => {
          const current = priceFromCents(currentCents);
          const original = priceFromCents(currentCents + deltaCents);
          const exact = original.minus(current).dividedBy(original).times(100).toNumber();
          const writtenPct = exact + driftTenths / 10;

          const result = reconcileDiscount(original, current, writtenPct);
          const expectedDrift = Math.abs(writtenPct - exact);

          // Stored value is always the computed discount, regardless of drift.
          expect(result.discountPercent).toBe(expectedDiscount(original, current));
          // The review flag mirrors the ±1pp rule precisely.
          expect(result.needsReview).toBe(expectedDrift > 1);
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 3: Tolerancia de descuento de ±1 punto y marca de revisión
  // Validates: Requirements 4.8, 4.9
  it("a drift of exactly 1pp is silently corrected (not flagged)", () => {
    // Use whole-dollar prices so the computed percent is an exact integer and a
    // drift of exactly ±1 is representable without floating-point error.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (pct) => {
        const original = new Decimal(100); // $100.00
        const current = new Decimal(100 - pct); // exact percent = pct
        expect(reconcileDiscount(original, current, pct + 1).needsReview).toBe(false);
        expect(reconcileDiscount(original, current, pct - 1).needsReview).toBe(false);
        // Two full points away must be flagged.
        if (pct + 2 <= 100) {
          expect(reconcileDiscount(original, current, pct + 2).needsReview).toBe(true);
        }
      }),
      { numRuns: 99 },
    );
  });
});

describe("Property 4: Rechazo de precios inválidos", () => {
  // Feature: ofertas-reales-ia, Property 4: Rechazo de precios inválidos
  // Validates: Requirements 4.10, 4.11
  it("rejects negative prices", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), (cents) => {
        const r = evaluatePrices(null, priceFromCents(cents).negated());
        expect(r).toEqual({ ok: false, reason: "negative_price" });
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 4: Rechazo de precios inválidos
  // Validates: Requirements 4.10, 4.11
  it("rejects absurd prices (zero or above the maximum)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), (over) => {
        const r = evaluatePrices(null, MAX_REASONABLE_PRICE.plus(over));
        expect(r).toEqual({ ok: false, reason: "absurd_price" });
      }),
      { numRuns: 200 },
    );
    expect(evaluatePrices(null, new Decimal(0))).toEqual({ ok: false, reason: "absurd_price" });
  });

  // Feature: ofertas-reales-ia, Property 4: Rechazo de precios inválidos
  // Validates: Requirements 4.10, 4.11
  it("rejects current >= original when an original price is present", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (originalCents, extraCents) => {
          const original = priceFromCents(originalCents);
          const current = priceFromCents(originalCents + extraCents); // current >= original
          const r = evaluatePrices(original, current);
          expect(r).toEqual({ ok: false, reason: "current_ge_original" });
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 4: Rechazo de precios inválidos
  // Validates: Requirements 4.10, 4.11
  it("accepts a valid original > current > 0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99_999_900 }),
        fc.integer({ min: 1, max: 100_000 }),
        (currentCents, deltaCents) => {
          const current = priceFromCents(currentCents);
          const original = priceFromCents(currentCents + deltaCents);
          expect(evaluatePrices(original, current)).toEqual({ ok: true });
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 4: Rechazo de precios inválidos
  // Validates: Requirements 4.10, 4.11
  it("parseOffer rejects an end-to-end message where current >= original", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 9_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        asinArb,
        (originalCents, extraCents, asin) => {
          const original = priceFromCents(originalCents).toFixed(2);
          const current = priceFromCents(originalCents + extraCents).toFixed(2);
          const msg = `Producto\nAntes: $${original}\nAhora: $${current}\nhttps://www.amazon.com.mx/dp/${asin}?tag=programadormx-20`;
          const r = parseOffer({ text: msg });
          expect(r.ok).toBe(false);
          if (r.ok) return;
          expect(r.reason).toBe("current_ge_original");
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Property 5: No invención de campos del parser", () => {
  // Feature: ofertas-reales-ia, Property 5: No invención de campos del parser
  // Validates: Requirements 4.13
  it("absent fields stay null; present fields are exactly the derivable ones", () => {
    fc.assert(
      fc.property(
        fc.record({
          hasUrl: fc.boolean(),
          hasOriginal: fc.boolean(),
          hasPct: fc.boolean(),
          hasDate: fc.boolean(),
          hasIds: fc.boolean(),
          currentCents: fc.integer({ min: 100, max: 9_000_000 }),
          deltaCents: fc.integer({ min: 1, max: 1_000_000 }),
          pct: fc.integer({ min: 5, max: 90 }),
          messageId: fc.integer({ min: 1, max: 1_000_000 }),
          updateId: fc.integer({ min: 1, max: 1_000_000 }),
          date: fc.integer({ min: 1, max: 2_000_000_000 }),
          asin: asinArb,
          disallowed: fc.boolean(),
        }),
        (c) => {
          const current = priceFromCents(c.currentCents).toFixed(2);
          const original = priceFromCents(c.currentCents + c.deltaCents).toFixed(2);

          const lines: string[] = ["Producto Genérico"];
          if (c.hasPct) lines.push(`🔥 ${c.pct}% de descuento`);
          if (c.hasOriginal) lines.push(`Antes: $${original}`);
          lines.push(`Ahora: $${current}`);
          const amazonUrl = `https://www.amazon.com.mx/dp/${c.asin}?tag=programadormx-20`;
          if (c.hasUrl) lines.push(amazonUrl);
          else if (c.disallowed) lines.push("https://sitio-no-permitido.example/x");
          const message = lines.join("\n");

          const r = parseOffer({
            text: message,
            telegram_message_id: c.hasIds ? c.messageId : null,
            telegram_update_id: c.hasIds ? c.updateId : null,
            date: c.hasDate ? c.date : null,
          });

          expect(r.ok).toBe(true);
          if (!r.ok) return;
          const o = r.offer;

          // raw_text is never fabricated: it is exactly what came in.
          expect(o.raw_text).toBe(message);
          // current price is always derivable and present.
          expect(o.current_price.toFixed(2)).toBe(current);

          // Link-derived fields: present iff an allowed URL was present.
          if (c.hasUrl) {
            expect(o.platform).toBe("amazon");
            expect(o.merchant).toBe("Amazon México");
            expect(o.affiliate_url).toBe(amazonUrl);
            expect(o.external_product_id).toBe(c.asin);
            expect(o.affiliate_tag).toBe("programadormx-20");
          } else {
            expect(o.platform).toBeNull();
            expect(o.merchant).toBeNull();
            expect(o.affiliate_url).toBeNull();
            expect(o.external_product_id).toBeNull();
            expect(o.affiliate_tag).toBeNull();
          }

          // Original/discount: present iff an original price was present.
          if (c.hasOriginal) {
            expect(o.original_price).not.toBeNull();
            expect(o.discount_percent).not.toBeNull();
          } else {
            expect(o.original_price).toBeNull();
            expect(o.discount_percent).toBeNull();
          }

          // Metadata: present iff provided.
          if (c.hasIds) {
            expect(o.telegram_message_id).toBe(c.messageId);
            expect(o.telegram_update_id).toBe(c.updateId);
          } else {
            expect(o.telegram_message_id).toBeNull();
            expect(o.telegram_update_id).toBeNull();
          }
          if (c.hasDate) {
            expect(o.published_at).toBe(new Date(c.date * 1000).toISOString());
          } else {
            expect(o.published_at).toBeNull();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
