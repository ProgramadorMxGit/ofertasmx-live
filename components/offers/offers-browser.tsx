"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

import { NetworkErrorState, Skeleton } from "@/components/ui/states";
import type { OfferPlatform, OfferSort, PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";

import { ConnectionIndicator } from "./connection-indicator";
import { Filters } from "./filters";
import { OfferGrid } from "./offer-grid";
import { RelativeTime } from "./relative-time";
import { SearchCommand } from "./search-command";
import { publicOfferSchema, useOffersRealtime } from "./use-offers-realtime";

/**
 * `OffersBrowser` — the client engine of the `/ofertas` listing (R16, R13.7, R9).
 *
 * The page Server Component SSRs the first keyset page (so the list is useful
 * with no JS and with no Realtime, R9.1/R19.3) and hands it here. This wrapper
 * owns the three interactive concerns the server cannot:
 *
 *   1. **Filter ↔ URL sync** — delegated to {@link Filters}, which reads/writes
 *      `searchParams` (R16.1–R16.4). Because the page is keyed by the active
 *      filter set, any filter change re-runs the server fetch and remounts this
 *      component with a fresh SSR page; back/forward navigation restores it.
 *   2. **Realtime** — {@link useOffersRealtime} streams inserts/updates/expiries
 *      in place (R9.2, R9.4, R9.5). Since the Realtime channel is not
 *      filter-scoped, the merged feed is passed through a visibility predicate
 *      built from the active filters so a live insert from another platform /
 *      category / price band never slips past an active filter.
 *   3. **Progressive loading** — "Cargar más" fetches the next keyset page from
 *      `/api/offers` using the opaque cursor (R13.7) and re-seeds the realtime
 *      feed with the union of the live list and the new page, so live state is
 *      preserved across loads.
 *
 * Skeletons cover the load-more wait; a friendly no-results / empty state shows
 * when nothing matches (R16.6, R26.1).
 */

/** Structured filters mirrored client-side for the realtime visibility gate. */
export interface BrowserFilters {
  readonly platform: OfferPlatform | null;
  /** Resolved category FK id (the realtime row carries `category_id`, not slug). */
  readonly categoryId: string | null;
  readonly minDiscount: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
}

export interface OffersBrowserProps {
  /** SSR-loaded first page (R19.3). */
  initialItems: readonly PublicOffer[];
  /** Opaque cursor for the next page, or `null` when there are no more. */
  initialNextCursor: string | null;
  /** Active sort; drives realtime insertion position and the API request. */
  sort: OfferSort;
  /** Serialized structured filters + sort (no cursor) for the `/api/offers` URL. */
  apiQueryString: string;
  /** Active filters mirrored for the realtime visibility predicate. */
  filters: BrowserFilters;
  /** Whether any structured filter is active (selects empty vs. no-results copy). */
  hasActiveFilters: boolean;
  /** Derived `SHOW_AMAZON_PRICES` flag, threaded to the grid's cards (R22.2). */
  showAmazonPrices: boolean;
  /** Hide the platform filter because the route already scopes it (e.g. `/amazon`). */
  lockPlatform?: boolean;
  /** Hide the category filter because the route already scopes it (e.g. `/categorias/[slug]`). */
  lockCategory?: boolean;
}

/** Response shape of `/api/offers`, validated rather than trusted. */
const offersPageResponseSchema = z.object({
  items: z.array(publicOfferSchema),
  nextCursor: z.string().nullable(),
});

/** Whether a realtime row still satisfies the active structured filters. */
function matchesBrowserFilters(offer: PublicOffer, f: BrowserFilters): boolean {
  if (f.platform && offer.platform !== f.platform) return false;
  if (f.categoryId && offer.category_id !== f.categoryId) return false;
  if (
    f.minDiscount !== null &&
    (offer.discount_percent === null || offer.discount_percent < f.minDiscount)
  ) {
    return false;
  }
  if (f.minPrice !== null && offer.current_price < f.minPrice) return false;
  if (f.maxPrice !== null && offer.current_price > f.maxPrice) return false;
  return true;
}

/** Dedupe by id, keeping the last occurrence (freshest data wins). */
function mergeById(offers: readonly PublicOffer[]): PublicOffer[] {
  const map = new Map<string, PublicOffer>();
  for (const offer of offers) map.set(offer.id, offer);
  return [...map.values()];
}

const LOAD_MORE_SKELETONS = 4;

export function OffersBrowser({
  initialItems,
  initialNextCursor,
  sort,
  apiQueryString,
  filters,
  hasActiveFilters,
  showAmazonPrices,
  lockPlatform = false,
  lockCategory = false,
}: OffersBrowserProps) {
  // The list fed to the realtime hook. Grows (by union) as more pages load.
  const [seed, setSeed] = useState<readonly PublicOffer[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const {
    offers,
    status,
    newIds,
    highlights,
    acknowledgeNew,
    clearHighlight,
  } = useOffersRealtime(seed, sort);

  // Hide live rows that do not match the active filters (the channel is global).
  const visibleOffers = useMemo(
    () => offers.filter((offer) => matchesBrowserFilters(offer, filters)),
    [offers, filters],
  );

  // Count only the new offers actually visible, so the notice stays honest.
  const visibleNewCount = useMemo(() => {
    if (newIds.size === 0) return 0;
    let count = 0;
    for (const offer of visibleOffers) if (newIds.has(offer.id)) count += 1;
    return count;
  }, [visibleOffers, newIds]);

  // Honest "última actualización": the freshest `updated_at` actually shown.
  const lastUpdated = useMemo(
    () =>
      visibleOffers.reduce<string | null>(
        (max, offer) =>
          max === null || offer.updated_at > max ? offer.updated_at : max,
        null,
      ),
    [visibleOffers],
  );

  const loadMore = useCallback(async () => {
    if (cursor === null || loading) return;
    setLoading(true);
    setLoadError(false);
    try {
      const url =
        `/api/offers?${apiQueryString}` +
        `${apiQueryString ? "&" : ""}cursor=${encodeURIComponent(cursor)}`;
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const parsed = offersPageResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("respuesta inválida");

      // Re-seed with the union of the current live list and the new page, so
      // live inserts/patches survive the load (the hook re-sorts on seed).
      setSeed(mergeById([...offers, ...parsed.data.items]));
      setCursor(parsed.data.nextCursor);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [apiQueryString, cursor, loading, offers]);

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar: connection + last-updated (left), search (right) (R13.7). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionIndicator status={status} />
          {lastUpdated ? (
            <RelativeTime
              iso={lastUpdated}
              prefix="Actualizado "
              className="text-meta text-muted-foreground"
            />
          ) : null}
        </div>
        <SearchCommand offers={visibleOffers} />
      </div>

      {/* Filters synced to the URL; on mobile they open in a drawer (R17.2). */}
      <Filters lockPlatform={lockPlatform} lockCategory={lockCategory} />

      <h2 className="sr-only">Resultados</h2>
      <OfferGrid
        offers={visibleOffers}
        emptyVariant={hasActiveFilters ? "no-results" : "empty"}
        newIds={newIds}
        highlights={highlights}
        newCount={visibleNewCount}
        onShowNew={acknowledgeNew}
        onHighlightEnd={clearHighlight}
        showAmazonPrices={showAmazonPrices}
      />

      {loading ? (
        <ul
          aria-hidden="true"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {Array.from({ length: LOAD_MORE_SKELETONS }).map((_, index) => (
            <li key={index}>
              <LoadMoreSkeletonCard />
            </li>
          ))}
        </ul>
      ) : null}

      {loadError ? (
        <NetworkErrorState
          action={
            <button
              type="button"
              onClick={loadMore}
              className="rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-meta font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Reintentar
            </button>
          }
        />
      ) : null}

      {cursor !== null && !loadError ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-6 py-2.5",
              "text-body font-medium text-foreground transition-colors duration-fast ease-emphasized",
              "hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {loading ? "Cargando…" : "Cargar más ofertas"}
            {loading ? null : (
              <ChevronDown aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A single placeholder card matching the offer-card silhouette. */
function LoadMoreSkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-9 w-full rounded-[var(--radius-control)]" />
      </div>
    </div>
  );
}
