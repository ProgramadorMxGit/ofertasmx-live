/**
 * Public surface of the SSRF / link module (R5).
 *
 * - `ip`       — IP-range classification used by the validator and resolver.
 * - `validate` — pure, no-I/O allowlist + SSRF URL validation (R5.1–R5.3).
 * - `resolve`  — safe short-link resolution with injected fetch/DNS (R5.4).
 * - `identify` — ASIN/MLM extraction, tag verification and `createLinkPort`
 *                (R5.5–R5.9), the SSRF-backed `LinkPort` the parser injects.
 */
export * from "@/lib/ssrf/ip";
export * from "@/lib/ssrf/validate";
export * from "@/lib/ssrf/resolve";
export * from "@/lib/ssrf/identify";
