import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import {
  MoneyError,
  absoluteSavings,
  discountPercent,
  formatMXN,
  toMoney,
} from "@/lib/utils/money";

/**
 * Example unit tests for the money utilities (R4.7, R14.1).
 *
 * These cover concrete examples and edge cases: cents, thousands separators,
 * absolute savings (`original - current`), discount rounding and clamping, and
 * tabular MXN formatting. Broad-input coverage lives in the companion
 * property-based test (`money.property.test.ts`).
 */

describe("toMoney — parsing and 2-decimal (MXN) semantics", () => {
  it("parses a plain number and quantizes to 2 decimals", () => {
    expect(toMoney(1299).toFixed(2)).toBe("1299.00");
  });

  it("parses cents from a string", () => {
    expect(toMoney("19.99").toFixed(2)).toBe("19.99");
  });

  it("rounds to 2 decimals using half-up", () => {
    expect(toMoney("19.999").toFixed(2)).toBe("20.00");
    expect(toMoney("19.994").toFixed(2)).toBe("19.99");
    expect(toMoney("19.995").toFixed(2)).toBe("20.00");
  });

  it("strips the $ symbol and the MXN marker", () => {
    expect(toMoney("$1234.56").toFixed(2)).toBe("1234.56");
    expect(toMoney("1234.56 MXN").toFixed(2)).toBe("1234.56");
    expect(toMoney("$1,234.56 MXN").toFixed(2)).toBe("1234.56");
  });

  it("removes comma thousands separators", () => {
    expect(toMoney("1,299.00").toFixed(2)).toBe("1299.00");
    expect(toMoney("1,000,000.00").toFixed(2)).toBe("1000000.00");
  });

  it("removes unicode and regular spaces used as separators", () => {
    // NBSP (\u00a0) and a normal space acting as a thousands separator.
    expect(toMoney("$1\u00a0299.00").toFixed(2)).toBe("1299.00");
    expect(toMoney("1 299.00").toFixed(2)).toBe("1299.00");
  });

  it("accepts an existing Decimal and re-quantizes it", () => {
    expect(toMoney(new Decimal("5.1")).toFixed(2)).toBe("5.10");
  });

  it("throws MoneyError for non-numeric or empty strings", () => {
    expect(() => toMoney("abc")).toThrow(MoneyError);
    expect(() => toMoney("")).toThrow(MoneyError);
    expect(() => toMoney("$")).toThrow(MoneyError);
  });

  it("throws MoneyError for non-finite numbers", () => {
    expect(() => toMoney(Number.NaN)).toThrow(MoneyError);
    expect(() => toMoney(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe("discountPercent — exact, rounded to integer, clamped to [0,100]", () => {
  it("computes a simple exact percent", () => {
    expect(discountPercent(100, 75)).toBe(25);
  });

  it("rounds the percent to an integer (half-up)", () => {
    expect(discountPercent(3, 2)).toBe(33); // 33.33... -> 33
    expect(discountPercent(8, 5)).toBe(38); // 37.5 -> 38
  });

  it("clamps to 0 when current is greater than or equal to original", () => {
    expect(discountPercent(100, 120)).toBe(0);
    expect(discountPercent(100, 100)).toBe(0);
  });

  it("clamps to 100 for an absurd current below zero", () => {
    expect(discountPercent(100, -50)).toBe(100);
  });

  it("throws when the original price is zero or negative", () => {
    expect(() => discountPercent(0, 0)).toThrow(MoneyError);
    expect(() => discountPercent(-10, -20)).toThrow(MoneyError);
  });

  it("always returns an integer", () => {
    expect(Number.isInteger(discountPercent(199.99, 149.99))).toBe(true);
  });
});

describe("absoluteSavings — original minus current", () => {
  it("computes savings exactly", () => {
    expect(absoluteSavings(100, 60).toFixed(2)).toBe("40.00");
  });

  it("equals original - current and is >= 0 when original >= current", () => {
    const savings = absoluteSavings("1299.00", "999.00");
    expect(savings.toFixed(2)).toBe("300.00");
    expect(savings.greaterThanOrEqualTo(0)).toBe(true);
  });

  it("reconstructs the original: savings + current === original", () => {
    const original = toMoney("1299.00");
    const current = toMoney("999.50");
    expect(absoluteSavings(original, current).plus(current).equals(original)).toBe(true);
  });

  it("is zero when original equals current", () => {
    expect(absoluteSavings(50, 50).isZero()).toBe(true);
  });
});

describe("formatMXN — tabular MXN formatting", () => {
  it("formats with thousands separators and 2 decimals", () => {
    expect(formatMXN(1299)).toBe("$1,299.00");
    expect(formatMXN(1000000)).toBe("$1,000,000.00");
    expect(formatMXN("19.9")).toBe("$19.90");
  });

  it("formats small values without separators", () => {
    expect(formatMXN(0)).toBe("$0.00");
    expect(formatMXN(999)).toBe("$999.00");
  });

  it("omits the symbol when requested (for tabular columns)", () => {
    expect(formatMXN(1299, { withSymbol: false })).toBe("1,299.00");
  });

  it("formats negative amounts with a leading sign", () => {
    expect(formatMXN(-1299)).toBe("-$1,299.00");
  });
});
