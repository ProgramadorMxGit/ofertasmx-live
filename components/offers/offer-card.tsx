import { ArrowRight, Clock, Sparkles, TimerOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ImageUnavailable } from "@/components/ui/states";
import { publicEnv } from "@/lib/env";
import { priceDisplay } from "@/lib/offers/price-visibility";
import type { PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";
import { absoluteSavings, formatMXN } from "@/lib/utils/money";

import { RelativeTime } from "./relative-time";
import { ShareButton } from "./share-button";

/**
 * `OfferCard` — editorial offer-card anatomy (R14).
 *
 * A **Server Component** by default; the only interactive pieces are small
 * Client islands: {@link ShareButton} (Web Share / copy) and {@link RelativeTime}
 * (hydration-safe "hace X"). Its silhouette is editorial and premium: a
 * dominant product image bleeding to the top corners over an elevated surface,
 * floating pill badges (platform + status top-left, a high-contrast discount
 * pill top-right), then a content block with a serif title (2 lines), a hair
 * separator, a serif current price next to a struck-through original, a
 * discreet green savings line, secondary publish/verified metadata, and an
 * action row that pins a high-contrast pill CTA next to a circular share
 * button, with the affiliate disclosure beneath.
 *
 * Theme-driven (R12.3): every surface/text/CTA flows from semantic tokens, so
 * the light theme reads like the reference (ivory surfaces, near-black CTA)
 * while the dark theme stays coherent (the CTA/discount become high-contrast
 * light pills). Visual hierarchy (R14.3): current price > discount > product >
 * image > original price > metadata. Motion is restrained (R18.2): a small
 * hover lift (~3px) plus a subtle image scale, hover-only and disabled under
 * reduced-motion — no spotlight/glow.
 *
 * The external CTA routes through the click redirector and carries
 * `rel="sponsored nofollow noopener"` (R11.1), with an "Enlace de afiliado"
 * label beside it (R21.2). Accessibility (R14.7): the card is labelled by its
 * title, the image has a meaningful `alt`, the CTA has an accessible name and
 * every status is conveyed by text + icon, never color alone.
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
   * Whether this card sits in the first visual row of its collection. Retained
   * for API compatibility with the grid; the design no longer renders a
   * first-row premium flourish (the reference is glow-free).
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

export function OfferCard({ offer, priority = false, showAmazonPrices }: OfferCardProps) {
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
        "group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface",
        "shadow-[0_1px_2px_rgba(15,18,25,0.04),0_18px_42px_-22px_rgba(15,18,25,0.20)]",
        "transition-[transform,box-shadow] duration-normal ease-emphasized motion-reduce:transition-none",
        "[@media(hover:hover)]:hover:-translate-y-[3px] [@media(hover:hover)]:hover:shadow-[0_2px_4px_rgba(15,18,25,0.05),0_30px_60px_-24px_rgba(15,18,25,0.30)]",
        isExpired && "opacity-80",
      )}
    >
      {/* Zona MEDIA — the product image dominates the top of the card and
          bleeds to the (rounded) top corners over an elevated surface, so it
          reads as the protagonist (R14.3, Req 2.1, 2.2). Floating badges anchor
          to this area. */}
      <div className="relative aspect-[7/6] w-full overflow-hidden bg-surface-elevated">
        {canShowImage && imageUrl !== null ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 370px"
            className={cn(
              "object-contain p-6",
              "transition-transform duration-normal ease-emphasized motion-reduce:transform-none",
              "[@media(hover:hover)]:group-hover:scale-[1.02]",
            )}
            priority={priority}
          />
        ) : (
          <ImageUnavailable />
        )}

        {/* Platform + status anchored to the top-left. Status is conveyed by
            text + icon, never color alone (Req 2.4, 2.5–2.8). */}
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-background/90 px-3 py-1.5 text-meta font-medium text-foreground shadow-sm backdrop-blur-sm">
            {platformLabel}
          </span>
          {isExpired ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-meta font-medium text-warning shadow-sm backdrop-blur-sm">
              <TimerOff aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              Expirada
            </span>
          ) : isNew ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-meta font-medium text-foreground shadow-sm backdrop-blur-sm">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
              Nueva
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-meta font-medium text-foreground shadow-sm backdrop-blur-sm">
              <span aria-hidden="true" className="inline-flex h-2 w-2 rounded-full bg-success" />
              En vivo
            </span>
          )}
        </div>

        {/* Discount pill anchored to the top-right — high-contrast (near-black
            in light, near-white in dark), shown only when a discount exists
            (Req 2.9). Second in the visual hierarchy. */}
        {offer.discount_percent !== null ? (
          <span className="absolute right-4 top-4 rounded-full bg-foreground px-3 py-1.5 text-meta font-semibold tabular-nums text-background shadow-sm font-tabular">
            -{offer.discount_percent}%
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
        <h3
          id={titleId}
          className="font-serif text-[clamp(1.25rem,1.1rem+0.7vw,1.5rem)] font-normal leading-[1.2] tracking-[-0.01em] text-foreground"
        >
          <Link
            href={detailHref}
            title={offer.title}
            className="line-clamp-2 min-h-[2.4em] rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {offer.title}
          </Link>
        </h3>

        {/* Hair separator beneath the title (Req: subtle 1px divider). */}
        <div aria-hidden="true" className="mt-4 h-px w-full bg-border" />

        {/* Price block — current price is the most prominent element (R14.3),
            in a serif face and the deep foreground color. When the Amazon price
            is hidden (R22.2), show a CTA instead — never <del> or savings. */}
        {price.kind === "hidden" ? (
          <p className="mt-4 text-body font-medium text-foreground">{price.cta}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-serif text-[clamp(1.625rem,1.4rem+0.9vw,2rem)] font-normal leading-none tabular-nums text-foreground font-tabular">
                {formatMXN(price.currentPrice)}
              </span>
              {price.originalPrice !== null ? (
                <del className="text-meta tabular-nums text-muted-foreground font-tabular">
                  {formatMXN(price.originalPrice)}
                </del>
              ) : null}
            </div>
            {savings !== null ? (
              <p className="mt-2 text-meta font-medium text-success">Ahorras {savings}</p>
            ) : null}
          </>
        )}

        {/* Metadata: publish + last-verified times (R14.1). Least prominent.
            Each <div> group inside the <dl> holds only <dt>/<dd> (valid HTML5,
            Req 8.6); the decorative Clock lives inside the <dd> beside the time
            so it never sits as a stray sibling of <dt>/<dd>. */}
        <dl className="mt-4 flex flex-col gap-1 text-meta text-muted-foreground">
          {offer.published_at ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Publicada</dt>
              <dd className="flex items-center gap-1.5">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
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

        {/* Action row pinned to the bottom so every card aligns regardless of
            title/price length (consistent heights). The Store CTA names its
            destination with visible text "Ver en {plataforma}" and an
            `ArrowRight` pinned to the right edge (decorative, `aria-hidden`).
            It routes the click through `/api/click/{offerId}` — never a
            client-supplied destination (Req 4.2, 4.3) — keeps
            `rel="sponsored nofollow noopener"` (Req 4.4) and an accessible name
            with platform + title (Req 4.5). The CTA and circular share button
            share the same height with clear separation (Req 5.x). */}
        <div className="mt-auto pt-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <a
              href={clickHref}
              target="_blank"
              rel="sponsored nofollow noopener"
              aria-label={`Ver oferta en ${platformLabel}: ${offer.title}`}
              className={cn(
                "group/cta inline-flex h-14 min-w-0 items-center justify-between gap-3 rounded-full bg-foreground px-6",
                "text-meta font-medium text-background",
                "transition-colors duration-fast ease-emphasized hover:bg-foreground/90 active:bg-foreground/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              )}
            >
              <span className="truncate">Ver en {platformLabel}</span>
              <ArrowRight
                aria-hidden="true"
                strokeWidth={2}
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-transform duration-fast ease-emphasized",
                  "group-hover/cta:translate-x-0.5 motion-reduce:transform-none",
                )}
              />
            </a>
            <ShareButton url={shareUrl} title={offer.title} />
          </div>

          {/* Disclosure de afiliado próximo a la fila de acción (R21.2, Req 4.6).
              Etiqueta visible, honesta y discreta. */}
          <p className="mt-3 text-[0.75rem] text-muted-foreground">Enlace de afiliado</p>
        </div>
      </div>
    </article>
  );
}
