import { describe, expect, it } from "vitest";

import { generateSlug, slugify, stableIdentity } from "@/lib/dedup/slug";

/**
 * Example unit tests for slug generation (R6.4, R7.6).
 *
 * `slug = slugify(normalizeTitle(title)) + "-" + shortHash(identity)` where
 * `identity` is `platform:externalProductId` or, in its absence, the
 * fingerprint. These examples pin the URL-safe format, accent folding, the
 * identity-anchored suffix and distinctness; universal guarantees live in
 * `slug.property.test.ts` (Property 16).
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDENTITY = {
  platform: "amazon" as const,
  externalProductId: "B08ABCDEFG",
  fingerprint: "deadbeefcafef00d",
};

function suffixOf(slug: string): string {
  return slug.slice(slug.lastIndexOf("-") + 1);
}

describe("slugify", () => {
  it("folds accents, lowercases and hyphenates", () => {
    expect(slugify("Café Münchën Ñoño")).toBe("cafe-munchen-nono");
  });

  it("collapses punctuation runs and trims edge hyphens", () => {
    expect(slugify("¡Oferta!! Taladro — 20V")).toBe("oferta-taladro-20v");
  });

  it("returns an empty string for input with no ascii content", () => {
    expect(slugify("日本語のみ")).toBe("");
  });
});

describe("stableIdentity", () => {
  it("uses platform:externalProductId when an external id is present", () => {
    expect(stableIdentity(IDENTITY)).toBe("amazon:B08ABCDEFG");
  });

  it("falls back to the fingerprint when there is no external id", () => {
    expect(
      stableIdentity({ platform: "mercado_libre", externalProductId: null, fingerprint: "fp-xyz" }),
    ).toBe("fp-xyz");
  });
});

describe("generateSlug", () => {
  it("produces a URL-safe slug (lowercase ascii, hyphenated)", () => {
    expect(generateSlug("Audífonos Bluetooth Inalámbricos", IDENTITY)).toMatch(SLUG_RE);
  });

  it("is deterministic for the same title and identity", () => {
    expect(generateSlug("Taladro 20V", IDENTITY)).toBe(generateSlug("Taladro 20V", IDENTITY));
  });

  it("keeps the same identity-anchored suffix when the title is edited (R7.6)", () => {
    const original = generateSlug("Taladro 20V", IDENTITY);
    const edited = generateSlug("Taladro 20V PRO Edición Limitada", IDENTITY);
    expect(suffixOf(original)).toBe(suffixOf(edited));
  });

  it("produces different slugs for different identities", () => {
    const other = { ...IDENTITY, externalProductId: "B08ZZZZZZZ" };
    expect(generateSlug("Taladro 20V", IDENTITY)).not.toBe(generateSlug("Taladro 20V", other));
  });

  it("uses the fingerprint as the anchor when there is no external id", () => {
    const noExternal = {
      platform: "mercado_libre" as const,
      externalProductId: null,
      fingerprint: "0123456789abcdef",
    };
    expect(generateSlug("Olla Express 6L", noExternal)).toMatch(SLUG_RE);
  });

  it("falls back to a stable, valid slug when the title has no ascii content", () => {
    const slug = generateSlug("日本語のみ", IDENTITY);
    expect(slug).toMatch(SLUG_RE);
    expect(slug).toBe(suffixOf(slug));
  });
});
