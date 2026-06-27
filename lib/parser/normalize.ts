/**
 * Text normalization for the Message Parser (R4.1, R4.2, R4.3).
 *
 * Telegram messages arrive with inconsistent formatting: non-breaking and thin
 * spaces, zero-width and bidirectional control characters, mixed line breaks
 * (CRLF / CR / unicode separators), fullwidth currency and percent symbols, and
 * stray spacing around percentages. This module turns any such input into a
 * canonical, deterministic form before field extraction happens.
 *
 * The central guarantee is **idempotence**: `normalizeText(normalizeText(x))`
 * equals `normalizeText(x)` for every input (Property 1). This is achieved by
 * reducing the string to a fixed "normal form" where none of the rewrite rules
 * can fire a second time.
 *
 * All functions are pure (no I/O), which makes them verifiable by both unit
 * tests and property-based tests (R29.1).
 */

/**
 * Invisible / format characters with no visible width that must be removed:
 * soft hyphen, Arabic letter mark, Mongolian vowel separator, the
 * zero-width/bidi block `U+200B–U+200F`, bidi embeddings/overrides
 * `U+202A–U+202E`, word joiner and invisible operators `U+2060–U+206F`, and the
 * byte-order mark `U+FEFF`. Line/paragraph separators (`U+2028`/`U+2029`) are
 * intentionally excluded here because they are handled as line breaks.
 */
const INVISIBLE_RE =
  /[\u00ad\u061c\u180e\u200b\u200c\u200d\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u206a\u206b\u206c\u206d\u206e\u206f\ufeff]/g;

/**
 * Whitespace separators (other than the regular space and the line feed) that
 * collapse to a single regular space: tab, vertical tab, form feed, NBSP, thin
 * and narrow spaces, the `U+2000–U+200A` block, and the ideographic space.
 */
const UNICODE_SPACE_RE = /[\t\f\v\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

/** Line-break variants unified to a single `\n`. */
const LINE_BREAK_RE = /\r\n?|\u2028|\u2029|\u0085/g;

/**
 * Reduces arbitrary message text to a canonical, idempotent form.
 *
 * Steps (each leaves the string in a form the next step never undoes, so a
 * second application is a no-op):
 *  1. Unicode canonical composition (NFC).
 *  2. Unify all line breaks to `\n`.
 *  3. Strip zero-width / bidi / invisible characters.
 *  4. Convert exotic whitespace to a regular space.
 *  5. Map fullwidth `＄`/`％` to ASCII `$`/`%`.
 *  6. Collapse runs of spaces and drop the space before a percent sign.
 *  7. Trim trailing/leading spaces per line and cap blank-line runs.
 */
export function normalizeText(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }

  let s = input.normalize("NFC");
  s = s.replace(LINE_BREAK_RE, "\n");
  s = s.replace(INVISIBLE_RE, "");
  s = s.replace(UNICODE_SPACE_RE, " ");
  s = s.replace(/\uff04/g, "$").replace(/\uff05/g, "%");
  s = s.replace(/ {2,}/g, " ");
  s = s.replace(/ +%/g, "%");
  s = s
    .split("\n")
    .map((line) => line.replace(/^ +| +$/g, ""))
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/^\n+|\n+$/g, "");

  return s;
}

/**
 * Canonicalizes a product title for fingerprinting and slug generation:
 * applies {@link normalizeText}, lowercases, and collapses every run of
 * whitespace (including line breaks) to a single space. The result is a single
 * trimmed line. Idempotent.
 */
export function normalizeTitle(title: string): string {
  const base = normalizeText(title).toLowerCase();
  // Flatten line breaks to single spaces, then re-apply the "no space before a
  // percent sign" rule: collapsing `\n%` (a valid normal form inside
  // `normalizeText`) into ` %` would otherwise break idempotence.
  return base
    .replace(/\s+/g, " ")
    .replace(/ +%/g, "%")
    .trim();
}

/**
 * Query-string keys considered tracking/attribution noise. They are dropped
 * from the canonical destination so the same product reached through different
 * affiliate/UTM parameters yields one identity (R7.2). The affiliate `tag` is
 * dropped here for *identity* purposes only; the stored `affiliate_url`
 * preserves it untouched (R5.6) elsewhere in the pipeline.
 */
const TRACKING_PARAM_RE =
  /^(?:utm_|gclid$|fbclid$|mc_|_branch|aff|tag$|ref$|ref_|linkcode$|creative|ascsubtag$|psc$|th$|smid$|qid$|sr$|keywords$|pd_rd|pf_rd|content-id$|dib|sprefix$|crid$|_encoding$|spm|matt_tool$|tracking_id$|quantity$|source$|si$)/i;

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM_RE.test(key);
}

/**
 * Reduces an affiliate/product URL to a canonical `host + path[?query]` string
 * used as part of the product fingerprint (R7.2): strips the scheme, a leading
 * `www.`, the port and any userinfo, removes trailing slashes, drops
 * tracking/UTM parameters, and lowercases everything for a stable identity.
 *
 * The output is intentionally *not* a parseable URL (no scheme); a second
 * application falls through to the lowercased-string branch and returns the
 * same value, so the function is idempotent.
 */
export function normalizeDestination(rawUrl: string): string {
  const cleaned = normalizeText(rawUrl).replace(/\s+/g, "");
  if (cleaned === "") {
    return "";
  }

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return cleaned.toLowerCase();
  }

  // Only http(s) URLs are treated structurally. An input such as
  // `"WORD:https://..."` parses as an opaque-scheme URL; treating it as a real
  // URL would not be idempotent, so fall back to the lowercased string form.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return cleaned.toLowerCase();
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .map(([key, value]) => [key.toLowerCase(), value] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const query = params.map(([key, value]) => `${key}=${value}`).join("&");
  const base = `${host}${path}`;
  return (query ? `${base}?${query}` : base).toLowerCase();
}
