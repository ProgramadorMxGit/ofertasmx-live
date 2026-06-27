import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { generateSlug, type SlugIdentity } from "@/lib/dedup/slug";

/**
 * Property-based test for slug generation.
 *
 * Feature: ofertas-reales-ia, Property 16: Estabilidad y formato del slug
 * Validates: Requirements 6.4, 7.6
 *
 * Para cualquier oferta, el `slug` generado es URL-safe y, para cualquier
 * reprocesamiento de la misma identidad de producto (p. ej. un `edited_message`),
 * el `slug` resultante es idéntico; identidades distintas producen slugs
 * distintos.
 *
 * Note on stability (R7.6): the slug's trailing hash is anchored to the stable
 * identity, never to the mutable title, so re-processing the same identity
 * yields the same anchor. Full-slug preservation across a *title* edit is
 * enforced system-side by the dedup engine (it preserves the stored `slug`; see
 * `resolveDuplicate`'s `preserve` list, Property 11), since the readable prefix
 * necessarily reflects the title. Here we verify determinism for re-sent
 * content and invariance of the identity anchor.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const asinArb = fc.array(fc.constantFrom(...ALNUM), { minLength: 10, maxLength: 10 }).map((c) =>
  c.join(""),
);
const fingerprintArb = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 16, maxLength: 64 })
  .map((c) => c.join(""));
const platformArb = fc.constantFrom("amazon" as const, "mercado_libre" as const);

/** Arbitrary title, including unicode/emoji/punctuation, to stress URL-safety. */
const titleArb = fc.string({ maxLength: 80 });

/** Identity with an external id (anchor = `platform:externalProductId`). */
const externalIdentityArb: fc.Arbitrary<SlugIdentity> = fc.record({
  platform: platformArb,
  externalProductId: asinArb,
  fingerprint: fingerprintArb,
});

/** Identity without an external id (anchor = fingerprint). */
const fingerprintIdentityArb: fc.Arbitrary<SlugIdentity> = fc.record({
  platform: fc.constantFrom("amazon" as const, "mercado_libre" as const, null),
  externalProductId: fc.constant(null),
  fingerprint: fingerprintArb,
});

const anyIdentityArb = fc.oneof(externalIdentityArb, fingerprintIdentityArb);

function suffixOf(slug: string): string {
  return slug.slice(slug.lastIndexOf("-") + 1);
}

describe("Property 16: Estabilidad y formato del slug", () => {
  // Feature: ofertas-reales-ia, Property 16: Estabilidad y formato del slug
  // Validates: Requirements 6.4, 7.6
  it("always produces a URL-safe slug for any title and identity", () => {
    fc.assert(
      fc.property(titleArb, anyIdentityArb, (title, identity) => {
        expect(generateSlug(title, identity)).toMatch(SLUG_RE);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 16: Estabilidad y formato del slug
  // Validates: Requirements 6.4, 7.6
  it("is deterministic: re-processing the same identity and content gives the same slug", () => {
    fc.assert(
      fc.property(titleArb, anyIdentityArb, (title, identity) => {
        expect(generateSlug(title, identity)).toBe(generateSlug(title, { ...identity }));
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 16: Estabilidad y formato del slug
  // Validates: Requirements 7.6
  it("keeps the identity anchor invariant across title re-edits of the same product", () => {
    fc.assert(
      fc.property(titleArb, titleArb, anyIdentityArb, (titleA, titleB, identity) => {
        const suffixA = suffixOf(generateSlug(titleA, identity));
        const suffixB = suffixOf(generateSlug(titleB, identity));
        expect(suffixA).toBe(suffixB);
      }),
      { numRuns: 300 },
    );
  });

  // Feature: ofertas-reales-ia, Property 16: Estabilidad y formato del slug
  // Validates: Requirements 6.4
  it("produces different slugs for different external-id identities", () => {
    fc.assert(
      fc.property(titleArb, platformArb, asinArb, asinArb, fingerprintArb, (title, platform, a1, a2, fp) => {
        fc.pre(a1 !== a2);
        const slugA = generateSlug(title, { platform, externalProductId: a1, fingerprint: fp });
        const slugB = generateSlug(title, { platform, externalProductId: a2, fingerprint: fp });
        expect(slugA).not.toBe(slugB);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ofertas-reales-ia, Property 16: Estabilidad y formato del slug
  // Validates: Requirements 6.4
  it("produces different slugs for different fingerprint-only identities", () => {
    fc.assert(
      fc.property(titleArb, fingerprintArb, fingerprintArb, (title, fp1, fp2) => {
        fc.pre(fp1 !== fp2);
        const slugA = generateSlug(title, { platform: null, externalProductId: null, fingerprint: fp1 });
        const slugB = generateSlug(title, { platform: null, externalProductId: null, fingerprint: fp2 });
        expect(slugA).not.toBe(slugB);
      }),
      { numRuns: 200 },
    );
  });
});
