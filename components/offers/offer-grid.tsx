"use client";

import { EmptyState, NoResultsState } from "@/components/ui/states";
import type { PublicOffer } from "@/lib/offers/query";
import type { ChangedField } from "@/lib/offers/realtime-reducer";
import { cn } from "@/lib/utils/cn";

import { LiveOfferItem } from "./live-offer-item";
import { NewOffersNotice } from "./new-offers-notice";

/**
 * `OfferGrid` — responsive grid of `OfferCard`s (Task 23.3 / R13.7, R16) wired
 * for realtime (Task 24.2 / R9).
 *
 * A Client Component so it can receive live state from `useOffersRealtime`
 * (Task 24) and patch in place without re-mounting cards. New offers get a
 * brief entrance animation and a discreet "Nueva oferta encontrada" notice
 * (R9.2); updated offers get a short highlight (R9.4). It flags the first
 * visual row (up to the desktop column count) so the gated premium spotlight
 * can apply to featured offers there (R14.4). When empty it shows a friendly
 * empty / no-results state (R26.1). All realtime props are optional, so the
 * static (SSR-only) usage from Task 23 is unchanged.
 */

/** Columns at the widest breakpoint (`lg:grid-cols-3`); defines the "first row". */
const FIRST_ROW_COLUMNS = 3;

export interface OfferGridProps {
  offers: readonly PublicOffer[];
  /** Which empty state to show: a quiet feed vs. a filtered-out search. */
  emptyVariant?: "empty" | "no-results";
  className?: string;
  /** Realtime: ids inserted live (brief entrance animation). */
  newIds?: ReadonlySet<string>;
  /** Realtime: per-offer changed field to briefly highlight. */
  highlights?: Readonly<Record<string, ChangedField>>;
  /** Realtime: pending new-offers count for the discreet notice. */
  newCount?: number;
  /** Realtime: acknowledge / reveal the new offers. */
  onShowNew?: () => void;
  /** Realtime: clear a highlight once its animation elapses. */
  onHighlightEnd?: (id: string) => void;
  /** Derived `SHOW_AMAZON_PRICES` flag, forwarded to each card (R22.2). */
  showAmazonPrices: boolean;
}

export function OfferGrid({
  offers,
  emptyVariant = "empty",
  className,
  newIds,
  highlights,
  newCount = 0,
  onShowNew,
  onHighlightEnd,
  showAmazonPrices,
}: OfferGridProps) {
  if (offers.length === 0) {
    return emptyVariant === "no-results" ? <NoResultsState /> : <EmptyState />;
  }

  return (
    <>
      <NewOffersNotice count={newCount} onShow={onShowNew} className="mb-4" />
      <ul
        className={cn(
          "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
          className,
        )}
      >
        {offers.map((offer, index) => (
          <LiveOfferItem
            key={offer.id}
            offer={offer}
            isFirstRow={index < FIRST_ROW_COLUMNS}
            priority={index < 2}
            isNew={newIds?.has(offer.id) ?? false}
            highlight={highlights?.[offer.id]}
            onHighlightEnd={onHighlightEnd}
            showAmazonPrices={showAmazonPrices}
          />
        ))}
      </ul>
    </>
  );
}
