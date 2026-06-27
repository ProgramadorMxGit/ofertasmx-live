import { describe, expect, it } from "vitest";

import type { OfferSort, PublicOffer } from "@/lib/offers/query";
import {
  createInitialRealtimeState,
  isOfferExpired,
  isOfferVisible,
  realtimeReducer,
  type RealtimeState,
} from "@/lib/offers/realtime-reducer";

/**
 * Unit tests for the pure realtime reducer (Task 24.3).
 * Validates: Requirements 9.2, 9.4, 9.5, 9.8
 *
 * Covers: insertion position per active sort, patch-on-update with no reorder
 * churn, removal on expiry / non-active, local `expires_at` filtering, and
 * merge-by-id on resync.
 */

const NOW = Date.parse("2024-06-01T00:00:00.000Z");

/** Build a complete `PublicOffer` with overridable fields. */
function makeOffer(partial: Partial<PublicOffer> & { id: string }): PublicOffer {
  return {
    platform: "amazon",
    merchant: "Demo",
    external_product_id: null,
    title: `Oferta ${partial.id}`,
    slug: `oferta-${partial.id}`,
    short_description: null,
    editorial_summary: null,
    image_url: null,
    image_alt: null,
    image_status: "ready",
    original_price: null,
    current_price: 100,
    discount_percent: null,
    currency: "MXN",
    affiliate_url: "https://www.amazon.com.mx/dp/X",
    category_id: null,
    status: "active",
    is_featured: false,
    published_at: "2024-03-01T00:00:00.000Z",
    updated_at: "2024-03-01T00:00:00.000Z",
    last_verified_at: null,
    expires_at: null,
    created_at: "2024-03-01T00:00:00.000Z",
    ...partial,
  };
}

function seed(offers: readonly PublicOffer[], sort: OfferSort = "recent"): RealtimeState {
  return createInitialRealtimeState(offers, sort, NOW);
}

function ids(state: RealtimeState): string[] {
  return state.offers.map((offer) => offer.id);
}

describe("visibility helpers", () => {
  it("treats a null expires_at as never expiring (R9.9)", () => {
    expect(isOfferExpired(makeOffer({ id: "a", expires_at: null }), NOW)).toBe(false);
  });

  it("treats a past expires_at as expired", () => {
    const offer = makeOffer({ id: "a", expires_at: "2024-05-01T00:00:00.000Z" });
    expect(isOfferExpired(offer, NOW)).toBe(true);
    expect(isOfferVisible(offer, NOW)).toBe(false);
  });

  it("only shows active, non-expired offers", () => {
    expect(isOfferVisible(makeOffer({ id: "a", status: "expired" }), NOW)).toBe(false);
    expect(isOfferVisible(makeOffer({ id: "a", status: "active" }), NOW)).toBe(true);
  });
});

describe("createInitialRealtimeState", () => {
  it("filters out non-visible offers and sorts by the active sort", () => {
    const state = seed([
      makeOffer({ id: "new", published_at: "2024-03-03T00:00:00.000Z" }),
      makeOffer({ id: "old", published_at: "2024-03-01T00:00:00.000Z" }),
      makeOffer({ id: "hidden", status: "hidden" }),
      makeOffer({ id: "gone", expires_at: "2024-05-01T00:00:00.000Z" }),
    ]);
    expect(ids(state)).toEqual(["new", "old"]);
    expect(state.status).toBe("connecting");
    expect(state.lastEventTs).toBe("2024-03-01T00:00:00.000Z");
  });
});

describe("INSERT — position per sort (R9.2)", () => {
  it("inserts at the correct position for recent (published_at desc)", () => {
    const state = seed([
      makeOffer({ id: "a", published_at: "2024-03-03T00:00:00.000Z" }),
      makeOffer({ id: "b", published_at: "2024-03-01T00:00:00.000Z" }),
    ]);
    const next = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "c", published_at: "2024-03-02T00:00:00.000Z" }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["a", "c", "b"]);
    expect(next.newCount).toBe(1);
    expect(next.newIds.has("c")).toBe(true);
  });

  it("inserts at the correct position for discount (discount_percent desc)", () => {
    const state = seed(
      [
        makeOffer({ id: "x", discount_percent: 60 }),
        makeOffer({ id: "y", discount_percent: 20 }),
      ],
      "discount",
    );
    const next = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "z", discount_percent: 40 }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["x", "z", "y"]);
  });

  it("inserts at the correct position for price_asc (current_price asc)", () => {
    const state = seed(
      [
        makeOffer({ id: "p", current_price: 100 }),
        makeOffer({ id: "q", current_price: 500 }),
      ],
      "price_asc",
    );
    const next = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "r", current_price: 300 }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["p", "r", "q"]);
  });

  it("dedupes by id (a duplicate INSERT patches, never clones)", () => {
    const state = seed([makeOffer({ id: "a", current_price: 100 })]);
    const next = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "a", current_price: 80 }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["a"]);
    expect(next.offers[0]?.current_price).toBe(80);
    expect(next.newCount).toBe(0);
  });

  it("ignores a non-visible insert but still advances lastEventTs", () => {
    const state = seed([makeOffer({ id: "a" })]);
    const next = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({
        id: "b",
        status: "expired",
        updated_at: "2024-09-01T00:00:00.000Z",
      }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["a"]);
    expect(next.newCount).toBe(0);
    expect(next.lastEventTs).toBe("2024-09-01T00:00:00.000Z");
  });
});

describe("UPDATE — patch in place, no reorder churn (R9.4)", () => {
  it("patches a field without moving the card, even if it would re-sort", () => {
    const state = seed([
      makeOffer({ id: "a", published_at: "2024-03-03T00:00:00.000Z" }),
      makeOffer({ id: "b", published_at: "2024-03-01T00:00:00.000Z" }),
    ]);
    // Update b with a newer published_at: a re-sort would move it to the front,
    // but patch-in-place must keep it at index 1.
    const next = realtimeReducer(state, {
      type: "UPDATE",
      offer: makeOffer({
        id: "b",
        published_at: "2024-04-01T00:00:00.000Z",
        current_price: 55,
        updated_at: "2024-04-01T00:00:00.000Z",
      }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["a", "b"]);
    expect(next.offers[1]?.current_price).toBe(55);
    expect(next.highlights.b).toBe("price");
    expect(next.lastEventTs).toBe("2024-04-01T00:00:00.000Z");
  });

  it("flags the changed field by priority price > discount > status", () => {
    const base = seed([makeOffer({ id: "a", discount_percent: 10, current_price: 100 })]);
    const discountChange = realtimeReducer(base, {
      type: "UPDATE",
      offer: makeOffer({ id: "a", discount_percent: 25, current_price: 100 }),
      now: NOW,
    });
    expect(discountChange.highlights.a).toBe("discount");
  });

  it("inserts in position when an update arrives for an offer not yet seen", () => {
    const state = seed([
      makeOffer({ id: "a", published_at: "2024-03-03T00:00:00.000Z" }),
      makeOffer({ id: "c", published_at: "2024-03-01T00:00:00.000Z" }),
    ]);
    const next = realtimeReducer(state, {
      type: "UPDATE",
      offer: makeOffer({ id: "b", published_at: "2024-03-02T00:00:00.000Z" }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["a", "b", "c"]);
    // It was not an INSERT event, so it must not be flagged "nueva".
    expect(next.newIds.has("b")).toBe(false);
    expect(next.newCount).toBe(0);
  });
});

describe("UPDATE / REMOVE — removal on expiry or non-active (R9.5)", () => {
  it("removes an offer whose status becomes non-active", () => {
    const state = seed([makeOffer({ id: "a" }), makeOffer({ id: "b" })]);
    const next = realtimeReducer(state, {
      type: "UPDATE",
      offer: makeOffer({ id: "a", status: "expired" }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["b"]);
  });

  it("removes an offer whose expires_at has passed even if still active", () => {
    const state = seed([makeOffer({ id: "a" }), makeOffer({ id: "b" })]);
    const next = realtimeReducer(state, {
      type: "UPDATE",
      offer: makeOffer({
        id: "a",
        status: "active",
        expires_at: "2024-05-01T00:00:00.000Z",
      }),
      now: NOW,
    });
    expect(ids(next)).toEqual(["b"]);
  });

  it("REMOVE drops an offer by id and clears its flags", () => {
    let state = seed([makeOffer({ id: "a" })]);
    state = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "b", published_at: "2024-03-05T00:00:00.000Z" }),
      now: NOW,
    });
    expect(state.newIds.has("b")).toBe(true);
    const next = realtimeReducer(state, { type: "REMOVE", id: "b" });
    expect(ids(next)).toEqual(["a"]);
    expect(next.newIds.has("b")).toBe(false);
  });
});

describe("PRUNE_EXPIRED — local expires_at filtering (R9.5, R9.9)", () => {
  it("drops only offers whose expires_at has passed, keeping null/future", () => {
    const state: RealtimeState = {
      ...seed([]),
      offers: [
        makeOffer({ id: "past", expires_at: "2024-05-01T00:00:00.000Z" }),
        makeOffer({ id: "null", expires_at: null }),
        makeOffer({ id: "future", expires_at: "2024-07-01T00:00:00.000Z" }),
      ],
    };
    const next = realtimeReducer(state, { type: "PRUNE_EXPIRED", now: NOW });
    expect(ids(next)).toEqual(["null", "future"]);
  });

  it("is a no-op (same reference) when nothing is expired", () => {
    const state = seed([makeOffer({ id: "a", expires_at: null })]);
    const next = realtimeReducer(state, { type: "PRUNE_EXPIRED", now: NOW });
    expect(next).toBe(state);
  });
});

describe("RESYNC — merge by id (R9.8)", () => {
  it("upserts by id, adds new rows, removes non-visible, and re-sorts", () => {
    const state = seed([
      makeOffer({ id: "a", published_at: "2024-03-03T00:00:00.000Z" }),
      makeOffer({ id: "b", published_at: "2024-03-01T00:00:00.000Z" }),
    ]);
    const next = realtimeReducer(state, {
      type: "RESYNC",
      now: NOW,
      offers: [
        // b updated (newer published_at → re-sorts to the front on resync)
        makeOffer({
          id: "b",
          published_at: "2024-03-04T00:00:00.000Z",
          current_price: 42,
          updated_at: "2024-03-04T00:00:00.000Z",
        }),
        // c is new
        makeOffer({ id: "c", published_at: "2024-03-02T00:00:00.000Z" }),
        // a is now hidden → must be removed
        makeOffer({ id: "a", status: "hidden" }),
      ],
    });
    expect(ids(next)).toEqual(["b", "c"]);
    expect(next.offers[0]?.current_price).toBe(42);
    expect(next.lastEventTs).toBe("2024-03-04T00:00:00.000Z");
  });

  it("does not add a non-visible offer that is absent locally", () => {
    const state = seed([makeOffer({ id: "a" })]);
    const next = realtimeReducer(state, {
      type: "RESYNC",
      now: NOW,
      offers: [makeOffer({ id: "x", status: "expired" })],
    });
    expect(ids(next)).toEqual(["a"]);
  });
});

describe("SEED / ACK_NEW / CLEAR_HIGHLIGHT / SET_STATUS", () => {
  it("SEED replaces the list and resets the new-offers notice", () => {
    let state = seed([makeOffer({ id: "a" })]);
    state = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "b", published_at: "2024-03-09T00:00:00.000Z" }),
      now: NOW,
    });
    expect(state.newCount).toBe(1);
    const next = realtimeReducer(state, {
      type: "SEED",
      sort: "recent",
      now: NOW,
      offers: [makeOffer({ id: "z" })],
    });
    expect(ids(next)).toEqual(["z"]);
    expect(next.newCount).toBe(0);
    expect(next.newIds.size).toBe(0);
  });

  it("ACK_NEW clears the count and the nueva flags", () => {
    let state = seed([]);
    state = realtimeReducer(state, {
      type: "INSERT",
      offer: makeOffer({ id: "b" }),
      now: NOW,
    });
    const next = realtimeReducer(state, { type: "ACK_NEW" });
    expect(next.newCount).toBe(0);
    expect(next.newIds.size).toBe(0);
  });

  it("CLEAR_HIGHLIGHT removes a single highlight", () => {
    let state = seed([makeOffer({ id: "a", current_price: 100 })]);
    state = realtimeReducer(state, {
      type: "UPDATE",
      offer: makeOffer({ id: "a", current_price: 90 }),
      now: NOW,
    });
    expect(state.highlights.a).toBe("price");
    const next = realtimeReducer(state, { type: "CLEAR_HIGHLIGHT", id: "a" });
    expect(next.highlights.a).toBeUndefined();
  });

  it("SET_STATUS updates the connection status", () => {
    const state = seed([]);
    expect(realtimeReducer(state, { type: "SET_STATUS", status: "live" }).status).toBe(
      "live",
    );
  });
});
