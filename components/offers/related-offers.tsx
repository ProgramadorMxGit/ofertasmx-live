import type { PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";

import { OfferCard } from "./offer-card";

/**
 * `RelatedOffers` — recommendations by category / platform (R9.6, R15.2).
 *
 * A **Server Component** that reuses {@link OfferCard}. It is fed an
 * already-fetched list (the detail page resolves it via `fetchRelatedOffers`),
 * so it stays presentational. Renders nothing when there are no neighbours, so
 * the detail page never shows an empty "relacionadas" shell. Anchored by `id`
 * so the expired-offer notice can point visitors here.
 */
export interface RelatedOffersProps {
  offers: readonly PublicOffer[];
  /** Anchor id so other UI (e.g. the expiry notice) can link here. */
  id?: string;
  heading?: string;
  className?: string;
  /** Derived `SHOW_AMAZON_PRICES` flag, forwarded to each card (R22.2). */
  showAmazonPrices: boolean;
}

export function RelatedOffers({
  offers,
  id = "ofertas-relacionadas",
  heading = "Ofertas relacionadas",
  className,
  showAmazonPrices,
}: RelatedOffersProps) {
  if (offers.length === 0) return null;

  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-24", className)}
    >
      <h2
        id={headingId}
        className="text-h4 font-semibold tracking-tight text-foreground"
      >
        {heading}
      </h2>
      <p className="mt-2 max-w-prose text-body text-muted-foreground">
        Otras ofertas de la misma categoría o tienda que podrían interesarte.
      </p>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((offer) => (
          <li key={offer.id}>
            <OfferCard offer={offer} showAmazonPrices={showAmazonPrices} />
          </li>
        ))}
      </ul>
    </section>
  );
}
