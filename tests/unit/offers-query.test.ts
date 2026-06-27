import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  buildKeysetFilter,
  compareOffersForSort,
  decodeCursor,
  encodeCursor,
  encodeCursorForRow,
  isUuid,
  OFFER_SORTS,
  orderKeysForSort,
  rowIsAfterCursor,
  safeParseOffersQuery,
  type OfferOrderFields,
  type OffersCursor,
  type OffersQuery,
  type OfferSort,
} from "@/lib/offers/query";

/**
 * Unit + property tests for the pure offers query builder (Task 18.2).
 * Validates: Requirements 16.1, 16.2
 *
 * Covers filter validation/normalization, the sort → order-key mapping, opaque
 * cursor round-trip, the PostgREST keyset predicate strings, and — crucially —
 * that keyset pagination is a stable, gap-free partition of the ordering.
 */

const UUID = "11111111-1111-1111-1111-111111111111";

function query(partial: Partial<OffersQuery>): OffersQuery {
  return {
    sort: "recent",
    limit: 24,
    cursor: null,
    ...partial,
  };
}

describe("isUuid", () => {
  it("accepts canonical uuids and rejects anything else", () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("safeParseOffersQuery", () => {
  it("applies defaults for an empty query", () => {
    const result = safeParseOffersQuery(new URLSearchParams());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.query.sort).toBe("recent");
      expect(result.query.limit).toBe(24);
      expect(result.query.cursor).toBeNull();
      expect(result.query.platform).toBeUndefined();
    }
  });

  it("parses a full set of valid filters", () => {
    const result = safeParseOffersQuery(
      new URLSearchParams({
        platform: "amazon",
        category: "electronica",
        minDiscount: "50",
        minPrice: "10",
        maxPrice: "1000",
        sort: "discount",
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.query).toMatchObject({
        platform: "amazon",
        categorySlug: "electronica",
        minDiscount: 50,
        minPrice: 10,
        maxPrice: 1000,
        sort: "discount",
      });
    }
  });

  it("treats blank params as absent (no error)", () => {
    const result = safeParseOffersQuery(
      new URLSearchParams({ platform: "", minPrice: "", sort: "" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.query.platform).toBeUndefined();
      expect(result.query.minPrice).toBeUndefined();
      expect(result.query.sort).toBe("recent");
    }
  });

  it("rejects an unknown platform", () => {
    const result = safeParseOffersQuery(new URLSearchParams({ platform: "ebay" }));
    expect(result.success).toBe(false);
  });

  it("rejects minDiscount out of range", () => {
    expect(safeParseOffersQuery(new URLSearchParams({ minDiscount: "150" })).success).toBe(
      false,
    );
  });

  it("rejects minPrice greater than maxPrice", () => {
    const result = safeParseOffersQuery(
      new URLSearchParams({ minPrice: "500", maxPrice: "100" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an undecodable cursor", () => {
    const result = safeParseOffersQuery(new URLSearchParams({ cursor: "@@@not-valid" }));
    expect(result.success).toBe(false);
  });

  it("rejects a cursor whose sort does not match the requested sort", () => {
    const recentCursor = encodeCursor("recent", ["2024-01-01T00:00:00.000Z", UUID]);
    const result = safeParseOffersQuery(
      new URLSearchParams({ sort: "discount", cursor: recentCursor }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a cursor that matches the requested sort", () => {
    const cursor = encodeCursor("discount", [50, UUID]);
    const result = safeParseOffersQuery(
      new URLSearchParams({ sort: "discount", cursor }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.query.cursor).toEqual({ sort: "discount", values: [50, UUID] });
    }
  });
});

describe("orderKeysForSort", () => {
  it("maps recent to (published_at desc, id desc)", () => {
    expect(orderKeysForSort("recent")).toEqual([
      { column: "published_at", ascending: false, nullsFirst: true, nullable: false },
      { column: "id", ascending: false, nullsFirst: true, nullable: false },
    ]);
  });

  it("maps discount to (discount_percent desc NULLS LAST, id desc)", () => {
    expect(orderKeysForSort("discount")).toEqual([
      { column: "discount_percent", ascending: false, nullsFirst: false, nullable: true },
      { column: "id", ascending: false, nullsFirst: false, nullable: false },
    ]);
  });

  it("maps price_asc to (current_price asc, id asc)", () => {
    expect(orderKeysForSort("price_asc")).toEqual([
      { column: "current_price", ascending: true, nullsFirst: false, nullable: false },
      { column: "id", ascending: true, nullsFirst: false, nullable: false },
    ]);
  });
});

describe("cursor round-trip", () => {
  it("round-trips values for each sort", () => {
    const cases: ReadonlyArray<readonly [OfferSort, readonly (string | number | null)[]]> = [
      ["recent", ["2024-03-02T10:00:00.000Z", UUID]],
      ["discount", [73, UUID]],
      ["discount", [null, UUID]],
      ["price_asc", [1299, UUID]],
    ];
    for (const [sort, values] of cases) {
      const decoded = decodeCursor(encodeCursor(sort, values));
      expect(decoded).toEqual({ sort, values });
    }
  });

  it("encodes the cursor pointing after a row", () => {
    const row: OfferOrderFields = {
      id: UUID,
      published_at: "2024-05-01T00:00:00.000Z",
      discount_percent: 40,
      current_price: 500,
    };
    expect(decodeCursor(encodeCursorForRow("recent", row))).toEqual({
      sort: "recent",
      values: ["2024-05-01T00:00:00.000Z", UUID],
    });
    expect(decodeCursor(encodeCursorForRow("discount", row))).toEqual({
      sort: "discount",
      values: [40, UUID],
    });
    expect(decodeCursor(encodeCursorForRow("price_asc", row))).toEqual({
      sort: "price_asc",
      values: [500, UUID],
    });
  });

  it("rejects a cursor with the wrong value count", () => {
    expect(decodeCursor(encodeCursor("recent", [UUID]))).toBeNull();
  });
});

describe("buildKeysetFilter", () => {
  it("returns undefined without a cursor", () => {
    expect(buildKeysetFilter(query({ sort: "recent", cursor: null }))).toBeUndefined();
  });

  it("builds the recent (desc) keyset predicate", () => {
    const cursor: OffersCursor = { sort: "recent", values: ["2024-01-02T00:00:00.000Z", UUID] };
    expect(buildKeysetFilter(query({ sort: "recent", cursor }))).toBe(
      `published_at.lt."2024-01-02T00:00:00.000Z",` +
        `and(published_at.eq."2024-01-02T00:00:00.000Z",id.lt."${UUID}")`,
    );
  });

  it("builds the discount (desc, NULLS LAST) keyset predicate for a non-null cursor", () => {
    const cursor: OffersCursor = { sort: "discount", values: [50, UUID] };
    expect(buildKeysetFilter(query({ sort: "discount", cursor }))).toBe(
      `discount_percent.lt.50,discount_percent.is.null,` +
        `and(discount_percent.eq.50,id.lt."${UUID}")`,
    );
  });

  it("builds the discount keyset predicate inside the NULL tail", () => {
    const cursor: OffersCursor = { sort: "discount", values: [null, UUID] };
    expect(buildKeysetFilter(query({ sort: "discount", cursor }))).toBe(
      `and(discount_percent.is.null,id.lt."${UUID}")`,
    );
  });

  it("builds the price_asc (asc) keyset predicate", () => {
    const cursor: OffersCursor = { sort: "price_asc", values: [1299, UUID] };
    expect(buildKeysetFilter(query({ sort: "price_asc", cursor }))).toBe(
      `current_price.gt.1299,and(current_price.eq.1299,id.gt."${UUID}")`,
    );
  });
});

describe("keyset pagination stability (in-memory model)", () => {
  const offerArb = fc.record({
    id: fc.uuid(),
    published_at: fc
      .date({ min: new Date("2020-01-01T00:00:00.000Z"), max: new Date("2025-01-01T00:00:00.000Z") })
      .map((d) => d.toISOString()),
    discount_percent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    current_price: fc.integer({ min: 0, max: 100_000 }),
  });
  const offersArb = fc.uniqueArray(offerArb, {
    minLength: 0,
    maxLength: 30,
    selector: (offer) => offer.id,
  });

  /** Page through `all` using the same opaque cursor the route uses. */
  function paginate(
    all: ReadonlyArray<OfferOrderFields>,
    sort: OfferSort,
    pageSize: number,
  ): OfferOrderFields[][] {
    const sorted = [...all].sort((a, b) => compareOffersForSort(a, b, sort));
    const pages: OfferOrderFields[][] = [];
    let cursor: OffersCursor | null = null;

    for (let guard = 0; guard < 2_000; guard += 1) {
      let remaining: OfferOrderFields[];
      if (cursor === null) {
        remaining = sorted;
      } else {
        const active = cursor;
        remaining = sorted.filter((row) => rowIsAfterCursor(row, active));
      }
      if (remaining.length === 0) break;
      const page = remaining.slice(0, pageSize);
      pages.push(page);
      const last = page[page.length - 1];
      if (!last || remaining.length <= pageSize) break;
      cursor = decodeCursor(encodeCursorForRow(sort, last));
      if (cursor === null) break;
    }
    return pages;
  }

  it("returns every row exactly once, in order, across pages for any sort", () => {
    fc.assert(
      fc.property(
        offersArb,
        fc.constantFrom<OfferSort>(...OFFER_SORTS),
        fc.integer({ min: 1, max: 5 }),
        (offers, sort, pageSize) => {
          const pages = paginate(offers, sort, pageSize);
          const flat = pages.flat();
          const sorted = [...offers].sort((a, b) => compareOffersForSort(a, b, sort));

          // Same elements, same order — no gaps, no duplicates (stability).
          expect(flat.map((o) => o.id)).toEqual(sorted.map((o) => o.id));
          // Every page but the last is full.
          for (let i = 0; i < pages.length - 1; i += 1) {
            expect(pages[i]?.length).toBe(pageSize);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
