import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTER_STATE,
  normalizeFilterState,
  parseFilters,
  serializeFilters,
  serializeFiltersToString,
  type FilterState,
} from "@/lib/offers/filters";

/**
 * Example unit tests for the pure filter <-> URL serialization (Task 23.1 /
 * R16.3, R16.4). The round-trip invariant is covered broadly in the companion
 * property test (`filters.property.test.ts`); here we pin concrete examples and
 * the normalization rules.
 */

function state(partial: Partial<FilterState>): FilterState {
  return { ...DEFAULT_FILTER_STATE, ...partial };
}

describe("parseFilters", () => {
  it("returns the default state for empty params", () => {
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTER_STATE);
  });

  it("parses a full, valid query string", () => {
    const parsed = parseFilters(
      new URLSearchParams(
        "platform=amazon&category=electronica&minDiscount=50&minPrice=100&maxPrice=2000&sort=discount&q=audifonos",
      ),
    );
    expect(parsed).toEqual(
      state({
        platform: "amazon",
        category: "electronica",
        minDiscount: 50,
        minPrice: 100,
        maxPrice: 2000,
        sort: "discount",
        query: "audifonos",
      }),
    );
  });

  it("accepts a plain record of params (e.g. Next.js searchParams)", () => {
    const parsed = parseFilters({ platform: "mercado_libre", sort: "price_asc" });
    expect(parsed.platform).toBe("mercado_libre");
    expect(parsed.sort).toBe("price_asc");
  });

  it("drops unknown / invalid values instead of erroring", () => {
    const parsed = parseFilters(
      new URLSearchParams(
        "platform=ebay&category=NOT_A_SLUG&minDiscount=999&sort=cheapest&minPrice=-5",
      ),
    );
    expect(parsed).toEqual(DEFAULT_FILTER_STATE);
  });

  it("treats minDiscount=0 as no filter", () => {
    expect(parseFilters(new URLSearchParams("minDiscount=0")).minDiscount).toBeNull();
  });

  it("swaps an inverted price range so min <= max", () => {
    const parsed = parseFilters(new URLSearchParams("minPrice=900&maxPrice=100"));
    expect(parsed.minPrice).toBe(100);
    expect(parsed.maxPrice).toBe(900);
  });

  it("trims the search query and ignores a blank one", () => {
    expect(parseFilters(new URLSearchParams("q=%20%20hola%20%20")).query).toBe("hola");
    expect(parseFilters(new URLSearchParams("q=%20%20")).query).toBe("");
  });
});

describe("serializeFilters", () => {
  it("omits default / empty values, including the default sort", () => {
    expect(serializeFiltersToString(DEFAULT_FILTER_STATE)).toBe("");
  });

  it("emits only the active filters", () => {
    const params = serializeFilters(
      state({ platform: "amazon", minDiscount: 40, sort: "recent" }),
    );
    expect(params.get("platform")).toBe("amazon");
    expect(params.get("minDiscount")).toBe("40");
    // recent is the default sort and is omitted.
    expect(params.get("sort")).toBeNull();
  });

  it("includes a non-default sort", () => {
    expect(serializeFilters(state({ sort: "discount" })).get("sort")).toBe("discount");
  });

  it("produces a URL string aligned with the API param names", () => {
    const qs = serializeFiltersToString(
      state({ platform: "amazon", minDiscount: 50, sort: "recent" }),
    );
    expect(qs).toBe("platform=amazon&minDiscount=50");
  });
});

describe("normalizeFilterState", () => {
  it("is idempotent", () => {
    const messy = state({
      platform: "amazon",
      minPrice: 900,
      maxPrice: 100,
      minDiscount: 0,
      query: "  hola  ",
    });
    const once = normalizeFilterState(messy);
    const twice = normalizeFilterState(once);
    expect(twice).toEqual(once);
    expect(once.minPrice).toBe(100);
    expect(once.maxPrice).toBe(900);
    expect(once.minDiscount).toBeNull();
    expect(once.query).toBe("hola");
  });
});
