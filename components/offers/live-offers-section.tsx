"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import type { PublicOffer } from "@/lib/offers/query";

import { ConnectionIndicator } from "./connection-indicator";
import { OfferGrid } from "./offer-grid";
import { RelativeTime } from "./relative-time";
import { useOffersRealtime } from "./use-offers-realtime";

/**
 * `LiveOffersSection` — the home "ofertas en vivo" block (Task 26 / R13.7, R9).
 *
 * A **Client Component** seeded from the SSR `initial` list so it is fully
 * functional without Realtime (R9.1), then it runs {@link useOffersRealtime} to
 * stream inserts/updates/expiries in place. It renders the connection indicator
 * and a last-updated time (R13.7, R9.7), a presentational filter/sort bar that
 * links to `/ofertas` (full filtering lives there, Task 28), the realtime-wired
 * {@link OfferGrid} (new-offer notice + per-field highlights, R9.2, R9.4) and a
 * "ver todas" link. When the feed is empty it shows the grid's friendly empty
 * state (R26.1).
 */

interface QuickLink {
  readonly label: string;
  readonly href: string;
}

/** Platform quick-filters → `/ofertas` (real navigation, presentational here). */
const PLATFORM_LINKS: readonly QuickLink[] = [
  { label: "Todas", href: "/ofertas" },
  { label: "Amazon", href: "/ofertas?platform=amazon" },
  { label: "Mercado Libre", href: "/ofertas?platform=mercado_libre" },
];

/** Sort quick-links → `/ofertas`. */
const SORT_LINKS: readonly QuickLink[] = [
  { label: "Recientes", href: "/ofertas?sort=recent" },
  { label: "Mayor descuento", href: "/ofertas?sort=discount" },
  { label: "Menor precio", href: "/ofertas?sort=price_asc" },
];

const CHIP_CLASS =
  "inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-meta font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export interface LiveOffersSectionProps {
  /** SSR-loaded initial active offers (R9.1). */
  initial: readonly PublicOffer[];
  /** Derived `SHOW_AMAZON_PRICES` flag, threaded to the grid's cards (R22.2). */
  showAmazonPrices: boolean;
}

export function LiveOffersSection({ initial, showAmazonPrices }: LiveOffersSectionProps) {
  const {
    offers,
    status,
    newCount,
    newIds,
    highlights,
    acknowledgeNew,
    clearHighlight,
  } = useOffersRealtime(initial, "recent");

  // Honest "última actualización": the freshest `updated_at` actually shown.
  const lastUpdated = useMemo(
    () =>
      offers.reduce<string | null>(
        (max, offer) =>
          max === null || offer.updated_at > max ? offer.updated_at : max,
        null,
      ),
    [offers],
  );

  return (
    <section
      aria-labelledby="live-offers-heading"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="live-offers-heading"
            className="text-h3 font-semibold tracking-tight text-foreground"
          >
            Ofertas apareciendo ahora
          </h2>
          <p className="mt-2 max-w-prose text-body text-muted-foreground">
            Los precios y la disponibilidad pueden cambiar sin previo aviso.
          </p>
        </div>
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
      </div>

      {/* Presentational filter/sort bar → /ofertas (full filtering: Task 28). */}
      <div className="mt-6 flex flex-col gap-3 border-y border-border py-4 lg:flex-row lg:items-center lg:justify-between">
        <nav
          aria-label="Filtrar por plataforma"
          className="flex flex-wrap items-center gap-2"
        >
          {PLATFORM_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={CHIP_CLASS}>
              {link.label}
            </Link>
          ))}
        </nav>
        <nav
          aria-label="Ordenar ofertas"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-meta text-muted-foreground">Ordenar:</span>
          {SORT_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={CHIP_CLASS}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-8">
        <OfferGrid
          offers={offers}
          newIds={newIds}
          highlights={highlights}
          newCount={newCount}
          onShowNew={acknowledgeNew}
          onHighlightEnd={clearHighlight}
          showAmazonPrices={showAmazonPrices}
        />
      </div>

      <div className="mt-10 flex justify-center">
        <Link
          href="/ofertas"
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-5 py-2.5 text-body font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Ver todas las ofertas
          <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}
