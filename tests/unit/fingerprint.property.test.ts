import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { computeFingerprint } from "@/lib/dedup/fingerprint";

/**
 * Property-based test for the product fingerprint.
 *
 * Feature: ofertas-reales-ia, Property 10: Determinismo del fingerprint
 * Validates: Requirements 7.2
 *
 * Para cualquier par de mensajes que representen la misma identidad de producto
 * (misma plataforma, identificador externo, título normalizado y destino
 * normalizado) aunque difieran en formato superficial, el `fingerprint`
 * calculado es idéntico; si la identidad difiere, el `fingerprint` difiere.
 */

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const asinArb = fc.array(fc.constantFrom(...ALNUM), { minLength: 10, maxLength: 10 }).map((c) =>
  c.join(""),
);
const wordArb = fc.constantFrom(
  "audifonos",
  "bluetooth",
  "taladro",
  "licuadora",
  "tenis",
  "cafe",
  "monitor",
  "silla",
  "reloj",
  "mochila",
  "oferta",
  "pro",
  "max",
);
const titleArb = fc.array(wordArb, { minLength: 1, maxLength: 5 }).map((w) => w.join(" "));
const platformArb = fc.constantFrom("amazon" as const, "mercado_libre" as const);

const spacerArb = fc.constantFrom("", " ", "  ", "\u00a0", "\t", " \u200b ");
const trackArb = fc.subarray(
  ["utm_source=tg", "utm_medium=bot", "ref=abc", "tag=someone-else-21", "gclid=xyz", "fbclid=qq"],
  { minLength: 0, maxLength: 6 },
);

function hostFor(platform: "amazon" | "mercado_libre"): string {
  return platform === "amazon" ? "www.amazon.com.mx" : "www.mercadolibre.com.mx";
}

describe("Property 10: Determinismo del fingerprint", () => {
  // Feature: ofertas-reales-ia, Property 10: Determinismo del fingerprint
  // Validates: Requirements 7.2
  it("is deterministic: identical identity inputs give an identical digest", () => {
    fc.assert(
      fc.property(platformArb, asinArb, titleArb, (platform, asin, title) => {
        const input = {
          platform,
          externalProductId: asin,
          title,
          destinationUrl: `https://${hostFor(platform)}/dp/${asin}`,
        };
        expect(computeFingerprint(input)).toBe(computeFingerprint({ ...input }));
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 10: Determinismo del fingerprint
  // Validates: Requirements 7.2
  it("ignores surface noise that shares the same canonical identity", () => {
    fc.assert(
      fc.property(
        platformArb,
        asinArb,
        titleArb,
        spacerArb,
        spacerArb,
        trackArb,
        (platform, asin, title, lead, trail, track) => {
          const baseDest = `https://${hostFor(platform)}/dp/${asin}`;
          const noisyDest = track.length > 0 ? `${baseDest}?${track.join("&")}` : baseDest;
          const noisyTitle = `${lead}${title.toUpperCase().replace(/ /g, "  ")}${trail}`;

          const base = computeFingerprint({
            platform,
            externalProductId: asin,
            title,
            destinationUrl: baseDest,
          });
          const noisy = computeFingerprint({
            platform,
            externalProductId: asin,
            title: noisyTitle,
            destinationUrl: noisyDest,
          });
          expect(noisy).toBe(base);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 10: Determinismo del fingerprint
  // Validates: Requirements 7.2
  it("differs when the external product id differs", () => {
    fc.assert(
      fc.property(platformArb, titleArb, asinArb, asinArb, (platform, title, a1, a2) => {
        fc.pre(a1 !== a2);
        const make = (asin: string) =>
          computeFingerprint({
            platform,
            externalProductId: asin,
            title,
            destinationUrl: `https://${hostFor(platform)}/dp/${asin}`,
          });
        expect(make(a1)).not.toBe(make(a2));
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 10: Determinismo del fingerprint
  // Validates: Requirements 7.2
  it("differs when the platform differs", () => {
    fc.assert(
      fc.property(asinArb, titleArb, (asin, title) => {
        const make = (platform: "amazon" | "mercado_libre") =>
          computeFingerprint({
            platform,
            externalProductId: asin,
            title,
            destinationUrl: `https://${hostFor(platform)}/dp/${asin}`,
          });
        expect(make("amazon")).not.toBe(make("mercado_libre"));
      }),
      { numRuns: 100 },
    );
  });
});
