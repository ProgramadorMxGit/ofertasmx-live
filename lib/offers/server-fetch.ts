import "server-only";

import {
  PUBLIC_OFFER_COLUMNS,
  buildKeysetFilter,
  encodeCursorForRow,
  orderKeysForSort,
  type OfferPlatform,
  type OffersQuery,
  type OfferSort,
  type PublicOffer,
} from "@/lib/offers/query";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server-only SSR fetch helpers for the public home page (Task 26 / R13.7,
 * R13.8, R19.3, R9.1).
 *
 * These read through the **anon** `createServerSupabaseClient`, so Row Level
 * Security only ever returns `status='active'` rows; the explicit
 * `.eq("status", "active")` is kept too so the contract holds even if a future
 * policy widens. Ordering reuses `orderKeysForSort` — the single source of truth
 * shared with `/api/offers` and the realtime feed — so the SSR list, keyset
 * pagination and the live feed all agree on order.
 *
 * Every fetch is wrapped in try/catch and degrades to `[]` on any failure
 * (missing/unreachable DB, invalid env at build/local time). The page then
 * renders its friendly empty state (R26.1) instead of crashing — so `/` builds
 * and renders without credentials.
 */

const DEFAULT_ACTIVE_LIMIT = 24;
const DEFAULT_FEATURED_LIMIT = 6;

export interface FetchActiveOffersOptions {
  /** Max rows to fetch. Defaults to {@link DEFAULT_ACTIVE_LIMIT}. */
  readonly limit?: number;
  /** List ordering; defaults to `recent`. */
  readonly sort?: OfferSort;
  /** Optional platform filter. */
  readonly platform?: OfferPlatform;
  /** Optional category slug filter (resolved to its FK id). */
  readonly categorySlug?: string;
}

/**
 * Fetch the initial active offers for SSR (R19.3, R9.1). Returns `[]` on any
 * error so the page never crashes without a database.
 */
export async function fetchActiveOffers(
  options: FetchActiveOffersOptions = {},
): Promise<PublicOffer[]> {
  const { limit = DEFAULT_ACTIVE_LIMIT, sort = "recent", platform } = options;

  try {
    const supabase = await createServerSupabaseClient();

    // Category is requested by slug but stored as an FK id — resolve it first.
    let categoryId: string | undefined;
    if (options.categorySlug) {
      const { data: category } = await supabase
        .from("offer_categories")
        .select("id")
        .eq("slug", options.categorySlug)
        .maybeSingle<{ id: string }>();
      if (!category) return []; // unknown category → no matching offers
      categoryId = category.id;
    }

    let query = supabase
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("status", "active");

    if (platform) query = query.eq("platform", platform);
    if (categoryId) query = query.eq("category_id", categoryId);

    const [primaryKey, tiebreakKey] = orderKeysForSort(sort);
    const { data, error } = await query
      .order(primaryKey.column, {
        ascending: primaryKey.ascending,
        nullsFirst: primaryKey.nullsFirst,
      })
      .order(tiebreakKey.column, {
        ascending: tiebreakKey.ascending,
        nullsFirst: tiebreakKey.nullsFirst,
      })
      .limit(limit)
      .returns<PublicOffer[]>();

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export interface FetchFeaturedOffersOptions {
  /** Max featured rows to fetch. Defaults to {@link DEFAULT_FEATURED_LIMIT}. */
  readonly limit?: number;
}

/**
 * Fetch active, featured offers for the home "destacados" grid (R13.8). Ordered
 * by most recent. Returns `[]` on any error.
 */
export async function fetchFeaturedOffers(
  options: FetchFeaturedOffersOptions = {},
): Promise<PublicOffer[]> {
  const { limit = DEFAULT_FEATURED_LIMIT } = options;

  try {
    const supabase = await createServerSupabaseClient();

    const [primaryKey, tiebreakKey] = orderKeysForSort("recent");
    const { data, error } = await supabase
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("status", "active")
      .eq("is_featured", true)
      .order(primaryKey.column, {
        ascending: primaryKey.ascending,
        nullsFirst: primaryKey.nullsFirst,
      })
      .order(tiebreakKey.column, {
        ascending: tiebreakKey.ascending,
        nullsFirst: tiebreakKey.nullsFirst,
      })
      .limit(limit)
      .returns<PublicOffer[]>();

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Paginated listing — shared by `/ofertas` (SSR) and `/api/offers` (R16, R13.7).
// ---------------------------------------------------------------------------

/** One page of the public offer listing. */
export interface OffersPage {
  readonly items: PublicOffer[];
  readonly nextCursor: string | null;
}

/**
 * Outcome of {@link executeOffersQuery}. `ok:false` is a real failure (DB error
 * or thrown exception) the caller maps to a 500 (API) or an empty degrade
 * (SSR); an unknown category is **not** a failure — it resolves to `ok:true`
 * with an empty page.
 */
export type OffersQueryResult =
  | { readonly ok: true; readonly page: OffersPage }
  | { readonly ok: false };

const EMPTY_PAGE: OffersPage = { items: [], nextCursor: null };

/**
 * Run a validated {@link OffersQuery} against the **anon** server client and
 * return one keyset page. This is the single execution path shared by the
 * `/ofertas` SSR fetch ({@link fetchOffersPage}) and the `/api/offers` route, so
 * filtering, ordering, the keyset predicate and the opaque cursor live in
 * exactly one place (all sourced from the pure `lib/offers/query` module).
 *
 * RLS only ever returns `status='active'` rows; the explicit `.eq("status",
 * "active")` is kept so the contract holds even if a policy widens. One extra
 * row is fetched (`limit + 1`) to know whether a next page exists without a
 * second round-trip. Never throws: any error (including a missing/unreachable
 * DB) resolves to `ok:false`.
 */
export async function executeOffersQuery(
  query: OffersQuery,
): Promise<OffersQueryResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // Category is requested by slug but stored as an FK id — resolve it first.
    let categoryId: string | undefined;
    if (query.categorySlug) {
      const { data: category, error: categoryError } = await supabase
        .from("offer_categories")
        .select("id")
        .eq("slug", query.categorySlug)
        .maybeSingle<{ id: string }>();
      if (categoryError) return { ok: false };
      if (!category) return { ok: true, page: EMPTY_PAGE }; // unknown → no matches
      categoryId = category.id;
    }

    let filtered = supabase
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("status", "active");

    if (query.platform) filtered = filtered.eq("platform", query.platform);
    if (categoryId) filtered = filtered.eq("category_id", categoryId);
    if (query.minDiscount !== undefined) {
      filtered = filtered.gte("discount_percent", query.minDiscount);
    }
    if (query.minPrice !== undefined) {
      filtered = filtered.gte("current_price", query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      filtered = filtered.lte("current_price", query.maxPrice);
    }

    const keysetFilter = buildKeysetFilter(query);
    if (keysetFilter) filtered = filtered.or(keysetFilter);

    const [primaryKey, tiebreakKey] = orderKeysForSort(query.sort);
    const { data, error } = await filtered
      .order(primaryKey.column, {
        ascending: primaryKey.ascending,
        nullsFirst: primaryKey.nullsFirst,
      })
      .order(tiebreakKey.column, {
        ascending: tiebreakKey.ascending,
        nullsFirst: tiebreakKey.nullsFirst,
      })
      .limit(query.limit + 1)
      .returns<PublicOffer[]>();

    if (error) return { ok: false };

    const rows = data ?? [];
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursorForRow(query.sort, last) : null;

    return { ok: true, page: { items, nextCursor } };
  } catch {
    return { ok: false };
  }
}

/**
 * SSR fetch of the first (or a cursor-addressed) page for `/ofertas` (R16,
 * R13.7, R19.3). Thin wrapper over {@link executeOffersQuery} that degrades to
 * an empty page on any failure, so the page renders its friendly state (R26.1)
 * and builds without credentials.
 */
export async function fetchOffersPage(query: OffersQuery): Promise<OffersPage> {
  const result = await executeOffersQuery(query);
  return result.ok ? result.page : EMPTY_PAGE;
}

/**
 * Resolve a category slug to its FK id (or `null` when unknown/unavailable).
 * Used by `/ofertas` to give the client a stable id for the realtime
 * visibility predicate (so a live insert in another category never slips past
 * an active category filter). Degrades to `null` on any error.
 */
export async function fetchCategoryIdBySlug(slug: string): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("offer_categories")
      .select("id")
      .eq("slug", slug)
      .maybeSingle<{ id: string }>();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Offer detail (Task 27 / R15) — single offer + related offers.
// ---------------------------------------------------------------------------

/**
 * Fetch a single **active** offer by slug for the detail page (R15.1). Reads
 * through the anon client, so RLS already restricts to `status='active'`; the
 * explicit filter keeps the "active only" contract regardless of policy. An
 * absent or non-active offer resolves to `null`, which the page turns into a
 * `notFound()` (an already-expired offer is hidden by RLS — correct; the
 * expired *transition* while viewing is handled client-side, R9.6/R15.3).
 * Degrades to `null` on any error.
 */
export async function fetchOfferBySlug(slug: string): Promise<PublicOffer | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle<PublicOffer>();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** The minimal shape {@link fetchRelatedOffers} needs to find neighbours. */
export type RelatedOfferSeed = Pick<
  PublicOffer,
  "id" | "platform" | "category_id"
>;

/**
 * Fetch active offers related to `offer` (R9.6, R15.2): same category **or**
 * same platform, excluding the offer itself, most-recent first. Returns `[]` on
 * any error. `category_id` (a UUID) and `platform` (an enum) contain no
 * PostgREST-reserved characters, so the `.or(...)` expression is safe.
 */
export async function fetchRelatedOffers(
  offer: RelatedOfferSeed,
  limit = 6,
): Promise<PublicOffer[]> {
  try {
    const supabase = await createServerSupabaseClient();

    const orClauses: string[] = [`platform.eq.${offer.platform}`];
    if (offer.category_id) orClauses.unshift(`category_id.eq.${offer.category_id}`);

    const [primaryKey, tiebreakKey] = orderKeysForSort("recent");
    const { data, error } = await supabase
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("status", "active")
      .neq("id", offer.id)
      .or(orClauses.join(","))
      .order(primaryKey.column, {
        ascending: primaryKey.ascending,
        nullsFirst: primaryKey.nullsFirst,
      })
      .order(tiebreakKey.column, {
        ascending: tiebreakKey.ascending,
        nullsFirst: tiebreakKey.nullsFirst,
      })
      .limit(limit)
      .returns<PublicOffer[]>();

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
