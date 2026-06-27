import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { isAdminEmail, parseAdminEmails } from "@/lib/admin/allowlist";

/**
 * Property-based test for admin allowlist resolution.
 *
 * Feature: ofertas-reales-ia, Property 22: Resolución de administrador por allowlist
 * Validates: Requirements 10.6
 *
 * Para cualquier correo y para cualquier configuración de `ADMIN_EMAIL` (uno o
 * varios correos separados por coma), el Sistema reconoce al usuario como
 * Administrador si y solo si su correo coincide (sin distinción de mayúsculas)
 * con alguno de la lista.
 */
describe("Property 22: Resolución de administrador por allowlist", () => {
  /** Surrounding whitespace variations to exercise trimming. */
  const spacing = fc.constantFrom("", " ", "  ", "\t");

  /**
   * An allowlist entry: a comma-free email-like token, optionally upper-cased
   * and padded with whitespace, so parsing must normalize (trim + lower-case).
   */
  const entryArb = fc
    .record({
      email: fc.emailAddress(),
      upper: fc.boolean(),
      lead: spacing,
      trail: spacing,
    })
    .map(({ email, upper, lead, trail }) =>
      `${lead}${upper ? email.toUpperCase() : email}${trail}`,
    );

  /**
   * Independent reference for the normalized allowlist set, written separately
   * from the implementation: split on commas, trim, lower-case, drop blanks.
   */
  function referenceSet(raw: string): Set<string> {
    return new Set(
      raw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0),
    );
  }

  it("recognizes an admin iff the normalized email is in the parsed set", () => {
    // Feature: ofertas-reales-ia, Property 22: Resolución de administrador por allowlist
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 6 }),
        // A candidate email that may or may not be in the list, with its own
        // case/whitespace noise.
        fc.record({ email: fc.emailAddress(), upper: fc.boolean(), pad: spacing }),
        (entries, candidate) => {
          const raw = entries.join(",");
          const reference = referenceSet(raw);

          const candidateText = `${candidate.pad}${
            candidate.upper ? candidate.email.toUpperCase() : candidate.email
          }${candidate.pad}`;
          const candidateNormalized = candidate.email.trim().toLowerCase();

          const expected = reference.has(candidateNormalized);
          expect(isAdminEmail(candidateText, raw)).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("matches every allowlisted entry under any case/whitespace variation", () => {
    // Feature: ofertas-reales-ia, Property 22: Resolución de administrador por allowlist
    fc.assert(
      fc.property(
        fc.array(entryArb, { minLength: 1, maxLength: 6 }),
        fc.nat(),
        fc.boolean(),
        (entries, index, upper) => {
          const raw = entries.join(",");
          const parsed = parseAdminEmails(raw);
          fc.pre(parsed.length > 0);

          // Pick one parsed (already normalized) admin email and re-present it
          // with arbitrary case — it must still resolve as an administrator.
          const picked = parsed[index % parsed.length];
          const presented = upper ? picked.toUpperCase() : picked;
          expect(isAdminEmail(presented, raw)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never recognizes an empty or whitespace-only email", () => {
    // Feature: ofertas-reales-ia, Property 22: Resolución de administrador por allowlist
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: 6 }),
        fc.constantFrom("", " ", "   ", "\t", "\n"),
        (entries, blank) => {
          expect(isAdminEmail(blank, entries.join(","))).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
