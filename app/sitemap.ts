import type { MetadataRoute } from "next";

import { OFFER_CATEGORIES } from "@/lib/offers/categories";
import { SITE_URL } from "@/lib/seo/site";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Dynamic sitemap (Task 30.1 / R20.2).
 *
 * Combines the static public routes, the eight category routes and the slugs of
 * every **active** offer. Offer slugs are fetched through the **anon** server
 * client, so RLS only ever exposes `status='active'` rows (the explicit filter
 * keeps that contract even if a policy widens). Any failure (missing/unreachable
 * DB, credential-free build) degrades to just the static + category routes, so
 * the sitemap always builds and renders.
 *
 * `force-dynamic` keeps the offer set fresh and avoids touching the DB at build
 * time.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SitemapEntry = MetadataRoute.Sitemap[number];

/** Public, indexable routes (admin and API are excluded — see `robots.ts`). */
const STATIC_PATHS = [
  "/",
  "/ofertas",
  "/amazon",
  "/mercado-libre",
  "/categorias",
  "/como-funciona",
  "/transparencia-afiliados",
  "/privacidad",
  "/terminos",
  "/contacto",
] as const;

/** Cap so a large catalogue cannot produce an unbounded sitemap. */
const MAX_OFFER_URLS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: SitemapEntry[] = STATIC_PATHS.map((path): SitemapEntry => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" || path === "/ofertas" ? "hourly" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const categoryEntries: SitemapEntry[] = OFFER_CATEGORIES.map(
    (category): SitemapEntry => ({
      url: `${SITE_URL}/categorias/${category.slug}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    }),
  );

  let offerEntries: SitemapEntry[] = [];
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("offers")
      .select("slug, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(MAX_OFFER_URLS)
      .returns<{ slug: string; updated_at: string }[]>();

    if (!error && data) {
      offerEntries = data.map((offer): SitemapEntry => ({
        url: `${SITE_URL}/ofertas/${offer.slug}`,
        lastModified: offer.updated_at ? new Date(offer.updated_at) : now,
        changeFrequency: "daily",
        priority: 0.8,
      }));
    }
  } catch {
    offerEntries = [];
  }

  return [...staticEntries, ...categoryEntries, ...offerEntries];
}
