/**
 * Amazon price-visibility gate driven by the `SHOW_AMAZON_PRICES` toggle (R22.2).
 *
 * Pure, side-effect-free logic — no `server-only`, no env access — so it is
 * safe in the client bundle and fully unit/property testable (Property 24).
 * The server reads `serverEnv.SHOW_AMAZON_PRICES` and threads only the derived
 * boolean `showAmazonPrices` down to the UI; this module never touches the env
 * itself, keeping the toggle out of client components.
 *
 * Rule: a numeric price is hidden **iff** the offer is on Amazon **and** the
 * toggle is off. When hidden, the UI shows {@link HIDDEN_AMAZON_PRICE_CTA}
 * instead of the price. Mercado Libre is never affected. The structured-data
 * omission for hidden prices (R20.6) is handled separately (Task 30).
 */

import type { OfferPlatform } from "@/lib/offers/query";

/** Copy shown in place of a hidden Amazon price (R22.2). */
export const HIDDEN_AMAZON_PRICE_CTA = "Consulta el precio actual en Amazon";

/**
 * Whether the numeric price for an offer must be hidden.
 *
 * `true` **iff** `platform === "amazon"` AND `showAmazonPrices === false`.
 * Mercado Libre offers always show their price; Amazon offers show their price
 * unless the toggle is explicitly off.
 */
export function shouldHideAmazonPrice(
  platform: OfferPlatform,
  showAmazonPrices: boolean,
): boolean {
  return platform === "amazon" && showAmazonPrices === false;
}

/** Minimal offer shape needed to decide and render the price. */
export interface PriceFields {
  readonly platform: OfferPlatform;
  readonly current_price: number;
  readonly original_price: number | null;
}

/**
 * The price presentation for an offer under the current toggle.
 *
 * `kind: "hidden"` carries no numeric price at all — only the CTA — so it is
 * structurally impossible to render a hidden price. `kind: "visible"` carries
 * the current price and the optional original price for normal display.
 */
export type PriceDisplay =
  | { readonly kind: "hidden"; readonly cta: string }
  | {
      readonly kind: "visible";
      readonly currentPrice: number;
      readonly originalPrice: number | null;
    };

/**
 * Resolve how an offer's price should be presented. Returns the `"hidden"`
 * marker (with the Amazon CTA) when {@link shouldHideAmazonPrice} holds, and the
 * `"visible"` prices otherwise.
 */
export function priceDisplay(
  offer: PriceFields,
  showAmazonPrices: boolean,
): PriceDisplay {
  if (shouldHideAmazonPrice(offer.platform, showAmazonPrices)) {
    return { kind: "hidden", cta: HIDDEN_AMAZON_PRICE_CTA };
  }
  return {
    kind: "visible",
    currentPrice: offer.current_price,
    originalPrice: offer.original_price,
  };
}
