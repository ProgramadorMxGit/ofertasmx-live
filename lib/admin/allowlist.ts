/**
 * Admin allowlist resolution (R10.6, Property 22).
 *
 * Pure, side-effect-free logic — no `server-only`, no env access, no I/O — so it
 * is safe to import from the Edge `middleware.ts`, Node server route handlers
 * and tests alike, and the membership rule (Property 22) is unit/property
 * testable in isolation.
 *
 * `ADMIN_EMAIL` (a server env var) holds one or more administrator emails
 * separated by commas (R10.6). {@link parseAdminEmails} turns that raw string
 * into a normalized list (trimmed, lower-cased, blanks dropped, de-duplicated),
 * and {@link isAdminEmail} decides membership case-insensitively. An empty,
 * whitespace-only or missing email is never an administrator.
 *
 * The caller supplies the raw `ADMIN_EMAIL` value — `process.env.ADMIN_EMAIL`
 * in the Edge middleware, or `serverEnv.ADMIN_EMAIL` in Node server code — so
 * this module stays free of any environment coupling.
 */

/** Normalize a single email candidate: trim surrounding space + lower-case. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parse a raw `ADMIN_EMAIL` value into a normalized, de-duplicated list of admin
 * emails: split on commas, trim each segment, lower-case it, and drop empty
 * segments (R10.6). A missing, empty or whitespace-only input yields an empty
 * list. De-duplication is case-insensitive (segments are normalized first).
 */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  if (typeof raw !== "string") return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const normalized = normalizeEmail(part);
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * Whether `email` is an administrator under the `raw` `ADMIN_EMAIL` allowlist.
 *
 * Returns `true` if and only if the case-insensitively normalized `email` is a
 * member of {@link parseAdminEmails}`(raw)`. An empty, whitespace-only or
 * missing email is never an administrator, regardless of the allowlist (R10.6).
 */
export function isAdminEmail(
  email: string | null | undefined,
  raw: string | null | undefined,
): boolean {
  if (typeof email !== "string") return false;
  const normalized = normalizeEmail(email);
  if (normalized === "") return false;
  return parseAdminEmails(raw).includes(normalized);
}
