/**
 * Domain allowlist + SSRF URL validation (R5.1, R5.2, R5.3).
 *
 * {@link validateUrl} is a PURE function: it decides whether a candidate URL
 * may be contacted **without making any network request** (R5.2). It accepts a
 * URL only when it uses HTTPS and its host (or a parent domain) is on the
 * configured allowlist; it rejects everything else, and in particular blocks
 * `localhost`, IP-literal hosts in private/reserved/loopback/link-local ranges,
 * cloud-metadata endpoints and URLs carrying embedded credentials (R5.3).
 *
 * DNS-based checks (resolving a hostname and rejecting private results to
 * mitigate rebinding) require I/O and therefore live in `resolve.ts`. This
 * module is the no-I/O gate that runs first — on the initial URL and again on
 * every redirect hop.
 */

import { classifyIp, type IpCategory } from "@/lib/ssrf/ip";

/** Initial, configurable allowlist of allowed merchant domains (R5.1). */
export const DEFAULT_ALLOWLIST: readonly string[] = [
  "amazon.com.mx",
  "www.amazon.com.mx",
  "amzn.to",
  "mercadolibre.com.mx",
  "www.mercadolibre.com.mx",
  "meli.la",
];

/** Hostnames that expose cloud instance metadata and must never be reached. */
export const CLOUD_METADATA_HOSTS: readonly string[] = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
];

/** Configuration for the SSRF validator/resolver. */
export interface SsrfConfig {
  /**
   * Allowed registrable domains. A host matches by exact equality or as a
   * subdomain on a label boundary (so `articulo.mercadolibre.com.mx` matches
   * `mercadolibre.com.mx`, while `notamazon.com.mx` does not match
   * `amazon.com.mx`). Defaults to {@link DEFAULT_ALLOWLIST}.
   */
  allowlist?: readonly string[];
}

/** Why {@link validateUrl} rejected a URL. Carries no user data or secrets. */
export type UrlRejectionReason =
  | "invalid_url"
  | "not_https"
  | "embedded_credentials"
  | "localhost"
  | "cloud_metadata"
  | "loopback_ip"
  | "private_ip"
  | "link_local_ip"
  | "reserved_ip"
  | "multicast_ip"
  | "unspecified_ip"
  | "not_allowlisted";

/** Discriminated result of {@link validateUrl}. */
export type ValidateResult =
  | { ok: true; url: URL; host: string }
  | { ok: false; reason: UrlRejectionReason };

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** Lowercase, unbracket and drop a trailing FQDN dot. */
function normalizeHost(hostname: string): string {
  return stripBrackets(hostname).toLowerCase().replace(/\.$/, "");
}

/** Maps a non-public IP category to its rejection reason. */
const IP_CATEGORY_REASON: Record<Exclude<IpCategory, "public">, UrlRejectionReason> = {
  loopback: "loopback_ip",
  private: "private_ip",
  link_local: "link_local_ip",
  reserved: "reserved_ip",
  multicast: "multicast_ip",
  unspecified: "unspecified_ip",
};

/**
 * `true` when `host` equals an allowlist entry or is a subdomain of one on a
 * label boundary. Label-boundary matching prevents suffix-spoofing such as
 * `amazon.com.mx.evil.test` or `notamazon.com.mx`.
 */
export function isAllowlistedHost(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => {
    const e = entry.toLowerCase();
    return host === e || host.endsWith(`.${e}`);
  });
}

/**
 * Validates a candidate URL against the allowlist and SSRF rules **without any
 * network I/O** (R5.2, R5.3). On success returns the parsed `URL` and its
 * normalized host so callers can avoid re-parsing.
 */
export function validateUrl(rawUrl: string, config: SsrfConfig = {}): ValidateResult {
  const allowlist = config.allowlist ?? DEFAULT_ALLOWLIST;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  // Scheme: HTTPS only (R5.3).
  if (url.protocol !== "https:") {
    return { ok: false, reason: "not_https" };
  }

  // Embedded credentials `user:pass@host` (R5.3).
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "embedded_credentials" };
  }

  const host = normalizeHost(url.hostname);

  // Cloud instance metadata endpoints (R5.3).
  if (CLOUD_METADATA_HOSTS.includes(host)) {
    return { ok: false, reason: "cloud_metadata" };
  }

  // localhost and any *.localhost (R5.3).
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost" };
  }

  // IP-literal hosts in a non-public range (R5.3).
  const ipCategory = classifyIp(host);
  if (ipCategory !== null && ipCategory !== "public") {
    return { ok: false, reason: IP_CATEGORY_REASON[ipCategory] };
  }

  // Allowlist gate: host or a parent domain must be allowed (R5.1, R5.2). A
  // public IP literal also lands here and is rejected, since no IP is allowed.
  if (!isAllowlistedHost(host, allowlist)) {
    return { ok: false, reason: "not_allowlisted" };
  }

  return { ok: true, url, host };
}
