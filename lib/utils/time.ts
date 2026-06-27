/**
 * Pure time-formatting helpers for offer metadata (R14.1, R22.1).
 *
 * Two presentations of an ISO timestamp:
 *  - {@link formatRelativeTimeEs} — friendly Spanish "hace X" used once the page
 *    is interactive ("Última actualización: hace X minutos", R22.1);
 *  - {@link formatAbsoluteDateEs} — a deterministic, locale-/ICU-independent
 *    absolute date used as the first-paint value so server and client render
 *    identical markup (no hydration mismatch). The `RelativeTime` Client
 *    component swaps to the relative form after mount and refreshes it over
 *    time.
 *
 * Both are pure (no I/O); `now` is injectable so the relative formatter is
 * deterministically testable. Absolute formatting reads UTC parts so it does
 * not depend on the host time zone or ICU locale data.
 */

const MONTHS_ES_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Format an ISO timestamp as a short Spanish relative time, e.g. `justo ahora`,
 * `hace 5 min`, `hace 3 h`, `hace 2 d`. A future timestamp (clock skew) and any
 * value under a minute collapse to `justo ahora`. Returns `""` for an invalid
 * input so callers can fall back gracefully.
 */
export function formatRelativeTimeEs(
  fromISO: string,
  now: Date = new Date(),
): string {
  const then = new Date(fromISO);
  if (Number.isNaN(then.getTime())) return "";

  const diffSeconds = Math.floor((now.getTime() - then.getTime()) / MS_PER_SECOND);
  if (diffSeconds < SECONDS_PER_MINUTE) return "justo ahora";

  const diffMinutes = Math.floor(diffSeconds / SECONDS_PER_MINUTE);
  if (diffMinutes < MINUTES_PER_HOUR) return `hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / MINUTES_PER_HOUR);
  if (diffHours < HOURS_PER_DAY) return `hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);
  if (diffDays < 30) return `hace ${diffDays} d`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `hace ${diffMonths} ${diffMonths === 1 ? "mes" : "meses"}`;

  const diffYears = Math.floor(diffDays / 365);
  return `hace ${diffYears} ${diffYears === 1 ? "año" : "años"}`;
}

/**
 * Format an ISO timestamp as a deterministic absolute date (e.g. `1 may 2024`)
 * using UTC parts and a fixed Spanish month table. Independent of host time
 * zone and ICU data, so server and client produce identical output. Returns
 * `""` for an invalid input.
 */
export function formatAbsoluteDateEs(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  const month = MONTHS_ES_SHORT[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}
