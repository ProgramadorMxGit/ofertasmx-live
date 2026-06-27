import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ScopedOffersBrowser,
  flattenSearchParams,
} from "@/components/offers/scoped-offers-browser";
import { JsonLd } from "@/components/seo/json-ld";
import { categoryNameForSlug } from "@/lib/offers/categories";
import { serverEnv } from "@/lib/env.server";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/**
 * `/categorias/[slug]` — the offer listing pre-scoped to one category (Task
 * 28.1, R10.1).
 *
 * A Server Component (`force-dynamic`) that validates the slug against the known
 * category set (`lib/offers/categories`) and `notFound()`s an unknown one, then
 * reuses the shared {@link ScopedOffersBrowser} with the category forced from
 * the route: the category control is hidden while search / platform / discount /
 * price / sort / pagination / realtime keep working. The fetch helpers degrade to
 * an empty page (R26.1), so the route builds without credentials.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const name = categoryNameForSlug(slug);
  if (!name) return { title: "Categoría no encontrada" };
  return {
    title: `Ofertas de ${name}`,
    description: `Ofertas reales de ${name} en Amazon México y Mercado Libre, detectadas casi en tiempo real. Los precios y la disponibilidad pueden cambiar en cada tienda.`,
    alternates: { canonical: `/categorias/${slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { slug } = await params;
  const name = categoryNameForSlug(slug);
  if (!name) notFound();

  const flatParams = flattenSearchParams(await searchParams);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Categorías", path: "/categorias" },
          { name, path: `/categorias/${slug}` },
        ])}
      />
      <header className="mb-8">
        <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
          Categoría
        </p>
        <h1 className="mt-1 font-serif text-h2 tracking-tight text-foreground">
          Ofertas de {name}
        </h1>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          Ofertas de {name} de Amazon México y Mercado Libre que detectamos, en
          vivo. Los precios y la disponibilidad pueden cambiar en cada tienda sin
          previo aviso.
        </p>
      </header>

      <ScopedOffersBrowser
        params={flatParams}
        forcedCategorySlug={slug}
        showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES}
      />
    </section>
  );
}
