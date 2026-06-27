import type { Metadata } from "next";

import {
  ScopedOffersBrowser,
  flattenSearchParams,
} from "@/components/offers/scoped-offers-browser";
import { JsonLd } from "@/components/seo/json-ld";
import { serverEnv } from "@/lib/env.server";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/**
 * `/amazon` — the offer listing pre-scoped to Amazon México (Task 28.1, R10.1).
 *
 * A Server Component (`force-dynamic`) that reuses the shared
 * {@link ScopedOffersBrowser} with the platform forced to `amazon`: the
 * platform control is hidden while search / category / discount / price / sort /
 * pagination / realtime keep working. The fetch helpers degrade to an empty page
 * (R26.1), so the route builds without credentials.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Ofertas de Amazon México",
  description:
    "Ofertas reales de Amazon México detectadas casi en tiempo real, con su precio y descuento. Los precios y la disponibilidad pueden cambiar en la tienda.",
  alternates: { canonical: "/amazon" },
};

interface AmazonPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AmazonPage({ searchParams }: AmazonPageProps) {
  const params = flattenSearchParams(await searchParams);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Amazon México", path: "/amazon" },
        ])}
      />
      <header className="mb-8">
        <h1 className="font-serif text-h2 tracking-tight text-foreground">
          Ofertas de Amazon México
        </h1>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Las ofertas de Amazon que detectamos, en vivo. No somos Amazon; te
          enviamos a la tienda oficial mediante un enlace de afiliado. Los
          precios y la disponibilidad pueden cambiar sin previo aviso.
        </p>
      </header>

      <ScopedOffersBrowser
        params={params}
        forcedPlatform="amazon"
        showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES}
      />
    </section>
  );
}
