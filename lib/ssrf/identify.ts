/**
 * Identifier extraction, affiliate-tag handling and the SSRF-backed
 * {@link LinkPort} (R5.5–R5.9).
 *
 * Pure logic, no I/O. This module:
 *  - extracts the Amazon ASIN from `/dp/`, `/gp/product/`, `/gp/aw/d/` paths or
 *    an `asin` query parameter (10 chars `[A-Z0-9]`, R5.5);
 *  - extracts the Mercado Libre `MLM` identifier when present (R5.9);
 *  - preserves the Amazon `tag` parameter verbatim — it is **never** rewritten —
 *    and flags `needsReview` when it differs from the expected tracking id
 *    (R5.6, R5.7, R5.8);
 *  - exposes {@link createLinkPort}, the {@link LinkPort} implementation the
 *    parser consumes by injection. `detect` is pure and works on already-long
 *    URLs; expanding short links (`amzn.to`/`meli.la`) is done out-of-band by
 *    {@link resolveShortLink} in the asynchronous webhook path (Task 14).
 */

import type { LinkInfo, LinkPort, Platform } from "@/lib/parser/parse";
import {
  validateUrl,
  type SsrfConfig,
} from "@/lib/ssrf/validate";

/** Default Amazon affiliate tracking id (`AMAZON_TRACKING_ID`, R5.7). */
export const DEFAULT_AMAZON_TRACKING_ID = "programadormx-20";

const AMAZON_MERCHANT = "Amazon México";
const MERCADO_LIBRE_MERCHANT = "Mercado Libre";

/**
 * ASIN in a path segment: 10 chars `[A-Z0-9]` after `/dp/`, `/gp/product/` or
 * `/gp/aw/d/`, bounded so it is a complete token (R5.5). Case-insensitive; the
 * result is upper-cased to the canonical ASIN form.
 */
const ASIN_PATH_RE = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Za-z0-9]{10})(?=$|[/?#&])/i;
const ASIN_VALUE_RE = /^[A-Za-z0-9]{10}$/;

/** Mercado Libre identifier `MLM` followed by digits, optional hyphen. */
const MLM_RE = /MLM-?(\d+)/i;

function toUrl(input: string | URL): URL | null {
  if (input instanceof URL) return input;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/**
 * Extracts the Amazon ASIN from a URL, or `null`. Recognizes `/dp/<ASIN>`,
 * `/gp/product/<ASIN>`, `/gp/aw/d/<ASIN>` and the `asin` query parameter
 * (R5.5). The returned id is normalized to upper case.
 */
export function extractAsin(input: string | URL): string | null {
  const url = toUrl(input);
  if (url === null) return null;

  const match = ASIN_PATH_RE.exec(url.pathname);
  if (match !== null) return match[1].toUpperCase();

  const queryAsin = url.searchParams.get("asin");
  return queryAsin !== null && ASIN_VALUE_RE.test(queryAsin)
    ? queryAsin.toUpperCase()
    : null;
}

/**
 * Extracts the Mercado Libre `MLM` identifier from a URL, or `null`. Normalizes
 * both `MLM-123` and `MLM123` to the canonical `MLM123` form (R5.9).
 */
export function extractMlm(input: string | URL): string | null {
  const url = toUrl(input);
  if (url === null) return null;
  const haystack = `${url.pathname} ${url.search}`;
  const match = MLM_RE.exec(haystack);
  return match !== null ? `MLM${match[1]}` : null;
}

/** Result of inspecting (never altering) an Amazon affiliate tag. */
export interface TagVerification {
  /** The `tag` exactly as it appears in the URL (never rewritten), or `null`. */
  tag: string | null;
  /** `true` when a tag is present and differs from the expected id (R5.8). */
  needsReview: boolean;
}

/**
 * Reads the Amazon `tag` parameter and compares it against the expected
 * tracking id **without modifying the URL** (R5.6, R5.7, R5.8). An absent tag
 * never triggers review.
 */
export function verifyAmazonTag(
  input: string | URL,
  trackingId: string = DEFAULT_AMAZON_TRACKING_ID,
): TagVerification {
  const url = toUrl(input);
  if (url === null) return { tag: null, needsReview: false };
  const tag = url.searchParams.get("tag");
  if (tag === null) return { tag: null, needsReview: false };
  return { tag, needsReview: tag !== trackingId };
}

/** Maps an allowed host to its platform, or `null` when unrecognized. */
function hostPlatform(host: string): Platform | null {
  const h = host.toLowerCase();
  if (h === "amzn.to") return "amazon";
  if (h === "meli.la") return "mercado_libre";
  if (h === "amazon.com.mx" || h.endsWith(".amazon.com.mx")) return "amazon";
  if (h === "mercadolibre.com.mx" || h.endsWith(".mercadolibre.com.mx")) {
    return "mercado_libre";
  }
  return null;
}

/** Configuration for {@link createLinkPort}. */
export interface LinkPortConfig extends SsrfConfig {
  /** Expected Amazon affiliate tag. Defaults to {@link DEFAULT_AMAZON_TRACKING_ID}. */
  trackingId?: string;
}

/**
 * Builds the SSRF-backed {@link LinkPort} the parser consumes by injection.
 *
 * The webhook (Task 14) constructs it with the configured allowlist and
 * `AMAZON_TRACKING_ID`, then passes it to `parseOffer(input, linkPort)`:
 *
 *   const link = createLinkPort({ trackingId: serverEnv.AMAZON_TRACKING_ID });
 *   const result = parseOffer(input, link);
 *
 * `detect` performs **no network I/O**: it validates the URL against the
 * allowlist/SSRF rules, classifies the platform, extracts the ASIN/MLM when the
 * URL is already long, and preserves the Amazon tag verbatim. Short links
 * (`amzn.to`/`meli.la`) carry no identifier in the URL itself; expanding them
 * with {@link resolveShortLink} happens in the asynchronous webhook path.
 */
export function createLinkPort(config: LinkPortConfig = {}): LinkPort {
  const trackingId = config.trackingId ?? DEFAULT_AMAZON_TRACKING_ID;
  const ssrfConfig: SsrfConfig = { allowlist: config.allowlist };

  return {
    detect(rawUrl: string): LinkInfo | null {
      const verdict = validateUrl(rawUrl, ssrfConfig);
      if (!verdict.ok) return null;

      const platform = hostPlatform(verdict.host);
      if (platform === null) return null;

      if (platform === "amazon") {
        const { tag, needsReview } = verifyAmazonTag(verdict.url, trackingId);
        return {
          url: rawUrl, // preserved exactly — the link is never mutated (R5.6)
          platform,
          merchant: AMAZON_MERCHANT,
          externalProductId: extractAsin(verdict.url),
          affiliateTag: tag,
          needsReview,
        };
      }

      // Mercado Libre: keep the affiliate link and its attribution params intact
      // (R5.9); the stored `url` is the input verbatim.
      return {
        url: rawUrl,
        platform,
        merchant: MERCADO_LIBRE_MERCHANT,
        externalProductId: extractMlm(verdict.url),
        affiliateTag: null,
        needsReview: false,
      };
    },
  };
}
