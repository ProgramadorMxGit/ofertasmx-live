/**
 * Pure helpers for the click redirector `/api/click/[offerId]` (R11).
 *
 * No I/O and no `server-only` dependency, so the closed-redirect guarantee
 * (Property 17) and the privacy-preserving analytics extraction are
 * unit/property testable in isolation. The route handler in
 * `app/api/click/[offerId]/route.ts` performs the DB lookup + analytics insert
 * and delegates the redirect decision to {@link resolveClickRedirect}.
 */

/** Minimal offer shape the redirector needs: only the stored affiliate URL. */
export interface ClickRedirectOffer {
  readonly affiliate_url: string | null;
}

/** Client-supplied params a naive redirector might (wrongly) honor as a target. */
export interface ClickParams {
  readonly url?: string | null;
  readonly dest?: string | null;
  readonly [key: string]: string | null | undefined;
}

/** Result of the redirect decision: either a closed 302 target, or none. */
export type ClickRedirectDecision =
  | { readonly redirect: false }
  | { readonly redirect: true; readonly target: string };

/**
 * Decide the redirect target for a click (R11.4, R11.5, R11.6).
 *
 * CLOSED REDIRECT: the destination is ALWAYS the offer's stored `affiliate_url`.
 * Any client-supplied destination (`?url=`, `?dest=`, ...) is accepted as input
 * but DELIBERATELY IGNORED — there is no code path where a client value becomes
 * the target, so this can never be an open redirect.
 *
 *  - Missing offer (`null`) → no redirect (the route answers 404). (R11.6)
 *  - Offer without a usable stored URL → no redirect (cannot honor it). (R11.6)
 *  - Otherwise → redirect to the stored `affiliate_url`, intact. (R11.4, R11.5)
 */
export function resolveClickRedirect(
  offer: ClickRedirectOffer | null,
  clientParams: ClickParams = {},
): ClickRedirectDecision {
  // Accepted for an explicit, self-documenting signature, then ignored: the
  // client never influences the destination (R11.5).
  void clientParams;

  if (offer === null) {
    return { redirect: false };
  }
  const stored = offer.affiliate_url;
  if (typeof stored !== "string" || stored.trim().length === 0) {
    return { redirect: false };
  }
  // Return the stored value unchanged — preserve the affiliate link intact.
  return { redirect: true, target: stored };
}

/** Extract the client-supplied destination params (only to prove they are ignored). */
export function parseClickParams(params: URLSearchParams): ClickParams {
  return { url: params.get("url"), dest: params.get("dest") };
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Whether `host` is a bare IP literal (v4 or v6), which must never be stored. */
export function isIpHost(host: string): boolean {
  if (host.length === 0) return false;
  // IPv6 literals contain a colon (optionally bracketed); IPv4 is dotted-decimal.
  if (host.includes(":")) return true;
  if (host.startsWith("[") && host.endsWith("]")) return true;
  return IPV4_RE.test(host);
}

/**
 * Extract ONLY the host of the `Referer` header (R11.4, R6.11).
 *
 * Returns `null` for an absent/invalid Referer and — critically — also `null`
 * when the host is a raw IP, so a full IP address is never persisted. The
 * remaining value is a lowercased domain, never a path, query or full URL.
 */
export function referrerDomainFromReferer(
  referer: string | null | undefined,
): string | null {
  if (typeof referer !== "string" || referer.trim().length === 0) return null;
  let host: string;
  try {
    host = new URL(referer).hostname;
  } catch {
    return null;
  }
  if (host.length === 0) return null;
  if (isIpHost(host)) return null; // never store a full IP (R6.11)
  return host.toLowerCase();
}

const SOURCE_RE = /^[a-z0-9_-]{1,32}$/i;

/**
 * Sanitize the `?src=` analytics tag: a short, opaque label (e.g. `card`,
 * `detail`, `featured`). Anything outside a small safe charset / length is
 * dropped to `null`, so the analytics column can never carry junk or PII.
 */
export function sanitizeClickSource(src: string | null | undefined): string | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!SOURCE_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
