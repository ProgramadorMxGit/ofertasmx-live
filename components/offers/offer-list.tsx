"use client";

import { EmptyState, NoResultsState } from "@/components/ui/states";
import type { PublicOffer } from "@/lib/offers/query";
import type { ChangedField } from "@/lib/offers/realtime-reducer";
import { cn } from "@/lib/utils/cn";

import { LiveOfferItem } from "./live-offer-item";
import { NewOffersNotice } from "./new-offers-notice";

/**
 * `OfferList` — single-column list view reusing `OfferCard` (Task 23.3 / R16)
 * wired for realtime (Task 24.2 / R9).
 *
 * The list alternative to {@link OfferGrid}. Only the first item is in the
 * "first row", so the gated premium spotlight may apply there for a featured
 * offer (R14.4). Like the grid, it is a Client Component fed by realtime state:
 * new items animate in with a discreet notice (R9.2) and updated items briefly
 * highlight without re-mounting (R9.4). It shows a friendly empty / no-results
 * state when there is nothing to render (R26.1). All realtime props are
 * optional, preserving the static (SSR-only) usage from Task 23.
 */
export interface OfferListProps {
  offers: readonly PublicOffer[];
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

export function OfferList({
  offers,
  emptyVariant = "empty",
  className,
  newIds,
  highlights,
  newCount = 0,
  onShowNew,
  onHighlightEnd,
  showAmazonPrices,
}: OfferListProps) {
  if (offers.length === 0) {
    return emptyVariant === "no-results" ? <NoResultsState /> : <EmptyState />;
  }

  return (
    <>
      <NewOffersNotice count={newCount} onShow={onShowNew} className="mb-4" />
      <ul className={cn("mx-auto flex max-w-2xl flex-col gap-4", className)}>
        {offers.map((offer, index) => (
          <LiveOfferItem
            key={offer.id}
            offer={offer}
            isFirstRow={index === 0}
            priority={index === 0}
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
