import {
  OffersBrowser,
  type BrowserFilters,
} from "@/components/offers/offers-browser";
import { serializeFiltersToString, type FilterState } from "@/lib/offers/filters";
import {
  DEFAULT_OFFERS_LIMIT,
  safeParseOffersQuery,
  type OfferPlatform,
  type OffersQuery,
} from "@/lib/offers/query";
import { fetchCategoryIdBySlug, fetchOffersPage } from "@/lib/offers/server-fetch";

/**
 * `ScopedOffersBrowser` — the shared SSR engine behind every public listing:
 * `/ofertas`, `/amazon`, `/mercado-libre` and `/categorias/[slug]` (Task 28.1,
 * R16, R13.7, R19.3, R10.1).
 *
 * A **Server Component** that validates the URL `searchParams` with the pure
 * `safeParseOffersQuery`, optionally **forces** a platform or category scope
 * from the route (the route always wins over a stray URL param), SSRs the first
 * keyset page through the shared `fetchOffersPage` (the same path as
 * `/api/offers`) and hands it to the client {@link OffersBrowser} — which owns
 * filter↔URL sync, the realtime feed and "load more". When the route forces a
 * dimension, the matching filter control is hidden (`lockPlatform` /
 * `lockCategory`) so the page never offers a control that contradicts its own
 * scope, while search / discount / price / sort / pagination / realtime all keep
 * working.
 *
 * `showAmazonPrices` is threaded straight through to the cards (R22.2). The
 * fetch helpers degrade to an empty page (R26.1), so every route builds and
 * renders without credentials.
 */

/** Flatten Next.js `searchParams` (arrays → first value) for the pure parser. */
export function flattenSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string") out[key] = first;
    } else if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

/** Validated query, falling back to defaults if a param/cursor is malformed. */
function resolveQuery(record: Record<string, string>): OffersQuery {
  const parsed = safeParseOffersQuery(record);
  if (parsed.success) return parsed.query;
  const fallback = safeParseOffersQuery({});
  if (fallback.success) return fallback.query;
  return { sort: "recent", limit: DEFAULT_OFFERS_LIMIT, cursor: null };
}

export interface ScopedOffersBrowserProps {
  /** Flattened URL search params for the non-scoped filters. */
  params: Record<string, string>;
  /** Route-forced platform scope; overrides any `platform` in the URL. */
  forcedPlatform?: OfferPlatform;
  /** Route-forced category slug scope; overrides any `category` in the URL. */
  forcedCategorySlug?: string;
  /** Derived `SHOW_AMAZON_PRICES` flag, threaded to the cards (R22.2). */
  showAmazonPrices: boolean;
}

export async function ScopedOffersBrowser({
  params,
  forcedPlatform,
  forcedCategorySlug,
  showAmazonPrices,
}: ScopedOffersBrowserProps) {
  const parsed = resolveQuery(params);

  // The route scope wins over a stray URL param, so the listing can never drift
  // away from the platform/category the page is about.
  const query: OffersQuery = {
    ...parsed,
    platform: forcedPlatform ?? parsed.platform,
    categorySlug: forcedCategorySlug ?? parsed.categorySlug,
  };

  const [page, categoryId] = await Promise.all([
    fetchOffersPage(query),
    query.categorySlug
      ? fetchCategoryIdBySlug(query.categorySlug)
      : Promise.resolve(null),
  ]);

  // Serialize the effective structured filters + sort (no cursor) for load-more.
  const filterState: FilterState = {
    platform: query.platform ?? null,
    category: query.categorySlug ?? null,
    minDiscount: query.minDiscount ?? null,
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    sort: query.sort,
    query: "",
  };
  const apiQueryString = serializeFiltersToString(filterState);

  const hasActiveFilters = Boolean(
    query.platform ||
      query.categorySlug ||
      query.minDiscount !== undefined ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined,
  );

  const browserFilters: BrowserFilters = {
    platform: query.platform ?? null,
    categoryId,
    minDiscount: query.minDiscount ?? null,
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
  };

  return (
    <OffersBrowser
      key={apiQueryString || "all"}
      initialItems={page.items}
      initialNextCursor={page.nextCursor}
      sort={query.sort}
      apiQueryString={apiQueryString}
      filters={browserFilters}
      hasActiveFilters={hasActiveFilters}
      showAmazonPrices={showAmazonPrices}
      lockPlatform={forcedPlatform !== undefined}
      lockCategory={forcedCategorySlug !== undefined}
    />
  );
}
