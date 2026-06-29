import { ArrowRight, MessageCircle, RadioTower, Sparkles } from "lucide-react";
import Link from "next/link";

import { OfferCard } from "@/components/offers/offer-card";
import { Magnet } from "@/components/ui/magnet";
import { RevealText } from "@/components/ui/reveal-text";
import { publicEnv } from "@/lib/env";
import type { PublicOffer } from "@/lib/offers/query";
import { cn } from "@/lib/utils/cn";

/**
 * `Hero` — editorial, asymmetric home hero (Task 26 / R13.4, R18.6).
 *
 * A **Server Component**. The left column carries the editorial message — a
 * "tiempo real" badge, the H1 (with an Instrument Serif accent), a supporting
 * paragraph and two CTAs ("Ver ofertas en vivo" → `/ofertas`, "Unirme por
 * WhatsApp" → the invite URL). The right column is a composition of 2–3 real
 * demo `OfferCard`s built from the SSR-loaded data, with a discreet "flujo en
 * vivo" indicator; when no offers are loaded it degrades to honest "próximamente"
 * placeholders rather than inventing data (honesty rector).
 *
 * LCP protection (R18.6): the H1 text is server-rendered and fully readable on
 * the first paint; it is wrapped in {@link RevealText}, whose reveal is a
 * transform-only, post-hydration enhancement that no-ops under reduced motion
 * and never gates the H1. The first demo card carries `priority` for a fast
 * image LCP. The only other entrance animation is a subtle opacity/transform
 * fade on the *last*, non-priority demo card (the "incoming" card). The primary
 * CTA is wrapped in {@link Magnet}, a desktop-only, fully-gated micro-effect.
 */
export interface HeroProps {
  /** Real offers used as demo cards; up to 3 are shown. May be empty. */
  demoOffers: readonly PublicOffer[];
  /** Derived `SHOW_AMAZON_PRICES` flag, forwarded to the demo cards (R22.2). */
  showAmazonPrices: boolean;
}

export function Hero({ demoOffers, showAmazonPrices }: HeroProps) {
  const whatsappUrl = publicEnv.NEXT_PUBLIC_WHATSAPP_INVITE_URL;
  const cards = demoOffers.slice(0, 1);
  const hasCards = cards.length > 0;

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      {/* Decorative ambient glow — aria-hidden, never holds content (R25.7). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-32 -z-10 mx-auto h-72 max-w-4xl rounded-full bg-primary/10 blur-3xl"
      />

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:items-start lg:gap-10 lg:py-24">
        {/* Editorial column (asymmetric: 7 of 12). */}
        <div className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-meta font-medium text-muted-foreground">
            <span aria-hidden="true" className="inline-flex h-2 w-2 rounded-full bg-success" />
            Ofertas detectadas en tiempo real
          </span>

          <h1
            id="hero-heading"
            className="mt-5 text-h1 font-semibold tracking-tight text-foreground"
          >
            <RevealText>
              Ofertas reales,{" "}
              <span className="font-serif font-normal italic text-primary">
                antes de que desaparezcan.
              </span>
            </RevealText>
          </h1>

          <p className="mt-5 max-w-xl text-body leading-relaxed text-muted-foreground">
            Detectamos ofertas de Amazon México y Mercado Libre y las publicamos
            en vivo, con su precio y descuento reales. Sin cifras infladas ni
            urgencia inventada: solo lo que de verdad encontramos.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Magnet className="w-full sm:w-auto">
              <Link
                href="/ofertas"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-6 py-3 text-body font-semibold text-primary-foreground transition-colors duration-fast ease-emphasized hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Ver ofertas en vivo
                <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              </Link>
            </Magnet>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-6 py-3 text-body font-semibold text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              Unirme por WhatsApp
            </a>
          </div>
        </div>

        {/* Visual composition column (asymmetric: 5 of 12). */}
        <div className="lg:col-span-5">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface/40 p-4 sm:p-5">
            {/* Names the preview region so the demo cards' h3 titles do not jump
                straight from the page h1 (correct heading order, R25.1). */}
            <h2 className="sr-only">Vista previa de ofertas en vivo</h2>
            <div className="mb-4 flex items-center gap-2 text-meta font-medium text-muted-foreground">
              <RadioTower aria-hidden="true" className="h-4 w-4 text-primary" strokeWidth={2} />
              <span>Flujo en vivo</span>
              <span aria-hidden="true" className="relative ml-0.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            </div>

            {hasCards ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {cards.map((offer, index) => {
                  const wide = cards.length === 1 || (cards.length >= 3 && index === 0);
                  // The last (non-priority) card is the animated "incoming" one.
                  const incoming = cards.length >= 2 && index === cards.length - 1;
                  return (
                    <li
                      key={offer.id}
                      className={cn(
                        wide && "sm:col-span-2",
                        incoming && "animate-fade-up",
                      )}
                    >
                      <OfferCard
                        offer={offer}
                        priority={index === 0}
                        isFirstRow
                        showAmazonPrices={showAmazonPrices}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <HeroPlaceholders />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Honest stand-ins shown when no offers are loaded (e.g. local/build without a
 * database). Clearly labelled "Próximamente" — never fabricated offers.
 */
function HeroPlaceholders() {
  const slots = [0];
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {slots.map((slot) => (
        <li
          key={slot}
          className={cn(
            "flex min-h-[160px] flex-col justify-between rounded-[var(--radius)] border border-dashed border-border bg-surface/60 p-5 sm:col-span-2",
          )}
        >
          <span className="inline-flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" strokeWidth={2} />
            Próximamente
          </span>
          <p className="text-meta leading-relaxed text-muted-foreground">
            Las ofertas que detectemos aparecerán aquí en tiempo real.
          </p>
        </li>
      ))}
    </ul>
  );
}
