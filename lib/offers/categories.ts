/**
 * Canonical catalogue of public offer categories (R10.1, R16.1).
 *
 * Single source of truth for the eight category `slug`/`name` pairs, aligned
 * with the seeded `offer_categories` table (`supabase/seed.sql`) and the parser
 * classifier (`lib/parser/category.ts`). Pure data — no React, no `server-only`,
 * no DB — so it is importable from Server Components (the `/categorias` pages),
 * Client Components (the `Filters` dropdown) and tests alike.
 *
 * The order here is the display order used by the `/categorias` index and the
 * filter dropdown; it mirrors the `sort_order` seeded for each category.
 */

/** A public category: its URL slug and its human-readable display name. */
export interface OfferCategory {
  /** URL-safe slug stored in `offer_categories.slug` (e.g. `electronica`). */
  readonly slug: string;
  /** Display name shown in the UI (e.g. `Electrónica`). */
  readonly name: string;
}

/**
 * The eight categories, in display order. Matches the seeded catalogue and the
 * parser's `CATEGORIES` (with `Otros` as the total fallback bucket).
 */
export const OFFER_CATEGORIES: readonly OfferCategory[] = [
  { slug: "electronica", name: "Electrónica" },
  { slug: "hogar", name: "Hogar" },
  { slug: "moda", name: "Moda" },
  { slug: "herramientas", name: "Herramientas" },
  { slug: "oficina", name: "Oficina" },
  { slug: "belleza", name: "Belleza" },
  { slug: "deportes", name: "Deportes" },
  { slug: "otros", name: "Otros" },
];

/** Fast slug → category lookup, built once from {@link OFFER_CATEGORIES}. */
const CATEGORY_BY_SLUG: ReadonlyMap<string, OfferCategory> = new Map(
  OFFER_CATEGORIES.map((category) => [category.slug, category]),
);

/** Whether `slug` is one of the known public category slugs. */
export function isKnownCategorySlug(slug: string): boolean {
  return CATEGORY_BY_SLUG.has(slug);
}

/** The category for a slug, or `null` when the slug is unknown. */
export function categoryForSlug(slug: string): OfferCategory | null {
  return CATEGORY_BY_SLUG.get(slug) ?? null;
}

/** The display name for a slug, or `null` when the slug is unknown. */
export function categoryNameForSlug(slug: string): string | null {
  return CATEGORY_BY_SLUG.get(slug)?.name ?? null;
}
