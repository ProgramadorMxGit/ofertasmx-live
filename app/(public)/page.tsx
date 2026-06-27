import { MessageCircle, Radar, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Hero, TrustBar } from "@/components/layout";
import { LiveOffersSection } from "@/components/offers/live-offers-section";
import { OfferCard } from "@/components/offers/offer-card";
import { JsonLd } from "@/components/seo/json-ld";
import { NoFeaturedState } from "@/components/ui/states";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { PublicOffer } from "@/lib/offers/query";
import { fetchActiveOffers, fetchFeaturedOffers } from "@/lib/offers/server-fetch";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/seo/jsonld";
import { cn } from "@/lib/utils/cn";

/**
 * Home page (`/`) (Task 26 / R13).
 *
 * SSR-loads the initial active offers and the featured offers, then composes the
 * editorial home in order (R13.4–R13.11): Hero → TrustBar → live offers →
 * featured → "cómo funciona" → transparency → final WhatsApp CTA. The
 * `(public)` route-group layout supplies the Header, the `#contenido` main
 * landmark and the Footer.
 *
 * `force-dynamic` keeps the SSR list fresh on every visit (and avoids touching
 * the database at build time); Realtime then keeps connected clients live
 * (design "Rendimiento"). The fetch helpers degrade to `[]` so the page renders
 * even without credentials.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const [initialOffers, featuredOffers] = await Promise.all([
    fetchActiveOffers({ limit: 12, sort: "recent" }),
    fetchFeaturedOffers({ limit: 5 }),
  ]);

  // Derived server toggle, threaded as a plain boolean to client/server UI (R22.2).
  const showAmazonPrices = serverEnv.SHOW_AMAZON_PRICES;

  // Hero demo cards: prefer featured, else the freshest active offers.
  const demoOffers = (featuredOffers.length > 0 ? featuredOffers : initialOffers).slice(0, 3);

  return (
    <>
      {/* Site-wide structured data (R20.3): Organization + WebSite/SearchAction. */}
      <JsonLd data={[organizationJsonLd(), webSiteJsonLd()]} />
      <Hero demoOffers={demoOffers} showAmazonPrices={showAmazonPrices} />
      <TrustBar />
      <LiveOffersSection initial={initialOffers} showAmazonPrices={showAmazonPrices} />
      <FeaturedSection offers={featuredOffers} showAmazonPrices={showAmazonPrices} />
      <HowItWorksSection />
      <TransparencySection />
      <FinalWhatsAppSection whatsappUrl={publicEnv.NEXT_PUBLIC_WHATSAPP_INVITE_URL} />
    </>
  );
}

/**
 * Featured offers (R13.8): an editorial asymmetric grid on desktop and a
 * user-driven, **non auto-rotating** horizontal carousel on mobile. Shows the
 * honest "sin destacados" state when there are none.
 */
function FeaturedSection({
  offers,
  showAmazonPrices,
}: {
  offers: readonly PublicOffer[];
  showAmazonPrices: boolean;
}) {
  return (
    <section
      aria-labelledby="featured-heading"
      className="border-t border-border bg-surface/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2
          id="featured-heading"
          className="text-h3 font-semibold tracking-tight text-foreground"
        >
          Ofertas destacadas
        </h2>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Una selección editorial de las ofertas que más valen la pena ahora mismo.
        </p>

        {offers.length === 0 ? (
          <div className="mt-8">
            <NoFeaturedState />
          </div>
        ) : (
          <ul className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-3 lg:snap-none lg:overflow-visible lg:pb-0">
            {offers.map((offer, index) => (
              <li
                key={offer.id}
                className={cn(
                  "w-[82%] shrink-0 snap-start sm:w-[340px]",
                  "lg:w-auto lg:shrink",
                  index === 0 && "lg:col-span-2 lg:row-span-2",
                )}
              >
                <OfferCard offer={offer} isFirstRow={index === 0} showAmazonPrices={showAmazonPrices} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface HowStep {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

/**
 * "Cómo funciona" (R13.9): three honest steps. Deliberately states what is
 * automatic and never claims human verification — "Verificamos" describes the
 * automated link/price checks the pipeline performs.
 */
const HOW_STEPS: readonly HowStep[] = [
  {
    icon: Radar,
    title: "Detectamos",
    body: "Recibimos las ofertas de nuestro canal y las procesamos automáticamente en cuanto llegan.",
  },
  {
    icon: ShieldCheck,
    title: "Verificamos",
    body: "De forma automática validamos el enlace, extraemos el precio y el descuento, y comprobamos que el destino sea de Amazon México o Mercado Libre.",
  },
  {
    icon: Send,
    title: "Publicamos",
    body: "Si la oferta cumple, se publica al instante y aparece en vivo, sin intervención manual.",
  },
];

function HowItWorksSection() {
  return (
    <section
      aria-labelledby="how-heading"
      className="border-t border-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2
          id="how-heading"
          className="text-h3 font-semibold tracking-tight text-foreground"
        >
          Cómo funciona
        </h2>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Un proceso automático y transparente, de principio a fin.
        </p>

        <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {HOW_STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-[22px] border border-border bg-surface p-6"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-primary">
                <step.icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="text-h6 font-semibold text-foreground">
                <span className="mr-1 tabular-nums text-muted-foreground font-tabular">
                  {index + 1}.
                </span>
                {step.title}
              </h3>
              <p className="text-meta leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * Transparency block (R13.10): the affiliate disclosure plus a link to the full
 * transparency page. Honest, no invented figures.
 */
function TransparencySection() {
  return (
    <section
      aria-labelledby="transparency-heading"
      className="border-t border-border bg-surface/30"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <h2
          id="transparency-heading"
          className="text-h4 font-semibold tracking-tight text-foreground"
        >
          Transparencia primero
        </h2>
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          Usamos enlaces de afiliado de Amazon y Mercado Libre. Como Afiliado de
          Amazon, ganamos por compras elegibles. El precio que pagas no cambia
          por usar nuestros enlaces.
        </p>
        <p className="mt-3 text-body leading-relaxed text-muted-foreground">
          No somos Amazon ni Mercado Libre. Los precios y la disponibilidad
          pueden cambiar en cada tienda sin previo aviso.
        </p>
        <Link
          href="/transparencia-afiliados"
          className="mt-6 inline-flex items-center rounded-full border border-border bg-surface px-5 py-2.5 text-body font-medium text-foreground transition-colors duration-fast ease-emphasized hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Cómo funcionan los enlaces de afiliado
        </Link>
      </div>
    </section>
  );
}

/**
 * Final WhatsApp CTA (R13.10): an honest invitation — no fake countdowns and no
 * invented scarcity.
 */
function FinalWhatsAppSection({ whatsappUrl }: { whatsappUrl: string }) {
  return (
    <section
      aria-labelledby="cta-heading"
      className="border-t border-border"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
        <h2
          id="cta-heading"
          className="text-h4 font-semibold tracking-tight text-foreground"
        >
          Recibe las ofertas en tu WhatsApp
        </h2>
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          Únete al grupo y mira las ofertas reales en cuanto las detectamos. Sin
          spam y sin costo; puedes salir cuando quieras.
        </p>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-body font-semibold text-primary-foreground transition-colors duration-fast ease-emphasized hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <MessageCircle aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
          Unirme al grupo de WhatsApp
        </a>
      </div>
    </section>
  );
}
