import { shouldHideAmazonPrice } from "@/lib/offers/price-visibility";
import type { OfferPlatform } from "@/lib/offers/query";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";

/**
 * Honest JSON-LD builders (Task 30.2 / R20.3–R20.6).
 *
 * Pure, side-effect-free functions that return plain JSON-LD objects. They are
 * the structured-data materialization of the honesty rector (design "Visión
 * general"): the System never asserts facts it cannot back. Concretely, the
 * `Product`/`Offer` builder:
 *   - emits a node ONLY for a real, current offer (`status === "active"`),
 *     returning `null` otherwise — so an expired/hidden offer is never present
 *     in structured data, hence never marked available (R20.4, R20.5);
 *   - OMITS the entire `Offer` node (price/priceCurrency) when the price is not
 *     guaranteed — specifically when the Amazon price is hidden by the
 *     `SHOW_AMAZON_PRICES` toggle — never fabricating a price (R20.6);
 *   - uses `LimitedAvailability` (never `InStock`) for the listed offer, since
 *     merchant stock is never verified.
 *
 * `Organization`, `WebSite` (+ `SearchAction`) and `BreadcrumbList` are always
 * safe to emit and carry no offer-specific claims (R20.3).
 */

/** A JSON-LD-serializable value (no `any`). */
export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | JsonLdNode;

/** A JSON-LD object node. `undefined` members are dropped by `JSON.stringify`. */
export interface JsonLdNode {
  readonly [key: string]: JsonLdValue | undefined;
}

const SCHEMA_CONTEXT = "https://schema.org";

/**
 * Serialize one or more JSON-LD documents for safe embedding inside a
 * `<script type="application/ld+json">`. The `<` escaping prevents a stray
 * `</script>` (or any tag) in offer text from breaking out of the script
 * element — the only injection vector for inline JSON.
 */
export function serializeJsonLd(data: JsonLdNode | readonly JsonLdNode[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** `Organization` node — site identity (R20.3). */
export function organizationJsonLd(): JsonLdNode {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/logo.svg"),
  };
}

/**
 * `WebSite` node with a `SearchAction` (R20.3). The search entry point targets
 * the public listing, where the in-page search lives, so the sitelinks search
 * box lands users on a search-capable page.
 */
export function webSiteJsonLd(): JsonLdNode {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "es-MX",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/ofertas?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** One crumb in a {@link breadcrumbJsonLd} trail. */
export interface BreadcrumbItem {
  /** Human-readable label, e.g. `Ofertas`. */
  readonly name: string;
  /** Site-relative path, e.g. `/ofertas`. Resolved to an absolute URL. */
  readonly path: string;
}

/** `BreadcrumbList` node built from an ordered trail (R20.3). */
export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]): JsonLdNode {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** Minimal offer shape needed to build honest `Product`/`Offer` JSON-LD. */
export interface OfferJsonLdInput {
  readonly title: string;
  readonly slug: string;
  readonly platform: OfferPlatform;
  readonly status: string;
  readonly current_price: number;
  readonly original_price: number | null;
  readonly currency: string;
  readonly image_url: string | null;
  readonly image_status: string;
  readonly image_alt: string | null;
  readonly editorial_summary: string | null;
  readonly short_description: string | null;
}

/** Options for {@link offerJsonLd}. */
export interface OfferJsonLdOptions {
  /** Derived `SHOW_AMAZON_PRICES` toggle, threaded from the server (R22.2). */
  readonly showAmazonPrices: boolean;
}

/**
 * Build an honest `Product` (+ optional `Offer`) node, or `null` when the offer
 * must not be represented as a current product (R20.4–R20.6).
 *
 * Returns `null` unless the offer is `active`, so non-active offers (expired,
 * hidden, draft, …) never appear in structured data and are never marked
 * available (R20.5). The `Offer` sub-node — carrying `price`/`priceCurrency` —
 * is omitted entirely when the Amazon price is hidden by the toggle, so a price
 * that is not guaranteed is never published (R20.6). The product image is
 * included only when a real image is ready (never a placeholder).
 */
export function offerJsonLd(
  offer: OfferJsonLdInput,
  options: OfferJsonLdOptions,
): JsonLdNode | null {
  if (offer.status !== "active") return null;

  const url = absoluteUrl(`/ofertas/${offer.slug}`);
  const description =
    offer.editorial_summary?.trim() || offer.short_description?.trim() || undefined;
  const image =
    offer.image_status === "ready" && offer.image_url ? offer.image_url : undefined;

  // R20.6: hidden Amazon price ⇒ price not guaranteed ⇒ omit the whole Offer
  // node rather than publish (or fabricate) a price.
  const priceHidden = shouldHideAmazonPrice(offer.platform, options.showAmazonPrices);
  const offers: JsonLdNode | undefined = priceHidden
    ? undefined
    : {
        "@type": "Offer",
        price: offer.current_price.toFixed(2),
        priceCurrency: offer.currency || "MXN",
        url,
        // Listed only — merchant stock is never asserted as guaranteed.
        availability: "https://schema.org/LimitedAvailability",
      };

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Product",
    name: offer.title,
    url,
    image,
    description,
    offers,
  };
}
