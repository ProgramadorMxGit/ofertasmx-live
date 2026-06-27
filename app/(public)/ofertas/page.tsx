import type { Metadata } from "next";

import {
  ScopedOffersBrowser,
  flattenSearchParams,
} from "@/components/offers/scoped-offers-browser";
import { JsonLd } from "@/components/seo/json-ld";
import { serverEnv } from "@/lib/env.server";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/**
 * `/ofertas` — the full offer listing with filters, search and progressive
 * loading (R16, R13.7, R19.3, R19.6).
 *
 * A Server Component (`force-dynamic`) that delegates the SSR fetch + client
 * wiring to the shared {@link ScopedOffersBrowser} (no forced scope here, so all
 * filters — including platform and category — are available). The `(public)`
 * layout supplies the header / main / footer.
 *
 * `force-dynamic` keeps the SSR list fresh per visit and avoids touching the DB
 * at build time; the fetch helpers degrade to an empty page (R26.1), so the
 * route builds and renders without credentials.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Ofertas en vivo",
  description:
    "Explora, filtra y busca ofertas reales de Amazon México y Mercado Libre, actualizadas casi en tiempo real. Los precios y la disponibilidad pueden cambiar en cada tienda.",
  alternates: { canonical: "/ofertas" },
};

interface OfertasPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OfertasPage({ searchParams }: OfertasPageProps) {
  const params = flattenSearchParams(await searchParams);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Ofertas", path: "/ofertas" },
        ])}
      />
      <header className="mb-8">
        <h1 className="font-serif text-h2 tracking-tight text-foreground">
          Ofertas en vivo
        </h1>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Filtra por plataforma, categoría, descuento y precio, u ordénalas como
          prefieras. Los precios y la disponibilidad pueden cambiar en cada
          tienda sin previo aviso.
        </p>
      </header>

      <ScopedOffersBrowser
        params={params}
        showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES}
      />
    </section>
  );
}
