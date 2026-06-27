import { Clock, ExternalLink, Sparkles, TimerOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ImageUnavailable } from "@/components/ui/states";
import { publicEnv } from "@/lib/env";
import { priceDisplay } from "@/lib/offers/price-visibility";
import type { PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";
import { absoluteSavings, formatMXN } from "@/lib/utils/money";

import { PremiumSpotlight } from "./premium-spotlight";
import { RelativeTime } from "./relative-time";
import { ShareButton } from "./share-button";

/**
 * `OfferCard` — full offer-card anatomy (Task 22.3 / R14).
 *
 * A **Server Component** by default; the only interactive pieces are small
 * Client islands: {@link ShareButton} (Web Share / copy), {@link RelativeTime}
 * (hydration-safe "hace X") and {@link PremiumSpotlight} (the gated premium
 * flourish). It renders the complete anatomy required by R14.1 — image
 * (`object-fit: contain`) with a graceful fallback, platform, live/new/expired
 * status, title, discount, original price in a semantic `<del>`, prominent
 * current price, absolute savings, publish + last-verified times, an obvious
 * primary CTA and a share action — and represents the "nueva"/"expirada"
 * states (R14.2).
 *
 * Visual hierarchy (R14.3): current price > discount > product > image >
 * original price > metadata, expressed through size/weight/placement. Card
 * chrome (R14.6): 22px radius, subtle border, a small hover lift (~3px) and
 * scale (<=1.01) limited to hover-capable devices. The premium spotlight is
 * applied **only** through the gate in {@link PremiumSpotlight}
 * (featured + first row + precise pointer; off for coarse pointer /
 * reduced-motion / Save-Data). The external CTA routes through the click
 * redirector and carries `rel="sponsored nofollow noopener"` (R11.1), with an
 * "Enlace de afiliado" label beside it (R21.2). Accessibility (R14.7): the card
 * is labelled by its title, the image has a meaningful `alt`, the CTA has an
 * accessible name and every status is conveyed by text + icon, never color
 * alone.
 */

const PLATFORM_LABEL: Record<PublicOffer["platform"], string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

/** A freshly published offer (< 60 min) is badged as "Nueva" (R14.2). */
const NEW_WINDOW_MS = 60 * 60 * 1000;

export interface OfferCardProps {
  offer: PublicOffer;
  /**
   * Whether this card sits in the first visual row of its collection; enables
   * the gated premium spotlight for featured offers (R14.4).
   */
  isFirstRow?: boolean;
  /** Prioritize the image load (use for above-the-fold LCP candidates). */
  priority?: boolean;
  /**
   * Derived `SHOW_AMAZON_PRICES` flag, threaded from the server (R22.2). When
   * `false`, Amazon offers hide their numeric price and show a CTA instead;
   * Mercado Libre is unaffected. Passed as a plain boolean so this component
   * (used inside client trees) never reads the server env.
   */
  showAmazonPrices: boolean;
}

export function OfferCard({
  offer,
  isFirstRow = false,
  priority = false,
  showAmazonPrices,
}: OfferCardProps) {
  const platformLabel = PLATFORM_LABEL[offer.platform];
  const isExpired = offer.status === "expired";

  const publishedMs = offer.published_at ? Date.parse(offer.published_at) : Number.NaN;
  const isNew =
    !isExpired &&
    !Number.isNaN(publishedMs) &&
    Date.now() - publishedMs < NEW_WINDOW_MS;

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

  const detailHref = `/ofertas/${offer.slug}`;
  const clickHref = `/api/click/${offer.id}?src=card`;
  const siteBase = publicEnv.NEXT_PUBLIC_SITE_URL
    ? publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
    : "";
  const shareUrl = `${siteBase}${detailHref}`;
  const titleId = `offer-${offer.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[22px] border border-border bg-surface",
        "transition-transform duration-fast ease-emphasized motion-reduce:transition-none",
        "[@media(hover:hover)]:hover:-translate-y-[3px] [@media(hover:hover)]:hover:scale-[1.01]",
        isExpired && "opacity-80",
      )}
    >
      {/* Image (object-fit: contain) with graceful fallback (R14.6) */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-elevated">
        {canShowImage && imageUrl !== null ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-3"
            priority={priority}
          />
        ) : (
          <ImageUnavailable />
        )}

        {/* Platform + status (top-left). Text + icon, never color alone (R14.7). */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-background/85 px-2.5 py-1 text-meta font-medium text-foreground backdrop-blur-sm">
            {platformLabel}
          </span>
          {isExpired ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2.5 py-1 text-meta font-medium text-warning backdrop-blur-sm">
              <TimerOff aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              Expirada
            </span>
          ) : isNew ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2.5 py-1 text-meta font-medium text-primary backdrop-blur-sm">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              Nueva
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-meta font-medium text-foreground backdrop-blur-sm">
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              En vivo
            </span>
          )}
        </div>

        {/* Discount badge (top-right) — second in the visual hierarchy (R14.3). */}
        {offer.discount_percent !== null ? (
          <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-meta font-semibold tabular-nums text-primary-foreground font-tabular">
            -{offer.discount_percent}%
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 id={titleId} className="text-body font-medium leading-snug text-foreground">
          <Link
            href={detailHref}
            className="line-clamp-2 rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {offer.title}
          </Link>
        </h3>

        {/* Price block — current price is the most prominent element (R14.3).
            When the Amazon price is hidden (R22.2), show a CTA instead. */}
        {price.kind === "hidden" ? (
          <p className="mt-auto text-body font-semibold text-primary">{price.cta}</p>
        ) : (
          <>
            <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-h5 font-semibold tabular-nums text-foreground font-tabular">
                {formatMXN(price.currentPrice)}
              </span>
              {price.originalPrice !== null ? (
                <del className="text-meta tabular-nums text-muted-foreground font-tabular">
                  {formatMXN(price.originalPrice)}
                </del>
              ) : null}
            </div>
            {savings !== null ? (
              <p className="text-meta font-medium text-success">Ahorras {savings}</p>
            ) : null}
          </>
        )}

        {/* Metadata: publish + last-verified times (R14.1). Least prominent. */}
        <dl className="flex flex-col gap-0.5 text-meta text-muted-foreground">
          {offer.published_at ? (
            <div className="flex items-center gap-1.5">
              <Clock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
              <dt className="sr-only">Publicada</dt>
              <dd>
                <RelativeTime iso={offer.published_at} prefix="Publicada " />
              </dd>
            </div>
          ) : null}
          {offer.last_verified_at ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Última verificación</dt>
              <dd className="pl-5">
                <RelativeTime iso={offer.last_verified_at} prefix="Verificada " />
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Actions: obvious primary CTA (no hover needed) + share (R14.1). */}
        <div className="mt-1 flex items-center gap-2">
          <a
            href={clickHref}
            target="_blank"
            rel="sponsored nofollow noopener"
            aria-label={`Ver oferta en ${platformLabel}: ${offer.title}`}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5",
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

        {/* Affiliate disclosure beside the CTA (R21.2). */}
        <p className="text-meta text-muted-foreground">Enlace de afiliado</p>
      </div>

      {/* Gated premium flourish (R14.4, R14.5) — decorative, on top, click-through. */}
      <PremiumSpotlight isFeatured={offer.is_featured} isFirstRow={isFirstRow} />
    </article>
  );
}
