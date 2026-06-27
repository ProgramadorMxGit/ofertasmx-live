import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { OfferDetail } from "@/components/offers/offer-detail";
import { JsonLd } from "@/components/seo/json-ld";
import { serverEnv } from "@/lib/env.server";
import type { PublicOffer } from "@/lib/offers/query";
import { fetchOfferBySlug, fetchRelatedOffers } from "@/lib/offers/server-fetch";
import { breadcrumbJsonLd, offerJsonLd } from "@/lib/seo/jsonld";

/**
 * `/ofertas/[slug]` — the offer detail page (Task 27 / R15, R21, R22, R9.6).
 *
 * A Server Component (`force-dynamic`) that loads a single **active** offer by
 * slug. An absent/non-active offer (e.g. already expired and hidden by RLS)
 * becomes a `notFound()` — correct, since expired offers are not browsable; the
 * expiry *transition while viewing* is handled client-side by the detail view.
 * Related offers are fetched server-side and passed down. The `(public)` layout
 * supplies the header / main / footer.
 *
 * `force-dynamic` keeps the offer fresh and avoids touching the DB at build
 * time; the fetch helpers degrade to `null`/`[]`, so the route builds without
 * credentials (an empty fetch simply 404s, which is acceptable at build time).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PLATFORM_LABEL: Record<PublicOffer["platform"], string> = {
  amazon: "Amazon",
  mercado_libre: "Mercado Libre",
};

/**
 * Request-deduped offer load: `generateMetadata` and the page both need the
 * offer, and React's `cache` collapses them into a single fetch per request.
 */
const getOffer = cache((slug: string): Promise<PublicOffer | null> =>
  fetchOfferBySlug(slug),
);

/** Trim to a tidy length for meta/OG descriptions without cutting mid-monstrosity. */
function clampDescription(text: string, max = 160): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

interface OfferDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Minimal per-offer metadata (R20.1): title, description and canonical. The
 * social image is supplied by the colocated `opengraph-image.tsx` (Task 30.4),
 * which Next wires into both Open Graph and Twitter automatically — so no static
 * image is listed here.
 */
export async function generateMetadata({
  params,
}: OfferDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const offer = await getOffer(slug);
  if (!offer) {
    return { title: "Oferta no encontrada" };
  }

  const rawDescription =
    offer.editorial_summary?.trim() ||
    offer.short_description?.trim() ||
    `${offer.title} — oferta en ${PLATFORM_LABEL[offer.platform]}. Los precios y la disponibilidad pueden cambiar.`;
  const description = clampDescription(rawDescription);
  const canonical = `/ofertas/${offer.slug}`;

  return {
    title: offer.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: offer.title,
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function OfferDetailPage({ params }: OfferDetailPageProps) {
  const { slug } = await params;
  const offer = await getOffer(slug);
  if (!offer) notFound();

  const related = await fetchRelatedOffers(offer);

  // Structured data (R20.3–R20.6): breadcrumb trail + honest Product/Offer.
  // `offerJsonLd` is null for a non-active offer (never reached here, since the
  // page only renders active offers) and omits the price when it is hidden.
  const breadcrumb = breadcrumbJsonLd([
    { name: "Inicio", path: "/" },
    { name: "Ofertas", path: "/ofertas" },
    { name: offer.title, path: `/ofertas/${offer.slug}` },
  ]);
  const product = offerJsonLd(offer, {
    showAmazonPrices: serverEnv.SHOW_AMAZON_PRICES,
  });

  return (
    <>
      <JsonLd data={product ? [breadcrumb, product] : [breadcrumb]} />
      <OfferDetail
        offer={offer}
        related={related}
        showAmazonPrices={serverEnv.SHOW_AMAZON_PRICES}
      />
    </>
  );
}
