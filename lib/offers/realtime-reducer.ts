/**
 * Pure, unit-testable reducer for the public live-offers feed (Task 24.1 / R9).
 *
 * This module is intentionally **side-effect free**: no Supabase, no DOM, no
 * `Date.now()` of its own — every action that needs a reference time receives a
 * `now` value. That keeps the entire realtime behaviour (insertion position,
 * patch-on-update, removal on expiry/non-active, local `expires_at` filtering,
 * merge-by-id on resync) deterministic and testable in isolation
 * (`tests/unit/realtime-reducer.test.ts`). The Client hook
 * `components/offers/use-offers-realtime.ts` is the only place that wires this
 * reducer to the Supabase Realtime channel and the wall clock.
 *
 * Ordering is delegated to {@link compareOffersForSort} from
 * `lib/offers/query.ts`, the single source of truth shared with the SSR list
 * and keyset pagination, so the live feed stays in exactly the same order the
 * server rendered.
 *
 * RLS subtlety mitigated here (design "Comportamiento de eventos"): a row that
 * stops being `active` no longer matches the anon policy, so its UPDATE may not
 * be delivered. Belt-and-suspenders: (a) any UPDATE with `status !== 'active'`
 * is treated as a removal, and (b) offers whose `expires_at` has passed are
 * filtered locally, so the UI is correct even without receiving the event.
 */

import {
  compareOffersForSort,
  type OfferSort,
  type PublicOffer,
} from "@/lib/offers/query";

/**
 * Connection state of the Realtime channel (R9.7). `offline` means the feed is a
 * static SSR snapshot because Supabase isn't configured in this environment
 * (e.g. local dev without credentials), so no channel is opened (R9.1).
 */
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

/**
 * Which field changed on an UPDATE, so the card can briefly highlight it
 * (R9.4). Priority is price > discount > status (price/discount are the
 * user-facing numbers R9.4 calls out explicitly).
 */
export type ChangedField = "price" | "discount" | "status";

/** The complete live-feed state. `offers` is always sorted for `sort`. */
export interface RealtimeState {
  /** Offers in render order for the active `sort`. */
  readonly offers: readonly PublicOffer[];
  /** The active sort; drives insertion position for INSERT events. */
  readonly sort: OfferSort;
  /** Realtime connection status, surfaced by the connection indicator. */
  readonly status: ConnectionStatus;
  /**
   * Highest `updated_at` seen so far (ISO 8601). Used by the hook to refetch
   * only rows changed since the last event when resynchronising (R9.8).
   */
  readonly lastEventTs: string | null;
  /** Count for the discreet "Nueva oferta encontrada" notice (R9.2). */
  readonly newCount: number;
  /** Ids inserted live and not yet acknowledged; drive the entrance animation. */
  readonly newIds: ReadonlySet<string>;
  /** Per-offer field to briefly highlight after an UPDATE (R9.4). */
  readonly highlights: Readonly<Record<string, ChangedField>>;
}

/** Actions the hook dispatches in response to Realtime events and timers. */
export type RealtimeAction =
  /** Channel status changed (R9.7). */
  | { readonly type: "SET_STATUS"; readonly status: ConnectionStatus }
  /** A brand-new offer arrived (R9.2, R9.3). */
  | { readonly type: "INSERT"; readonly offer: PublicOffer; readonly now: number }
  /** An existing offer changed; patched in place without reordering (R9.4). */
  | { readonly type: "UPDATE"; readonly offer: PublicOffer; readonly now: number }
  /** An offer was explicitly removed (e.g. a DELETE event) (R9.5). */
  | { readonly type: "REMOVE"; readonly id: string }
  /** Drop offers whose `expires_at` has passed — local belt-and-suspenders (R9.5, R9.9). */
  | { readonly type: "PRUNE_EXPIRED"; readonly now: number }
  /** Merge a refetched batch by id after reconnecting (R9.8). */
  | {
      readonly type: "RESYNC";
      readonly offers: readonly PublicOffer[];
      readonly now: number;
    }
  /** Re-seed from a fresh SSR list (e.g. filters/sort changed). */
  | {
      readonly type: "SEED";
      readonly offers: readonly PublicOffer[];
      readonly sort: OfferSort;
      readonly now: number;
    }
  /** The visitor acknowledged the new-offers notice; clears the count + flags. */
  | { readonly type: "ACK_NEW" }
  /** Clear a transient field highlight once its animation has elapsed. */
  | { readonly type: "CLEAR_HIGHLIGHT"; readonly id: string };

// ---------------------------------------------------------------------------
// Visibility helpers (pure)
// ---------------------------------------------------------------------------

/** Whether `offer.expires_at` is set and already in the past at `now` (R9.9). */
export function isOfferExpired(offer: PublicOffer, now: number): boolean {
  if (offer.expires_at === null) return false; // never expires by time (R9.9)
  const expiresMs = Date.parse(offer.expires_at);
  return Number.isFinite(expiresMs) && expiresMs <= now;
}

/** Whether an offer should be shown locally: `active` and not time-expired. */
export function isOfferVisible(offer: PublicOffer, now: number): boolean {
  return offer.status === "active" && !isOfferExpired(offer, now);
}

// ---------------------------------------------------------------------------
// Internal pure helpers
// ---------------------------------------------------------------------------

/** Largest `updated_at` (ISO strings sort lexicographically) across inputs. */
function maxUpdatedAt(
  offers: readonly PublicOffer[],
  current: string | null,
): string | null {
  let max = current;
  for (const offer of offers) {
    if (max === null || offer.updated_at > max) max = offer.updated_at;
  }
  return max;
}

/** Insert `offer` into the already-sorted `offers` at its correct position. */
function insertSorted(
  offers: readonly PublicOffer[],
  offer: PublicOffer,
  sort: OfferSort,
): PublicOffer[] {
  const result = offers.slice();
  let index = 0;
  while (
    index < result.length &&
    compareOffersForSort(offer, result[index], sort) >= 0
  ) {
    index += 1;
  }
  result.splice(index, 0, offer);
  return result;
}

/** Which user-facing field changed between two versions of an offer (R9.4). */
function detectChangedField(
  previous: PublicOffer,
  next: PublicOffer,
): ChangedField | null {
  if (previous.current_price !== next.current_price) return "price";
  if (previous.discount_percent !== next.discount_percent) return "discount";
  if (previous.status !== next.status) return "status";
  return null;
}

function setWithout(source: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!source.has(id)) return source;
  const next = new Set(source);
  next.delete(id);
  return next;
}

function recordWithout(
  source: Readonly<Record<string, ChangedField>>,
  id: string,
): Readonly<Record<string, ChangedField>> {
  if (!(id in source)) return source;
  const next = { ...source };
  delete next[id];
  return next;
}

/** Keep only the ids still present in `offers` across the new-flag/highlight maps. */
function pruneAuxiliary(
  offers: readonly PublicOffer[],
  newIds: ReadonlySet<string>,
  highlights: Readonly<Record<string, ChangedField>>,
): {
  newIds: ReadonlySet<string>;
  highlights: Readonly<Record<string, ChangedField>>;
} {
  const present = new Set(offers.map((offer) => offer.id));

  let nextNewIds = newIds;
  for (const id of newIds) {
    if (!present.has(id)) nextNewIds = setWithout(nextNewIds, id);
  }

  let nextHighlights = highlights;
  for (const id of Object.keys(highlights)) {
    if (!present.has(id)) nextHighlights = recordWithout(nextHighlights, id);
  }

  return { newIds: nextNewIds, highlights: nextHighlights };
}

/** Patch an existing offer in place (no reorder churn) and flag the change (R9.4). */
function patchInPlace(
  state: RealtimeState,
  incoming: PublicOffer,
  lastEventTs: string | null,
): RealtimeState {
  const index = state.offers.findIndex((offer) => offer.id === incoming.id);
  if (index < 0) return { ...state, lastEventTs };

  const previous = state.offers[index];
  const changed = detectChangedField(previous, incoming);
  const offers = state.offers.slice();
  offers[index] = incoming; // same index → grid does not re-mount the card

  const highlights = changed
    ? { ...state.highlights, [incoming.id]: changed }
    : state.highlights;

  return { ...state, offers, highlights, lastEventTs };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/**
 * Build the initial state from an SSR-provided list (R9.1). The list is filtered
 * to locally-visible offers, sorted for `sort`, and `lastEventTs` is seeded from
 * the freshest `updated_at` so the first resync only asks for newer rows.
 */
export function createInitialRealtimeState(
  initial: readonly PublicOffer[],
  sort: OfferSort,
  now: number,
): RealtimeState {
  const offers = initial
    .filter((offer) => isOfferVisible(offer, now))
    .sort((a, b) => compareOffersForSort(a, b, sort));

  return {
    offers,
    sort,
    status: "connecting",
    lastEventTs: maxUpdatedAt(offers, null),
    newCount: 0,
    newIds: new Set<string>(),
    highlights: {},
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function realtimeReducer(
  state: RealtimeState,
  action: RealtimeAction,
): RealtimeState {
  switch (action.type) {
    case "SET_STATUS": {
      if (state.status === action.status) return state;
      return { ...state, status: action.status };
    }

    case "INSERT": {
      const { offer, now } = action;
      const lastEventTs = maxUpdatedAt([offer], state.lastEventTs);

      // Dedupe by id: a duplicate INSERT is treated as a patch, never a clone.
      if (state.offers.some((existing) => existing.id === offer.id)) {
        return patchInPlace(state, offer, lastEventTs);
      }

      // Not visible locally (non-active or already expired): ignore the row but
      // still advance the event clock so resync stays correct.
      if (!isOfferVisible(offer, now)) {
        return { ...state, lastEventTs };
      }

      const offers = insertSorted(state.offers, offer, state.sort);
      const newIds = new Set(state.newIds);
      newIds.add(offer.id);

      return {
        ...state,
        offers,
        newIds,
        newCount: state.newCount + 1,
        lastEventTs,
      };
    }

    case "UPDATE": {
      const { offer, now } = action;
      const lastEventTs = maxUpdatedAt([offer], state.lastEventTs);
      const exists = state.offers.some((existing) => existing.id === offer.id);

      // Non-active or expired → remove (covers the Cron expiry UPDATE, R9.5).
      if (!isOfferVisible(offer, now)) {
        if (!exists) return { ...state, lastEventTs };
        const offers = state.offers.filter((existing) => existing.id !== offer.id);
        return {
          ...state,
          offers,
          newIds: setWithout(state.newIds, offer.id),
          highlights: recordWithout(state.highlights, offer.id),
          lastEventTs,
        };
      }

      // Newly visible to this client (e.g. draft → active): insert in position.
      if (!exists) {
        return {
          ...state,
          offers: insertSorted(state.offers, offer, state.sort),
          lastEventTs,
        };
      }

      // Existing + still visible → patch in place and highlight the change.
      return patchInPlace(state, offer, lastEventTs);
    }

    case "REMOVE": {
      if (!state.offers.some((offer) => offer.id === action.id)) return state;
      return {
        ...state,
        offers: state.offers.filter((offer) => offer.id !== action.id),
        newIds: setWithout(state.newIds, action.id),
        highlights: recordWithout(state.highlights, action.id),
      };
    }

    case "PRUNE_EXPIRED": {
      const { now } = action;
      const offers = state.offers.filter((offer) => !isOfferExpired(offer, now));
      if (offers.length === state.offers.length) return state;
      const aux = pruneAuxiliary(offers, state.newIds, state.highlights);
      return { ...state, offers, newIds: aux.newIds, highlights: aux.highlights };
    }

    case "RESYNC": {
      const { offers: batch, now } = action;
      const merged = state.offers.slice();

      for (const incoming of batch) {
        const index = merged.findIndex((existing) => existing.id === incoming.id);
        if (!isOfferVisible(incoming, now)) {
          if (index >= 0) merged.splice(index, 1); // disappeared / expired
          continue;
        }
        if (index >= 0) merged[index] = incoming; // merge by id (R9.8)
        else merged.push(incoming); // recovered/missed insert
      }

      // Local belt-and-suspenders prune, then re-sort the whole recovered list.
      const offers = merged
        .filter((offer) => !isOfferExpired(offer, now))
        .sort((a, b) => compareOffersForSort(a, b, state.sort));

      const aux = pruneAuxiliary(offers, state.newIds, state.highlights);
      return {
        ...state,
        offers,
        lastEventTs: maxUpdatedAt(batch, state.lastEventTs),
        newIds: aux.newIds,
        highlights: aux.highlights,
      };
    }

    case "SEED": {
      const { offers: initial, sort, now } = action;
      const offers = initial
        .filter((offer) => isOfferVisible(offer, now))
        .sort((a, b) => compareOffersForSort(a, b, sort));
      return {
        ...state,
        offers,
        sort,
        lastEventTs: maxUpdatedAt(offers, null),
        newCount: 0,
        newIds: new Set<string>(),
        highlights: {},
      };
    }

    case "ACK_NEW": {
      if (state.newCount === 0 && state.newIds.size === 0) return state;
      return { ...state, newCount: 0, newIds: new Set<string>() };
    }

    case "CLEAR_HIGHLIGHT": {
      if (!(action.id in state.highlights)) return state;
      return { ...state, highlights: recordWithout(state.highlights, action.id) };
    }

    default: {
      // Exhaustiveness guard: a new action type must be handled above.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
