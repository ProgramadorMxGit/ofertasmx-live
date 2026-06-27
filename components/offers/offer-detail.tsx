import { ExternalLink, Info, Store, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ImageUnavailable } from "@/components/ui/states";
import { publicEnv } from "@/lib/env";
import { priceDisplay } from "@/lib/offers/price-visibility";
import type { PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";
import { absoluteSavings, formatMXN } from "@/lib/utils/money";

import { OfferExpiryWatcher } from "./offer-expiry-watcher";
import { RelatedOffers } from "./related-offers";
import { RelativeTime } from "./relative-time";
import { ShareButton } from "./share-button";

/**
 * `OfferDetail` — the full, honest offer detail view (Task 27 / R15, R21, R22, R9.6).
 *
 * A **Server Component**; the only interactive pieces are small Client islands:
 * {@link RelativeTime} (hydration-safe "hace X"), {@link ShareButton} and
 * {@link OfferExpiryWatcher} (detects an expiry while viewing). It renders
 * everything R15.1/R15.2 require — breadcrumbs, platform, title, an optimized
 * `next/image`, the prominent current price with the original `<del>`, discount
 * and absolute savings, detection + update times, a clear affiliate CTA with a
 * contiguous disclosure, an editorial description (only when present),
 * considerations and related offers — and an explicit honest price treatment
 * (R22.1).
 *
 * Honesty (R15.4): it never shows invented reviews, stock, quantities,
 * "comprando ahora", fake countdowns or unfounded "verificado" badges. Editorial
 * copy is shown only when the offer actually carries it; it is never fabricated
 * (R21.4, R21.5).
 *
 * Price source (R22.3, R22.4): `current_price`/`original_price` come from the
 * stored offer parsed server-side from the source message — there is **no**
 * browser scraping. Price access is centralized in this view, so a future
 * official product-price API can populate those fields server-side without
 * rewriting this UI.
 */

const PLATFORM_LABEL: Record<PublicOffer["platform"], string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

/** Honest, non-fabricated considerations shown before buying (R15.2, R15.4). */
function considerationsFor(platformLabel: string): readonly string[] {
  return [
    "Los precios y la disponibilidad pueden cambiar en la tienda en cualquier momento.",
    `Confirma el precio final y los detalles del producto directamente en ${platformLabel} antes de comprar.`,
    "No somos Amazon ni Mercado Libre; te llevamos a la tienda oficial mediante un enlace de afiliado.",
  ];
}

export interface OfferDetailProps {
  offer: PublicOffer;
  related: readonly PublicOffer[];
  /**
   * Derived `SHOW_AMAZON_PRICES` flag, threaded from the server (R22.2). When
   * `false`, an Amazon offer hides its numeric price and shows a CTA instead;
   * Mercado Libre is unaffected.
   */
  showAmazonPrices: boolean;
}

export function OfferDetail({ offer, related, showAmazonPrices }: OfferDetailProps) {
  const platformLabel = PLATFORM_LABEL[offer.platform];

  const imageUrl = offer.image_url;
  const canShowImage = offer.image_status === "ready" && imageUrl !== null;
  const imageAlt = offer.image_alt ?? offer.title;

  // Price visibility gate (R22.2): an Amazon price may be hidden behind a CTA.
  const price = priceDisplay(offer, showAmazonPrices);
  const originalPrice = offer.original_price;
  const savings =
    price.kind === "visible" &&
    originalPrice !== null &&
    originalPrice > offer.current_price
      ? formatMXN(absoluteSavings(originalPrice, offer.current_price))
      : null;

  // Editorial copy is optional and never fabricated (R21.4, R21.5).
  const description =
    offer.editorial_summary?.trim() || offer.short_description?.trim() || null;

  // "Última actualización" prefers the verification time, falling back to the
  // row's `updated_at` (always present). Drives the price-freshness line (R22.1).
  const lastVerifiedIso = offer.last_verified_at ?? offer.updated_at;

  const clickHref = `/api/click/${offer.id}?src=detail`;
  const siteBase = publicEnv.NEXT_PUBLIC_SITE_URL
    ? publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
    : "";
  const shareUrl = `${siteBase}/ofertas/${offer.slug}`;

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* Breadcrumbs (R15.1) */}
      <nav aria-label="Migas de pan" className="mb-6">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted-foreground">
          <li>
            <Link
              href="/"
              className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href="/ofertas"
              className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Ofertas
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="line-clamp-1 max-w-[60vw] text-foreground">
            {offer.title}
          </li>
        </ol>
      </nav>

      {/* Expiry notice if the offer ends while being viewed (R9.6, R15.3). */}
      <div className="mb-6 empty:mb-0">
        <OfferExpiryWatcher offerId={offer.id} expiresAt={offer.expires_at} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Optimized image (R15.1) with graceful fallback. */}
        <div className="relative aspect-square w-full overflow-hidden rounded-[22px] border border-border bg-surface-elevated">
          {canShowImage && imageUrl !== null ? (
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain p-6"
              priority
            />
          ) : (
            <ImageUnavailable />
          )}
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 text-meta font-medium text-foreground backdrop-blur-sm">
            <Store aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            {platformLabel}
          </span>
        </div>

        {/* Info column */}
        <div className="flex flex-col gap-5">
          <div>
            <span className="inline-flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Oferta en vivo
            </span>
            <h1 className="mt-3 font-serif text-h2 leading-tight tracking-tight text-foreground">
              {offer.title}
            </h1>
          </div>

          {/* Price block — current price is the most prominent element (R14.3, R15.1).
              When the Amazon price is hidden (R22.2), show a CTA instead. */}
          <div>
            {price.kind === "hidden" ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-h4 font-semibold text-primary">{price.cta}</span>
                {offer.discount_percent !== null ? (
                  <span className="rounded-full bg-primary px-2.5 py-1 text-meta font-semibold tabular-nums text-primary-foreground font-tabular">
                    -{offer.discount_percent}%
                  </span>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-h2 font-semibold tabular-nums text-foreground font-tabular">
                    {formatMXN(price.currentPrice)}
                  </span>
                  {price.originalPrice !== null ? (
                    <del className="text-h6 tabular-nums text-muted-foreground font-tabular">
                      {formatMXN(price.originalPrice)}
                    </del>
                  ) : null}
                  {offer.discount_percent !== null ? (
                    <span className="rounded-full bg-primary px-2.5 py-1 text-meta font-semibold tabular-nums text-primary-foreground font-tabular">
                      -{offer.discount_percent}%
                    </span>
                  ) : null}
                </div>
                {savings !== null ? (
                  <p className="mt-1.5 text-body font-medium text-success">
                    Ahorras {savings}
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* Detection + update times (R15.1) + price freshness (R22.1). */}
          <dl className="flex flex-col gap-1 text-meta text-muted-foreground">
            {offer.published_at ? (
              <div>
                <dt className="sr-only">Detectada</dt>
                <dd>
                  <RelativeTime iso={offer.published_at} prefix="Detectada " />
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="sr-only">Última actualización</dt>
              <dd>
                Última actualización: <RelativeTime iso={lastVerifiedIso} />
              </dd>
            </div>
          </dl>

          {/* Honest price-change warning (R22.1). */}
          <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-meta text-muted-foreground">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              strokeWidth={2}
            />
            El precio y la disponibilidad pueden cambiar en el comercio.
          </p>

          {/* Primary CTA + share (R15.1, R11.1, R11.2). */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <a
                href={clickHref}
                target="_blank"
                rel="sponsored nofollow noopener"
                aria-label={`Ver oferta en ${platformLabel}: ${offer.title}`}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3",
                  "text-body font-semibold text-primary-foreground",
                  "transition-colors duration-fast ease-emphasized hover:bg-primary/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              >
                Ver en {platformLabel}
                <ExternalLink aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </a>
              <ShareButton url={shareUrl} title={offer.title} />
            </div>

            {/* Affiliate disclosures contiguous to the CTA (R21.1, R21.2). */}
            <div className="space-y-1">
              <p className="text-meta font-medium text-foreground">Enlace de afiliado</p>
              {offer.platform === "amazon" ? (
                <p className="text-meta text-muted-foreground">
                  Como Afiliado de Amazon, gano por compras elegibles.
                </p>
              ) : null}
              <p className="text-meta text-muted-foreground">
                Podemos ganar una comisión por las compras hechas a través de
                nuestros enlaces, sin costo adicional para ti.{" "}
                <Link
                  href="/transparencia-afiliados"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  Cómo funcionan los enlaces de afiliado
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Editorial description — only when the offer carries it (R21.4, R21.5). */}
      {description ? (
        <section aria-labelledby="descripcion-heading" className="mt-12 max-w-prose">
          <h2
            id="descripcion-heading"
            className="text-h4 font-semibold tracking-tight text-foreground"
          >
            Sobre esta oferta
          </h2>
          <p className="mt-3 whitespace-pre-line text-body leading-relaxed text-muted-foreground">
            {description}
          </p>
        </section>
      ) : null}

      {/* Honest considerations (R15.2) — never invented data (R15.4). */}
      <section aria-labelledby="consideraciones-heading" className="mt-12 max-w-prose">
        <h2
          id="consideraciones-heading"
          className="text-h4 font-semibold tracking-tight text-foreground"
        >
          Antes de comprar
        </h2>
        <ul className="mt-3 space-y-2">
          {considerationsFor(platformLabel).map((item) => (
            <li key={item} className="flex items-start gap-2 text-body text-muted-foreground">
              <Info
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                strokeWidth={2}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Related offers (R9.6, R15.2) — anchored for the expiry notice link. */}
      <RelatedOffers
        offers={related}
        className="mt-14"
        showAmazonPrices={showAmazonPrices}
      />
    </article>
  );
}
