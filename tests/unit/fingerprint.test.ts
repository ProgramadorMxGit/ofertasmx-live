import { describe, expect, it } from "vitest";

import { computeFingerprint } from "@/lib/dedup/fingerprint";

/**
 * Example unit tests for the product fingerprint (R7.2).
 *
 * The fingerprint is `sha256(normalize(platform) ":" normalize(externalId ?? "")
 * ":" normalizeTitle(title) ":" normalizeDestination(destinationUrl))`. These
 * examples pin the digest shape, determinism and invariance to surface noise;
 * the universal guarantees live in `fingerprint.property.test.ts` (Property 10).
 */

const BASE = {
  platform: "amazon" as const,
  externalProductId: "B08ABCDEFG",
  title: "Audífonos Bluetooth Inalámbricos",
  destinationUrl: "https://www.amazon.com.mx/dp/B08ABCDEFG?tag=programadormx-20",
};

describe("computeFingerprint", () => {
  it("returns a 64-character lowercase hex sha256 digest", () => {
    expect(computeFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical input", () => {
    expect(computeFingerprint(BASE)).toBe(computeFingerprint({ ...BASE }));
  });

  it("ignores surface formatting in the title (case and spacing)", () => {
    const noisy = { ...BASE, title: "  AUDÍFONOS   Bluetooth   Inalámbricos  " };
    expect(computeFingerprint(noisy)).toBe(computeFingerprint(BASE));
  });

  it("ignores UTM/tag noise in the destination URL", () => {
    const noisy = {
      ...BASE,
      destinationUrl:
        "https://amazon.com.mx/dp/B08ABCDEFG?tag=someone-else-21&utm_source=telegram&ref=abc123",
    };
    expect(computeFingerprint(noisy)).toBe(computeFingerprint(BASE));
  });

  it("treats a null external id the same as an empty string", () => {
    const withNull = computeFingerprint({
      platform: "mercado_libre",
      externalProductId: null,
      title: "Olla Express",
      destinationUrl: "https://www.mercadolibre.com.mx/p/olla",
    });
    const withEmpty = computeFingerprint({
      platform: "mercado_libre",
      externalProductId: "",
      title: "Olla Express",
      destinationUrl: "https://www.mercadolibre.com.mx/p/olla",
    });
    expect(withNull).toBe(withEmpty);
  });

  it("differs when the external product id differs", () => {
    expect(computeFingerprint({ ...BASE, externalProductId: "B08ZZZZZZZ" })).not.toBe(
      computeFingerprint(BASE),
    );
  });

  it("differs when the platform differs", () => {
    expect(computeFingerprint({ ...BASE, platform: "mercado_libre" })).not.toBe(
      computeFingerprint(BASE),
    );
  });
});
