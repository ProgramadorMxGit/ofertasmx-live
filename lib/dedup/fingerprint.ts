/**
 * Product fingerprint derivation (R7.2).
 *
 * The fingerprint is a stable, content-addressed identity for a product. It is
 * the SHA-256 hex digest of four canonical, colon-joined components:
 *
 *     sha256( normalize(platform) ":" normalize(externalProductId ?? "") ":"
 *             normalizeTitle(title) ":" normalizeDestination(destinationUrl) )
 *
 * Because the title and destination are reduced to their canonical forms by the
 * shared normalizers (`normalizeTitle`, `normalizeDestination` in
 * `lib/parser/normalize`), two messages that describe the same product but
 * differ only in surface formatting — letter case, extra spaces, invisible
 * characters, UTM/affiliate tracking parameters — yield the **same**
 * fingerprint (Property 10). Any change to the real identity (platform, external
 * id, normalized title or normalized destination) changes the digest.
 *
 * Pure logic, no I/O. The hashing uses Node's built-in `crypto`, so the module
 * runs in the Node.js server runtime that the webhook (Task 14) executes in.
 */

import { createHash } from "node:crypto";

import {
  normalizeDestination,
  normalizeText,
  normalizeTitle,
} from "@/lib/parser/normalize";
import type { Platform } from "@/lib/parser/parse";

/** The identity components a fingerprint is derived from. */
export interface FingerprintInput {
  /** Affiliate platform (or `null` when unknown). */
  platform: Platform | null;
  /** ASIN / MLM identifier when available; `null`/`undefined` are treated as "". */
  externalProductId?: string | null;
  /** Product title (free-form message text). */
  title: string;
  /** Affiliate/product URL; reduced to its canonical destination. */
  destinationUrl?: string | null;
}

/**
 * Canonicalizes a short identity token (platform / external id): reuses the
 * shared {@link normalizeText} to strip invisible characters and exotic
 * whitespace, then lowercases and collapses any remaining whitespace to a
 * single space. Idempotent. This is deliberately *not* a reimplementation of
 * the parser normalizers — it layers a lowercase/collapse on top of the shared
 * one so the platform and id tokens fold the same way the title and destination
 * already do.
 */
function normalizeToken(value: string): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Computes the deterministic SHA-256 fingerprint (hex) for a product identity
 * (R7.2). See the module docstring for the exact component layout.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const platform = normalizeToken(input.platform ?? "");
  const externalId = normalizeToken(input.externalProductId ?? "");
  const title = normalizeTitle(input.title);
  const destination = normalizeDestination(input.destinationUrl ?? "");

  const canonical = `${platform}:${externalId}:${title}:${destination}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
