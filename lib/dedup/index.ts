/**
 * Public surface of the deduplication module (R7).
 *
 * - `fingerprint` — deterministic product fingerprint, `computeFingerprint` (R7.2).
 * - `slug`        — URL-safe, identity-anchored slug generation (R6.4, R7.6).
 * - `dedup`       — pure insert-vs-update resolution by priority, `resolveDuplicate`
 *                   (R7.1, R7.3, R7.4, R7.5).
 */
export * from "@/lib/dedup/fingerprint";
export * from "@/lib/dedup/slug";
export * from "@/lib/dedup/dedup";
