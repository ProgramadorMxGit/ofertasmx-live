/**
 * Pure filter-state <-> URL serialization (Task 23.1 / R16.3, R16.4).
 *
 * The public offer listing keeps its filter/sort/search state in the URL so it
 * is shareable and survives back/forward navigation (R16.3, R16.4). This module
 * is the **side-effect-free** bridge between a {@link FilterState} (what the
 * `Filters` UI manipulates) and `URLSearchParams` (what lives in the address
 * bar). It has no React and no DOM dependency, so the round-trip invariant
 * (Property 23) is unit/property testable in isolation.
 *
 * Alignment with the API: the emitted param names + value domains match
 * `safeParseOffersQuery`/`OffersQuery` in `lib/offers/query.ts`
 * (`platform`, `category`, `minDiscount`, `minPrice`, `maxPrice`, `sort`), so a
 * serialized URL is directly consumable by `/api/offers`. The extra `q` (free
 * text search) is owned by the client `SearchCommand` and ignored by the API.
 *
 * Normalization is **total and idempotent**: invalid/unknown values are dropped
 * (never throw), an inverted price range is swapped so `min <= max`, a discount
 * of `0` (or out of range) means "no filter", and the default `sort` (`recent`)
 * and empty values are omitted from the URL.
 */

import {
  MAX_PRICE,
  OFFER_PLATFORMS,
  OFFER_SORTS,
  type OfferPlatform,
  type OfferSort,
} from "@/lib/offers/query";

/** The default sort, omitted from a serialized URL. */
const DEFAULT_SORT: OfferSort = "recent";

/** Upper bound on the persisted search text (defensive; UI inputs are short). */
const MAX_QUERY_LENGTH = 100;

/** Slug shape shared with `lib/offers/query.ts`: lowercase alphanumerics + hyphens. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The complete, canonical filter state manipulated by the `Filters` UI. */
export interface FilterState {
  /** Platform filter, or `null` for "Todas". */
  readonly platform: OfferPlatform | null;
  /** Category slug (e.g. `electronica`), or `null` for "Todas". */
  readonly category: string | null;
  /** Minimum discount percent in `[1, 100]`, or `null` for no minimum. */
  readonly minDiscount: number | null;
  /** Minimum current price in MXN, or `null` for no minimum. */
  readonly minPrice: number | null;
  /** Maximum current price in MXN, or `null` for no maximum. */
  readonly maxPrice: number | null;
  /** List ordering; defaults to `recent`. */
  readonly sort: OfferSort;
  /** Free-text search query; empty string means "no search". */
  readonly query: string;
}

/** The empty filter state: no filters, default sort, no search. */
export const DEFAULT_FILTER_STATE: FilterState = {
  platform: null,
  category: null,
  minDiscount: null,
  minPrice: null,
  maxPrice: null,
  sort: DEFAULT_SORT,
  query: "",
};

/** Loose input for parsing: `URLSearchParams` or a Next.js `searchParams` record. */
export type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | null | undefined>;

function readParam(input: RawParams, key: string): string | null {
  if (input instanceof URLSearchParams) return input.get(key);
  const value = input[key];
  if (Array.isArray(value)) return value.length > 0 ? (value[0] ?? null) : null;
  return value ?? null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePlatform(value: unknown): OfferPlatform | null {
  return typeof value === "string" &&
    (OFFER_PLATFORMS as readonly string[]).includes(value)
    ? (value as OfferPlatform)
    : null;
}

function normalizeCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function normalizeSort(value: unknown): OfferSort {
  return typeof value === "string" &&
    (OFFER_SORTS as readonly string[]).includes(value)
    ? (value as OfferSort)
    : DEFAULT_SORT;
}

/** A discount of 0 (or out of `[1, 100]`) is treated as "no minimum". */
function normalizeMinDiscount(value: unknown): number | null {
  const parsed = coerceNumber(value);
  if (parsed === null) return null;
  const int = Math.trunc(parsed);
  if (int < 1 || int > 100) return null;
  return int;
}

function normalizePrice(value: unknown): number | null {
  const parsed = coerceNumber(value);
  if (parsed === null) return null;
  if (parsed < 0 || parsed > MAX_PRICE) return null;
  return parsed;
}

function normalizeQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed.slice(0, MAX_QUERY_LENGTH).trim();
}

/** Ensure `min <= max` when both bounds are present (swap an inverted range). */
function withOrderedPrices(state: FilterState): FilterState {
  if (
    state.minPrice !== null &&
    state.maxPrice !== null &&
    state.minPrice > state.maxPrice
  ) {
    return { ...state, minPrice: state.maxPrice, maxPrice: state.minPrice };
  }
  return state;
}

/**
 * Canonicalize a filter state: validate every field, drop invalid values, treat
 * `minDiscount = 0` as no filter, and order the price range. Total (never
 * throws) and idempotent (`normalize(normalize(s)) === normalize(s)`), which is
 * what makes the URL round-trip stable (Property 23).
 */
export function normalizeFilterState(state: FilterState): FilterState {
  return withOrderedPrices({
    platform: normalizePlatform(state.platform),
    category: normalizeCategory(state.category),
    minDiscount: normalizeMinDiscount(state.minDiscount),
    minPrice: normalizePrice(state.minPrice),
    maxPrice: normalizePrice(state.maxPrice),
    sort: normalizeSort(state.sort),
    query: normalizeQuery(state.query),
  });
}

/**
 * Parse raw URL search params into a canonical {@link FilterState}. Unknown or
 * invalid values are silently dropped to their default (R16.4), so a tampered
 * or stale URL still yields a usable state rather than an error.
 */
export function parseFilters(input: RawParams): FilterState {
  return withOrderedPrices({
    platform: normalizePlatform(readParam(input, "platform")),
    category: normalizeCategory(readParam(input, "category")),
    minDiscount: normalizeMinDiscount(readParam(input, "minDiscount")),
    minPrice: normalizePrice(readParam(input, "minPrice")),
    maxPrice: normalizePrice(readParam(input, "maxPrice")),
    sort: normalizeSort(readParam(input, "sort")),
    query: normalizeQuery(readParam(input, "q")),
  });
}

/**
 * Serialize a filter state into `URLSearchParams`, emitting only the active
 * filters in a stable key order (R16.3). Default/empty values — including the
 * default `recent` sort — are omitted so a pristine state yields an empty
 * query string. The state is normalized first, so the output is always
 * canonical and consumable by `/api/offers`.
 */
export function serializeFilters(state: FilterState): URLSearchParams {
  const normalized = normalizeFilterState(state);
  const params = new URLSearchParams();
  if (normalized.platform) params.set("platform", normalized.platform);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.minDiscount !== null) {
    params.set("minDiscount", String(normalized.minDiscount));
  }
  if (normalized.minPrice !== null) {
    params.set("minPrice", String(normalized.minPrice));
  }
  if (normalized.maxPrice !== null) {
    params.set("maxPrice", String(normalized.maxPrice));
  }
  if (normalized.sort !== DEFAULT_SORT) params.set("sort", normalized.sort);
  if (normalized.query) params.set("q", normalized.query);
  return params;
}

/** Convenience: the serialized query string (without a leading `?`). */
export function serializeFiltersToString(state: FilterState): string {
  return serializeFilters(state).toString();
}
