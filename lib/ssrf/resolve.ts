/**
 * Safe short-link resolver for `amzn.to` / `meli.la` (R5.4).
 *
 * {@link resolveShortLink} follows redirects to recover the canonical product
 * URL so the identifier extractor can read the ASIN/MLM. It is hardened against
 * SSRF:
 *
 *  - the `fetch` and DNS `lookup` dependencies are **injected**, so the resolver
 *    is fully testable without touching the network;
 *  - a maximum redirect count, a per-request timeout and a maximum response
 *    size are enforced;
 *  - on **every** hop the URL is re-validated with {@link validateUrl} (scheme +
 *    host allowlist) AND its host is DNS-resolved with every returned address
 *    checked against the private/reserved ranges (DNS-rebinding mitigation);
 *  - the final URL must still pass the allowlist.
 *
 * The response body is never downloaded — only the status line, the `location`
 * header and the `content-length` header are read — which is itself a strong
 * response-size guard. The production adapter (wired by the webhook, Task 14)
 * should therefore use the real `fetch` with `redirect: "manual"` and must not
 * buffer the body.
 */

import { classifyIp } from "@/lib/ssrf/ip";
import {
  validateUrl,
  type SsrfConfig,
  type UrlRejectionReason,
} from "@/lib/ssrf/validate";

/** A single address from a DNS lookup. Mirrors Node's `dns.promises.lookup`. */
export interface DnsAddress {
  address: string;
  family: number;
}

/** Injected DNS resolver. May return one address or many (`{ all: true }`). */
export type DnsLookupFn = (hostname: string) => Promise<DnsAddress[] | DnsAddress>;

/** Minimal subset of the `Headers` interface the resolver depends on. */
export interface MinimalHeaders {
  get(name: string): string | null;
}

/** Minimal subset of the `Response` interface the resolver depends on. */
export interface MinimalResponse {
  status: number;
  headers: MinimalHeaders;
}

/** Injected fetch. Must perform NO automatic redirect following. */
export type FetchLikeFn = (
  url: string,
  init: { method: string; redirect: "manual"; signal: AbortSignal },
) => Promise<MinimalResponse>;

/** Options for {@link resolveShortLink}. `fetch` and `lookup` are required. */
export interface ResolveOptions {
  fetch: FetchLikeFn;
  lookup: DnsLookupFn;
  config?: SsrfConfig;
  /** Maximum redirects to follow. Defaults to 3. */
  maxRedirects?: number;
  /** Per-request timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
  /** Maximum advertised response size in bytes. Defaults to 1_000_000. */
  maxResponseBytes?: number;
}

/** Why {@link resolveShortLink} rejected — a superset of {@link UrlRejectionReason}. */
export type ResolveRejectionReason =
  | UrlRejectionReason
  | "dns_private_ip"
  | "dns_error"
  | "too_many_redirects"
  | "missing_location"
  | "response_too_large"
  | "http_error"
  | "network_error"
  | "timeout";

/** Discriminated result of {@link resolveShortLink}. */
export type ResolveResult =
  | { ok: true; finalUrl: string; hops: string[] }
  | { ok: false; reason: ResolveRejectionReason };

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

/**
 * Resolves the host's DNS and confirms every returned address is public.
 * Returns `"ok"`, `"dns_private_ip"` (any address private/reserved, or an
 * unparseable address — fail closed) or `"dns_error"` (lookup failed/empty).
 */
async function resolveAndCheckDns(
  host: string,
  lookup: DnsLookupFn,
): Promise<"ok" | "dns_private_ip" | "dns_error"> {
  // An IP-literal host has already been screened by validateUrl; re-affirm it.
  const literal = classifyIp(host);
  if (literal !== null) {
    return literal === "public" ? "ok" : "dns_private_ip";
  }

  let result: DnsAddress[] | DnsAddress;
  try {
    result = await lookup(host);
  } catch {
    return "dns_error";
  }

  const addresses = Array.isArray(result) ? result : [result];
  if (addresses.length === 0) {
    return "dns_error";
  }
  for (const { address } of addresses) {
    if (classifyIp(address) !== "public") {
      return "dns_private_ip"; // includes unparseable addresses (fail closed)
    }
  }
  return "ok";
}

/**
 * Follows a short link safely to its final, still-allowed URL.
 *
 * @param rawUrl  The short link (e.g. `https://amzn.to/abc`).
 * @param options Injected `fetch`/`lookup` plus limits.
 */
export async function resolveShortLink(
  rawUrl: string,
  options: ResolveOptions,
): Promise<ResolveResult> {
  const {
    fetch,
    lookup,
    config,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = options;

  const hops: string[] = [];
  let current = rawUrl;
  let redirects = 0;

  // At most `maxRedirects + 1` requests: the original plus each followed hop.
  for (let i = 0; i <= maxRedirects; i++) {
    // 1) Pure scheme/credential/IP-literal/allowlist validation on this hop.
    const verdict = validateUrl(current, config);
    if (!verdict.ok) {
      return { ok: false, reason: verdict.reason };
    }

    // 2) Resolve DNS and reject private/reserved results (rebinding, R5.4).
    const dns = await resolveAndCheckDns(verdict.host, lookup);
    if (dns !== "ok") {
      return { ok: false, reason: dns };
    }

    hops.push(current);

    // 3) One hop with a timeout and manual redirect handling.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: MinimalResponse;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return { ok: false, reason: controller.signal.aborted ? "timeout" : "network_error" };
    }
    clearTimeout(timer);

    // 4) Response-size guard via the advertised content length.
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader !== null) {
      const length = Number(lengthHeader);
      if (Number.isFinite(length) && length > maxResponseBytes) {
        return { ok: false, reason: "response_too_large" };
      }
    }

    // 5) Redirect vs. terminal response.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null || location === "") {
        return { ok: false, reason: "missing_location" };
      }
      if (redirects >= maxRedirects) {
        return { ok: false, reason: "too_many_redirects" };
      }
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
      redirects += 1;
      current = next;
      continue;
    }

    if (response.status >= 200 && response.status < 300) {
      // Terminal: `current` already passed validation + DNS at the loop top, so
      // the final domain is guaranteed to still be allowed (R5.4).
      return { ok: true, finalUrl: current, hops };
    }

    return { ok: false, reason: "http_error" };
  }

  // Loop exhausted while still redirecting.
  return { ok: false, reason: "too_many_redirects" };
}
