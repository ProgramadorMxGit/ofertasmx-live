/**
 * URL slug generation (R6.4, R7.6).
 *
 *     slug = slugify(normalizeTitle(title)) + "-" + shortHash(identity)
 *
 * where `identity` is the offer's stable identity — `platform:externalProductId`
 * when an external id is present, or the `fingerprint` otherwise — and
 * `shortHash` is the leading base36 characters of its SHA-256 digest.
 *
 * Properties (Property 16):
 *  - **URL-safe**: the result is lowercase ASCII, digits and single hyphens
 *    with no leading/trailing/double hyphens; accents are folded.
 *  - **Identity-anchored**: the trailing `shortHash` depends only on the stable
 *    identity, never on the (mutable) title. So the slug's unique anchor is
 *    invariant across title re-edits of the same product, which is what lets the
 *    deduplication engine keep a published slug stable on `edited_message`
 *    (R7.6 — the update path preserves the stored `slug` rather than
 *    regenerating it; see `resolveDuplicate`'s `preserve` list).
 *  - **Distinct**: different identities produce different suffixes, hence
 *    different slugs, so slugs are effectively unique (R6.4).
 *
 * Pure logic, no I/O; hashing uses Node's built-in `crypto`.
 */

import { createHash } from "node:crypto";

import { normalizeTitle } from "@/lib/parser/normalize";
import type { Platform } from "@/lib/parser/parse";

/** The offer's stable identity inputs used for the slug's hash anchor. */
export interface SlugIdentity {
  platform: Platform | null;
  externalProductId?: string | null;
  /** Fallback identity when no external id exists (the product fingerprint). */
  fingerprint: string;
}

/** Number of base36 characters kept from the identity hash. */
const SLUG_HASH_LENGTH = 10;

/**
 * Reduces arbitrary text to a URL-safe slug fragment: normalizes the title
 * (lowercase, whitespace-collapsed), folds diacritics (NFD then strips combining
 * marks), maps every run of non-`[a-z0-9]` characters to a single hyphen and
 * trims edge hyphens. Returns `""` when the input has no ASCII alphanumeric
 * content (e.g. a CJK-only title); callers fall back to the hash anchor.
 */
export function slugify(text: string): string {
  const folded = normalizeTitle(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return folded
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolves the stable identity string used for the slug's hash anchor:
 * `platform:externalProductId` when an external id is present, otherwise the
 * product fingerprint (R7.6). Title-independent by construction.
 */
export function stableIdentity(identity: SlugIdentity): string {
  if (
    identity.platform !== null &&
    identity.externalProductId != null &&
    identity.externalProductId !== ""
  ) {
    return `${identity.platform}:${identity.externalProductId}`;
  }
  return identity.fingerprint;
}

/**
 * Returns the leading {@link SLUG_HASH_LENGTH} base36 characters of the SHA-256
 * digest of `value`. The output is lowercase `[0-9a-z]`, hence URL-safe, and
 * deterministic for a given input.
 */
export function shortHash(value: string, length: number = SLUG_HASH_LENGTH): string {
  const hex = createHash("sha256").update(value, "utf8").digest("hex");
  // Interpret the leading 128 bits as a big integer and render it in base36 for
  // a compact, URL-safe, collision-resistant suffix.
  const base36 = BigInt(`0x${hex.slice(0, 32)}`).toString(36);
  return base36.slice(0, length);
}

/**
 * Generates the offer slug (R6.4, R7.6). When the title yields no ASCII content
 * the slug is the identity hash alone, which is still URL-safe and stable.
 */
export function generateSlug(title: string, identity: SlugIdentity): string {
  const base = slugify(title);
  const suffix = shortHash(stableIdentity(identity));
  return base === "" ? suffix : `${base}-${suffix}`;
}
