import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { validateUrl } from "@/lib/ssrf/validate";
import {
  resolveShortLink,
  type DnsLookupFn,
  type FetchLikeFn,
  type MinimalHeaders,
} from "@/lib/ssrf/resolve";

/**
 * Property-based tests for the domain allowlist and SSRF protection.
 *
 * Feature: ofertas-reales-ia, Property 8: Allowlist de dominios y protección SSRF
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 *
 * Para cualquier URL que no use HTTPS, apunte a `localhost`, a una IP
 * privada/reservada, a un endpoint de metadatos de nube, contenga credenciales
 * embebidas, o cuyo dominio (o dominio final tras redirecciones, respetando el
 * tope de saltos) no esté en la allowlist, el Validador de Dominios la rechaza y
 * no realiza ninguna solicitud hacia ella.
 */

/** Hosts whose host (or parent) is on the allowlist → acceptable when https + no creds. */
const allowlistedHostArb = fc.constantFrom(
  "amazon.com.mx",
  "www.amazon.com.mx",
  "amzn.to",
  "mercadolibre.com.mx",
  "www.mercadolibre.com.mx",
  "meli.la",
);

/** Label-boundary subdomains of an allowed domain → also acceptable. */
const allowlistedSubdomainArb = fc
  .tuple(
    fc.constantFrom("articulo", "www2", "m", "deals", "tienda"),
    fc.constantFrom("amazon.com.mx", "mercadolibre.com.mx"),
  )
  .map(([sub, base]) => `${sub}.${base}`);

/** Public hosts that are NOT on the allowlist, incl. suffix-spoofing near-misses. */
const disallowedHostArb = fc.constantFrom(
  "example.com",
  "evil.test",
  "attacker.example",
  "google.com",
  "mercadolibre.com",
  "notamazon.com.mx",
  "amazon.com.mx.evil.test",
  "amazonacom.mx",
);

/** Private / loopback / link-local IPv4 literals (must be rejected). */
const privateIpv4Arb = fc
  .oneof(
    fc.tuple(
      fc.constant(10),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ),
    fc.tuple(
      fc.constant(192),
      fc.constant(168),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ),
    fc.tuple(
      fc.constant(172),
      fc.integer({ min: 16, max: 31 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ),
    fc.tuple(
      fc.constant(127),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ),
    fc.tuple(
      fc.constant(169),
      fc.constant(254),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    ),
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Other special hosts that must be rejected (localhost, metadata, IPv6, reserved). */
const specialHostArb = fc.constantFrom(
  "localhost",
  "api.localhost",
  "169.254.169.254",
  "metadata.google.internal",
  "[::1]",
  "[fc00::1]",
  "[fe80::1]",
  "0.0.0.0",
  "255.255.255.255",
);

/** A host paired with whether it is an allowlisted public domain. */
const taggedHostArb: fc.Arbitrary<{ host: string; allowlisted: boolean }> = fc.oneof(
  allowlistedHostArb.map((host) => ({ host, allowlisted: true })),
  allowlistedSubdomainArb.map((host) => ({ host, allowlisted: true })),
  disallowedHostArb.map((host) => ({ host, allowlisted: false })),
  privateIpv4Arb.map((host) => ({ host, allowlisted: false })),
  specialHostArb.map((host) => ({ host, allowlisted: false })),
);

const schemeArb = fc.constantFrom("https", "http");
const credsArb = fc.constantFrom("", "user:pass@");

function headersOf(map: Record<string, string>): MinimalHeaders {
  const lower = new Map(
    Object.entries(map).map(([k, v]) => [k.toLowerCase(), v] as const),
  );
  return { get: (name) => lower.get(name.toLowerCase()) ?? null };
}

describe("Property 8: Allowlist de dominios y protección SSRF", () => {
  // Feature: ofertas-reales-ia, Property 8: Allowlist de dominios y protección SSRF
  // Validates: Requirements 5.1, 5.2, 5.3
  it("validateUrl accepts iff the URL is HTTPS, credential-free and on the allowlist", () => {
    fc.assert(
      fc.property(taggedHostArb, schemeArb, credsArb, ({ host, allowlisted }, scheme, creds) => {
        const url = `${scheme}://${creds}${host}/dp/B08Z6Z4P7C?tag=programadormx-20`;
        const expected = allowlisted && scheme === "https" && creds === "";
        expect(validateUrl(url).ok).toBe(expected);
      }),
      { numRuns: 600 },
    );
  });

  // Feature: ofertas-reales-ia, Property 8: Allowlist de dominios y protección SSRF
  // Validates: Requirements 5.2, 5.3
  it("a rejected URL always carries a reason and never a parsed url/host", () => {
    fc.assert(
      fc.property(taggedHostArb, schemeArb, credsArb, ({ host }, scheme, creds) => {
        const result = validateUrl(`${scheme}://${creds}${host}/x`);
        if (!result.ok) {
          expect(typeof result.reason).toBe("string");
          expect(result.reason.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 8: Allowlist de dominios y protección SSRF
  // Validates: Requirements 5.4
  it("resolveShortLink rejects DNS rebinding: an allowed host resolving to a private IP is blocked", async () => {
    const fetchMock: FetchLikeFn = async () => ({ status: 200, headers: headersOf({}) });
    await fc.assert(
      fc.asyncProperty(privateIpv4Arb, allowlistedHostArb, async (privateIp, host) => {
        const lookup: DnsLookupFn = async () => [{ address: privateIp, family: 4 }];
        const result = await resolveShortLink(`https://${host}/abc`, {
          fetch: fetchMock,
          lookup,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("dns_private_ip");
      }),
      { numRuns: 150 },
    );
  });

  // Feature: ofertas-reales-ia, Property 8: Allowlist de dominios y protección SSRF
  // Validates: Requirements 5.4
  it("resolveShortLink rejects a redirect whose final domain leaves the allowlist", async () => {
    const lookup: DnsLookupFn = async () => [{ address: "13.32.1.1", family: 4 }];
    await fc.assert(
      fc.asyncProperty(disallowedHostArb, async (badHost) => {
        const target = `https://${badHost}/landing`;
        const fetchMock: FetchLikeFn = async (url) =>
          url.startsWith("https://amzn.to/")
            ? { status: 301, headers: headersOf({ location: target }) }
            : { status: 200, headers: headersOf({}) };
        const result = await resolveShortLink("https://amzn.to/abc", {
          fetch: fetchMock,
          lookup,
        });
        expect(result.ok).toBe(false);
      }),
      { numRuns: 150 },
    );
  });
});
