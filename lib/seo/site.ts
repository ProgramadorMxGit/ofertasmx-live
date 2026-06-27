import { publicEnv } from "@/lib/env";

/**
 * Shared site identity for SEO (Task 30 / R20.8).
 *
 * Pure, client-safe helpers (no `server-only`, no DB) used by the global
 * metadata, `sitemap.ts`, `robots.ts`, `manifest.ts`, the JSON-LD builders and
 * the dynamic Open Graph image. The canonical site origin comes from
 * `publicEnv.NEXT_PUBLIC_SITE_URL` (https://programadormx.online); when that var
 * is absent — e.g. a credential-free build or a unit test — it falls back to the
 * production URL so URL building never throws and stays deterministic.
 */

/** Brand / site display name, used in titles and JSON-LD. */
export const SITE_NAME = "Ofertas Reales IA";

/** Short brand name for the web app manifest. */
export const SITE_SHORT_NAME = "Ofertas IA";

/** One-line site description reused across metadata. */
export const SITE_DESCRIPTION =
  "Ofertas reales de Amazon México y Mercado Libre, detectadas casi en tiempo real. Precios y disponibilidad pueden cambiar en cada tienda.";

/** Production origin used when the env var is missing (R20.8). */
const FALLBACK_SITE_URL = "https://programadormx.online";

function resolveSiteUrl(): string {
  const raw = publicEnv.NEXT_PUBLIC_SITE_URL;
  const value =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : FALLBACK_SITE_URL;
  // Drop any trailing slash so `${SITE_URL}${path}` never doubles it.
  return value.replace(/\/+$/, "");
}

/** Canonical site origin without a trailing slash, e.g. `https://programadormx.online`. */
export const SITE_URL = resolveSiteUrl();

/**
 * Build an absolute URL from a site-relative path. Already-absolute URLs
 * (`http(s)://…`) are returned untouched (e.g. a Storage image URL).
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
