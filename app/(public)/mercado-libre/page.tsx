import type { Metadata } from "next";

import {
  ScopedOffersBrowser,
  flattenSearchParams,
} from "@/components/offers/scoped-offers-browser";
import { JsonLd } from "@/components/seo/json-ld";
import { serverEnv } from "@/lib/env.server";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/**
 * `/mercado-libre` — the offer listing pre-scoped to Mercado Libre (Task 28.1,
 * R10.1).
 *
 * A Server Component (`force-dynamic`) that reuses the shared
 * {@link ScopedOffersBrowser} with the platform forced to `mercado_libre`: the
 * platform control is hidden while search / category / discount / price / sort /
 * pagination / realtime keep working. The fetch helpers degrade to an empty page
 * (R26.1), so the route builds without credentials.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Ofertas de Mercado Libre",
  description:
    "Ofertas reales de Mercado Libre detectadas casi en tiempo real, con su precio y descuento. Los precios y la disponibilidad pueden cambiar en la tienda.",
  alternates: { canonical: "/mercado-libre" },
};

interface MercadoLibrePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MercadoLibrePage({
  searchParams,
}: MercadoLibrePageProps) {
  const params = flattenSearchParams(await searchParams);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Mercado Libre", path: "/mercado-libre" },
        ])}
      />
      <header className="mb-8">
        <h1 className="font-serif text-h2 tracking-tight text-foreground">
          Ofertas de Mercado Libre
        </h1>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Las ofertas de Mercado Libre que detectamos, en vivo. No somos Mercado
          Libre; te enviamos a la tienda oficial mediante un enlace de afiliado.
          Los precios y la disponibilidad pueden cambiar sin previo aviso.
        </p>
      </header>

      <ScopedOffersBrowser
        params={params}
        forcedPlatform="mercado_libre"
        showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES}
      />
    </section>
  );
}
